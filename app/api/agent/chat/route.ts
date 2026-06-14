import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { loadSystemApprovalContext } from '@/lib/system-approval/loader';
import { toolsForRole, executeTool, type ToolContext } from '@/lib/agent/tools';

const FALLBACKS = [
  'أهلاً! أنا هيليو، مساعدك في HelioMax. اسألني أي حاجة! 👋',
  'يلا نشتغل! إيه اللي محتاج تعمله النهاردة؟ 💪',
  'أنا هيليو — هنا لو محتاج مساعدة. اكتب سؤالك! 😊',
];

// Models: Sonnet drives the tool-use loop; Haiku is the no-tools fallback.
const PRIMARY_MODEL = 'claude-sonnet-4-6';
const FALLBACK_MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOOL_ITERATIONS = 6;

// T074: intent patterns for AI re-assignment (fast-path shortcuts before the LLM loop)
const ASSIGN_TECH_PATTERNS = [
  /assign\s+to\s+tech/i,
  /أرسل\s+للتقني/,
  /ابعث\s+للفريق\s+التقني/,
  /نقل\s+للتقني/,
];
const ASSIGN_CS_PATTERNS = [
  /assign\s+to\s+cs/i,
  /أرسل\s+للمبيعات/,
  /ارجع\s+للمبيعات/,
  /نقل\s+للمبيعات/,
];

// Stage 2: register_lead intent — triggers a guided lead creation flow
const REGISTER_LEAD_PATTERNS = [
  /سجّل\s+عميل/,
  /سجل\s+عميل/,
  /اضف\s+عميل/,
  /أضف\s+عميل/,
  /عميل\s+جديد/,
  /register\s+(a\s+)?(new\s+)?client/i,
  /new\s+client/i,
  /add\s+(a\s+)?(new\s+)?(client|lead)/i,
  /سجّل\s+ليد/,
  /سجل\s+ليد/,
];

// Ordered lead creation questions (front-end tracks state, this is the source of truth for copy)
const LEAD_STEPS: { key: string; question: string }[] = [
  { key: 'name',         question: 'تمام! ✨ إيه اسم العميل؟' },
  { key: 'phone',        question: 'رقم تليفونه كام؟ (مع كود الدولة لو بره مصر)' },
  { key: 'region',       question: 'منطقة العميل فين؟ (Cairo / Alexandria / Riyadh / Jeddah / Other)' },
  { key: 'project_type', question: 'نوع المشروع إيه؟ (مثلاً: شقة، فيلا، مكتب، محل، …)' },
  { key: 'source',       question: 'العميل ده جه منين؟ (WhatsApp / Meta / Direct / Phone)' },
  { key: 'budget_range', question: 'الميزانية التقريبية كام؟ (مثلاً: 50,000 EGP أو 2000 USD)' },
];

