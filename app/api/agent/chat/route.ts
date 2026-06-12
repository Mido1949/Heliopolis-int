import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { loadSystemApprovalContext } from '@/lib/system-approval/loader';

const FALLBACKS = [
  'أهلاً! أنا هيليو، مساعدك في HelioMax. اسألني أي حاجة! 👋',
  'يلا نشتغل! إيه اللي محتاج تعمله النهاردة؟ 💪',
  'أنا هيليو — هنا لو محتاج مساعدة. اكتب سؤالك! 😊',
];

// T074: intent patterns for AI re-assignment
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

    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { count } = await serviceClient
      .from('agent_requests')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', fiveMinAgo);

    const limit = profile?.role === 'admin' ? 120 : 30;
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

    // T074: detect assign intent on the latest user message
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
        // Get auth context and call assign endpoint
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
        if (user) {
          const baseUrl = request.nextUrl.origin;
          const assignRes = await fetch(`${baseUrl}/api/automation/assign`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ''}`,
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
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({
        content: FALLBACKS[Math.floor(Math.random() * FALLBACKS.length)],
      });
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // T018: enrich system prompt with company knowledge base (if any .md files exist)
    const knowledgeBase = loadSystemApprovalContext();
    const enrichedSystem = (system || '') + knowledgeBase;

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 120,
      system: enrichedSystem,
      messages,
    });

    const content =
      response.content[0]?.type === 'text' ? response.content[0].text : 'عذراً، مش فاهم!';

    return NextResponse.json({ content });
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status;
    const msg = (err as { message?: string })?.message || String(err);
    console.error('[helio-agent] status=%s msg=%s', status, msg);
    return NextResponse.json({ content: 'عندي مشكلة في الاتصال دلوقتي! 😅' });
  }
}