export async function POST(request: NextRequest) {
  try {
    // ── Auth check ──
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) { return cookieStore.get(name)?.value; },
          set(name: string, value: string, options: CookieOptions) {
            try { cookieStore.set({ name, value, ...options }); } catch { /* noop */ }
          },
          remove(name: string, options: CookieOptions) {
            try { cookieStore.set({ name, value: '', ...options }); } catch { /* noop */ }
          },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { messages, system, leadContext } = await request.json();

    // ── Rate limiting ──
    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    await serviceClient.from('agent_requests').insert({ user_id: user.id });

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    const callerRole = profile?.role || 'member';

    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { count } = await serviceClient
      .from('agent_requests')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', fiveMinAgo);

    const limit = callerRole === 'admin' ? 120 : 30;
    if (count && count > limit) {
      return NextResponse.json({
        content: '⏳ معلش، وصلت للحد الأقصى من الرسايل دلوقتي. جرب تاني بعد شوية.',
      });
    }

    // Opportunistic cleanup (fire-and-forget)
    serviceClient
      .from('agent_requests')
      .delete()
      .lt('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
      .then(() => {}, () => {});

    // ── Fast-path intents (skip the LLM loop for deterministic actions) ──
    const latest = messages?.[messages.length - 1];
    if (latest && latest.role === 'user' && typeof latest.content === 'string') {
      const text = latest.content;

      const wantsTech = ASSIGN_TECH_PATTERNS.some(p => p.test(text));
      const wantsCS = ASSIGN_CS_PATTERNS.some(p => p.test(text));
      const wantsRegisterLead = REGISTER_LEAD_PATTERNS.some(p => p.test(text));

      // Stage 2: start a guided lead creation flow
      if (wantsRegisterLead) {
        return NextResponse.json({
          action: 'register_lead_start',
          flow: 'register_lead',
          step: 0,
          totalSteps: LEAD_STEPS.length,
          nextQuestion: LEAD_STEPS[0].question,
          fieldKey: LEAD_STEPS[0].key,
          content: `تمام! خليني أسجّل عميل جديد 📝\n${LEAD_STEPS[0].question}`,
        });
      }

      if ((wantsTech || wantsCS) && leadContext?.lead_id) {
        const baseUrl = request.nextUrl.origin;
        const accessToken = (await supabase.auth.getSession()).data.session?.access_token || '';
        const assignRes = await fetch(`${baseUrl}/api/automation/assign`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            lead_id: leadContext.lead_id,
            to_team: wantsTech ? 'tech' : 'cs',
            message: text,
          }),
        });
        const assignData = await assignRes.json();
        if (assignRes.ok) {
          return NextResponse.json({
            content: wantsTech
              ? `✅ تم تحويل الليد "${assignData.lead.name}" للفريق التقني وإخطار العضو المعيّن.`
              : `✅ تم إرجاع الليد "${assignData.lead.name}" لفريق المبيعات.`,
          });
        } else {
          return NextResponse.json({
            content: `❌ فشل التحويل: ${assignData.error || 'خطأ غير معروف'}`,
          });
        }
      }
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({
        content: FALLBACKS[Math.floor(Math.random() * FALLBACKS.length)],
      });
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // T018: enrich system prompt with company knowledge base (if any .md files exist)
    const knowledgeBase = loadSystemApprovalContext();
    const leadHint = leadContext?.lead_id
      ? `\n\nالليد المعروض حالياً: id=${leadContext.lead_id}${leadContext.name ? ` (${leadContext.name})` : ''}.`
      : '';
    const enrichedSystem = (system || '') + knowledgeBase + leadHint;

    // ── Tool-use loop (Sonnet) ──
    const toolDefs = toolsForRole(callerRole).map(({ name, description, input_schema }) => ({
      name,
      description,
      input_schema,
    }));

    const toolCtx: ToolContext = {
      callerClient: supabase,
      serviceClient,
      callerId: user.id,
      callerRole,
      origin: 'chat',
    };

    // Working copy of the conversation we extend with tool turns.
    const convo: Anthropic.MessageParam[] = (messages || []).map(
      (m: { role: 'user' | 'assistant'; content: string }) => ({ role: m.role, content: m.content })
    );

    try {
      let finalText = '';
      const executedActions: { tool: string; ok: boolean }[] = [];

      for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
        const response: Anthropic.Message = await client.messages.create({
          model: PRIMARY_MODEL,
          max_tokens: 2048,
          system: enrichedSystem,
          tools: toolDefs,
          messages: convo,
        });

        // Collect any assistant text from this turn.
        const textParts = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map(b => b.text);
        if (textParts.length) finalText = textParts.join('\n').trim();

        if (response.stop_reason !== 'tool_use') {
          break;
        }

        // Append the assistant turn (with tool_use blocks) verbatim.
        convo.push({ role: 'assistant', content: response.content });

        // Execute every requested tool, building tool_result blocks.
        const toolUses = response.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
        );
        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const tu of toolUses) {
          let resultText: string;
          let isError = false;
          try {
            resultText = await executeTool(
              tu.name,
              (tu.input as Record<string, unknown>) || {},
              toolCtx
            );
          } catch (toolErr) {
            isError = true;
            resultText = (toolErr as { message?: string })?.message || 'خطأ في تنفيذ الأداة.';
          }
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tu.id,
            content: resultText,
            is_error: isError,
          });
          executedActions.push({ tool: tu.name, ok: !isError });
        }

        convo.push({ role: 'user', content: toolResults });
        // Loop again so the model can react to the tool results.
      }

      return NextResponse.json({
        content: finalText || 'تمام ✅',
        ...(executedActions.length ? { actions: executedActions } : {}),
      });
    } catch (loopErr) {
      // ── Haiku fallback (no tools) ──
      const status = (loopErr as { status?: number })?.status;
      console.error('[helio-agent] sonnet loop failed status=%s; falling back to haiku', status);
      const fb = await client.messages.create({
        model: FALLBACK_MODEL,
        max_tokens: 400,
        system: enrichedSystem,
        messages: (messages || []).map((m: { role: 'user' | 'assistant'; content: string }) => ({
          role: m.role,
          content: m.content,
        })),
      });
      const content =
        fb.content[0]?.type === 'text' ? fb.content[0].text : 'عذراً، مش فاهم!';
      return NextResponse.json({ content });
    }
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status;
    const msg = (err as { message?: string })?.message || String(err);
    console.error('[helio-agent] status=%s msg=%s', status, msg);
    return NextResponse.json({ content: 'عندي مشكلة في الاتصال دلوقتي! 😅' });
  }
}
