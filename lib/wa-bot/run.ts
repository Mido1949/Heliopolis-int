import Anthropic from '@anthropic-ai/sdk';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { BOT_SYSTEM_PROMPT } from './prompt';
import { checkReply } from './guard';

/**
 * The WhatsApp reply bot (Egypt number only).
 *
 * When it speaks, decided with Mido on 2026-10-17:
 *  - instantly to a new customer (nobody from the team has written to them yet),
 *  - instantly at night / on Friday, unless a rep wrote in the last 30 minutes,
 *  - otherwise only when a customer message sat 10 minutes with no reply (the sweep).
 * A rep's reply always wins: the bot only answers a customer message that is
 * still the last word in the chat. The per-lead switch, the bot's own snooze
 * after a handoff, and the global switch all silence it.
 */

export const BOT_PHONE = process.env.WA_360_BUSINESS_PHONE || '201006600259';
const D360 = 'https://waba-v2.360dialog.io';
const MODEL = process.env.WA_BOT_MODEL || 'claude-haiku-4-5-20251001';
const WINDOW_MS = 24 * 60 * 60 * 1000;
export const SWEEP_AFTER_MS = 10 * 60 * 1000;
const REP_ACTIVE_MS = 30 * 60 * 1000;
const SNOOZE_MS = 12 * 60 * 60 * 1000;
const HISTORY = 30;

export type Trigger = 'inbound' | 'sweep';

interface Msg {
  wamid: string;
  direction: 'in' | 'out';
  origin: string;
  is_bot: boolean;
  msg_type: string;
  body: string | null;
  sent_at: string;
}

let _db: SupabaseClient | null = null;
function db(): SupabaseClient {
  if (!_db) _db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  return _db;
}

/** Team working hours, Cairo time: Saturday–Thursday 10:00–18:00. */
export function isWorkingHours(at: Date): boolean {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Cairo', weekday: 'short', hour: '2-digit', hour12: false,
  }).formatToParts(at);
  const day = parts.find((p) => p.type === 'weekday')?.value;
  const hour = Number(parts.find((p) => p.type === 'hour')?.value);
  return day !== 'Fri' && hour >= 10 && hour < 18;
}

/** A message a person on the team wrote (phone app, or the CRM reply box). */
function isRep(m: Msg): boolean {
  return m.direction === 'out' && !m.is_bot && (m.origin === 'app' || m.origin === 'api');
}

/**
 * Pure decision: should the bot answer the latest customer message now?
 * Exported for tests.
 */
export function decide(msgs: Msg[], trigger: Trigger, now: Date): { reply: boolean; why: string } {
  const last = msgs[msgs.length - 1];
  if (!last || last.direction !== 'in') return { reply: false, why: 'آخر رسالة مش من العميل' };
  const age = now.getTime() - new Date(last.sent_at).getTime();
  if (age > WINDOW_MS) return { reply: false, why: 'برّه الـ 24 ساعة' };

  const reps = msgs.filter(isRep);
  const lastRep = reps[reps.length - 1];
  if (reps.length === 0) return { reply: true, why: 'عميل جديد' };

  const repRecent = now.getTime() - new Date(lastRep.sent_at).getTime() < REP_ACTIVE_MS;
  if (!isWorkingHours(now) && !repRecent) return { reply: true, why: 'برّه مواعيد الشغل' };
  if (trigger === 'sweep' && age >= SWEEP_AFTER_MS) return { reply: true, why: '10 دقايق من غير رد' };
  return { reply: false, why: 'مستني رد الفريق' };
}

/**
 * Answer one customer if the rules say so. Safe to call more than once for the
 * same message: the run row's unique key lets only one caller through.
 */
export async function maybeReply(customerPhone: string, trigger: Trigger): Promise<string> {
  const { data: settings } = await db().from('wa_bot_settings').select('enabled').eq('id', 1).maybeSingle();
  if (!settings?.enabled) return 'off';

  const { data: lead } = await db()
    .from('leads')
    .select('id, name, region, client_type, project_description, project_capacity, notes, country, org_id, assigned_to_user, bot_paused, bot_snooze_until, archived_at')
    .eq('phone_normalized', customerPhone)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!lead || lead.archived_at) return 'no-lead';
  if (lead.country === 'SA') return 'saudi';
  if (lead.bot_paused) return 'paused';
  if (lead.bot_snooze_until && new Date(lead.bot_snooze_until) > new Date()) return 'snoozed';

  const { data: rows } = await db()
    .from('wa_messages')
    .select('wamid, direction, origin, is_bot, msg_type, body, sent_at')
    .eq('customer_phone', customerPhone)
    .eq('business_phone', BOT_PHONE)
    .order('sent_at', { ascending: false })
    .limit(HISTORY);
  const msgs = ((rows ?? []) as Msg[]).reverse();
  const verdict = decide(msgs, trigger, new Date());
  if (!verdict.reply) return verdict.why;

  const target = msgs[msgs.length - 1];
  // Claim the message first; a second caller hits the unique key and stops.
  const { error: claimErr } = await db().from('wa_bot_runs').insert({
    answered_wamid: target.wamid, lead_id: lead.id, customer_phone: customerPhone,
    trigger, outcome: 'claimed', reason: verdict.why, model: MODEL,
  });
  if (claimErr) return 'already-claimed';

  try {
    const out = await compose(msgs, lead);
    const verdictText = checkReply(out.text);
    if (!verdictText.ok) {
      await finish(target.wamid, { outcome: 'blocked', reply: out.text, escalated: true, reason: verdictText.reason, ...out.usage });
      await handOff(lead, `البوت وقف رد فيه «${verdictText.reason}» — محتاج رد من الفريق`);
      return 'blocked';
    }

    // The customer may have written again, or a rep answered, while we thought.
    const { data: newer } = await db()
      .from('wa_messages')
      .select('wamid')
      .eq('customer_phone', customerPhone)
      .eq('business_phone', BOT_PHONE)
      .gt('sent_at', target.sent_at)
      .limit(1);
    if (newer?.length) {
      await finish(target.wamid, { outcome: 'failed', reply: out.text, reason: 'وصلت رسالة أحدث', ...out.usage });
      return 'superseded';
    }

    const wamid = await send(customerPhone, out.text);
    await db().from('wa_messages').insert({
      wamid, lead_id: lead.id, business_phone: BOT_PHONE, customer_phone: customerPhone,
      direction: 'out', origin: 'api', is_bot: true, msg_type: 'text', body: out.text,
      status: 'sent', sent_at: new Date().toISOString(), country: 'EG',
    });
    await finish(target.wamid, { outcome: 'sent', reply: out.text, escalated: out.handoff, reason: out.complaint ?? verdict.why, ...out.usage });
    await saveFacts(lead, out.facts);

    if (out.complaint) await logComplaint(lead, out.complaint, out.summary);
    if (out.handoff) {
      await handOff(lead, out.complaint
        ? `شكوى درجة ${out.complaint} من واتساب — ${out.summary ?? ''}`
        : `البوت سلّم المحادثة — ${out.summary ?? 'محتاج متابعة'}`);
    }
    return 'sent';
  } catch (err) {
    console.error('[wa-bot] reply failed', customerPhone, err);
    await finish(target.wamid, { outcome: 'failed', reason: String(err).slice(0, 300) });
    return 'failed';
  }
}

interface Composed {
  text: string;
  handoff: boolean;
  complaint: 'A' | 'B' | 'C' | 'D' | null;
  summary: string | null;
  facts: { name?: string; area?: string; place_type?: string; size?: string };
  usage: { input_tokens?: number; output_tokens?: number };
}

const REPLY_TOOL: Anthropic.Tool = {
  name: 'reply',
  description: 'The WhatsApp message to send to the customer, plus what the team needs to know.',
  input_schema: {
    type: 'object',
    properties: {
      message: { type: 'string', description: 'نص الرسالة للعميل بالعامية المصرية' },
      handoff: { type: 'boolean', description: 'true لو المحادثة محتاجة حد من الفريق دلوقتي' },
      complaint_level: { type: ['string', 'null'], enum: ['A', 'B', 'C', 'D', null], description: 'درجة الشكوى، أو null لو مش شكوى' },
      summary: { type: ['string', 'null'], description: 'سطر للفريق: العميل عايز إيه / المشكلة إيه' },
      facts: {
        type: 'object',
        description: 'بيانات قالها العميل صراحةً في المحادثة بس',
        properties: {
          name: { type: 'string' }, area: { type: 'string' },
          place_type: { type: 'string' }, size: { type: 'string' },
        },
      },
    },
    required: ['message', 'handoff', 'complaint_level', 'summary'],
  },
};

export async function compose(msgs: Msg[], lead: Record<string, unknown>): Promise<Composed> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const known = [
    lead.name && lead.name !== 'عميل واتساب' ? `الاسم: ${lead.name}` : null,
    lead.region ? `المنطقة: ${lead.region}` : null,
    lead.project_description ? `المشروع: ${lead.project_description}` : null,
    lead.project_capacity ? `الحجم: ${lead.project_capacity}` : null,
  ].filter(Boolean).join(' · ');

  // The chat as alternating turns; consecutive same-side messages are merged.
  const turns: Anthropic.MessageParam[] = [];
  for (const m of msgs) {
    const role = m.direction === 'in' ? 'user' : 'assistant';
    const who = m.direction === 'out' && !m.is_bot ? '[موظف من الفريق] ' : '';
    const text = `${who}${m.body || `[${m.msg_type}]`}`;
    const prev = turns[turns.length - 1];
    if (prev && prev.role === role) prev.content = `${prev.content}\n${text}`;
    else turns.push({ role, content: text });
  }
  while (turns.length && turns[0].role !== 'user') turns.shift();

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 600,
    system: `${BOT_SYSTEM_PROMPT}\n\n## اللي نعرفه عن العميل ده من الـ CRM\n${known || 'لسه مفيش بيانات.'}`,
    tools: [REPLY_TOOL],
    tool_choice: { type: 'tool', name: 'reply' },
    messages: turns,
  });
  const block = res.content.find((b) => b.type === 'tool_use');
  const input = (block && block.type === 'tool_use' ? block.input : {}) as {
    message?: string; handoff?: boolean; complaint_level?: Composed['complaint']; summary?: string | null; facts?: Composed['facts'];
  };
  const text = (input.message ?? '').trim();
  if (!text) throw new Error('empty reply from model');
  return {
    text,
    handoff: Boolean(input.handoff),
    complaint: input.complaint_level ?? null,
    summary: input.summary ?? null,
    facts: input.facts ?? {},
    usage: { input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens },
  };
}

async function send(to: string, text: string): Promise<string> {
  const res = await fetch(`${D360}/messages`, {
    method: 'POST',
    headers: { 'D360-API-KEY': process.env.D360_API_KEY!, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { body: text } }),
  });
  const out = await res.json().catch(() => ({}));
  const wamid: string | undefined = out?.messages?.[0]?.id;
  if (!res.ok || !wamid) throw new Error(`360dialog ${res.status}: ${JSON.stringify(out).slice(0, 300)}`);
  return wamid;
}

async function finish(wamid: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await db().from('wa_bot_runs').update(patch).eq('answered_wamid', wamid);
  if (error) console.error('[wa-bot] run log failed', wamid, error);
}

/** Fill only empty lead fields with what the customer said; never overwrite a rep's data. */
async function saveFacts(lead: Record<string, unknown>, f: Composed['facts']): Promise<void> {
  const patch: Record<string, string> = {};
  if (f.name && (!lead.name || lead.name === 'عميل واتساب')) patch.name = f.name.slice(0, 80);
  if (f.area && !lead.region) patch.region = f.area.slice(0, 80);
  const project = [f.place_type, f.size].filter(Boolean).join(' — ');
  if (project && !lead.project_description) patch.project_description = project.slice(0, 200);
  if (f.size && !lead.project_capacity) patch.project_capacity = f.size.slice(0, 80);
  if (Object.keys(patch).length === 0) return;
  const { error } = await db().from('leads').update(patch).eq('id', lead.id as string);
  if (error) console.error('[wa-bot] save facts failed', lead.id, error);
}

async function logComplaint(lead: Record<string, unknown>, level: string, summary: string | null): Promise<void> {
  const { error } = await db().from('lead_activities').insert({
    lead_id: lead.id, user_id: null, type: 'note',
    body: `شكوى — درجة ${level} (سجّلها بوت واتساب)\n${summary ?? ''}`.trim(),
    org_id: lead.org_id, country: 'EG',
  });
  if (error) console.error('[wa-bot] complaint note failed', lead.id, error);
}

/**
 * Tell the team, and keep the bot quiet on this chat for 12 hours so it does
 * not talk over the rep who picks it up.
 */
async function handOff(lead: Record<string, unknown>, title: string): Promise<void> {
  await db().from('leads').update({ bot_snooze_until: new Date(Date.now() + SNOOZE_MS).toISOString() }).eq('id', lead.id as string);

  let userIds: string[] = [];
  if (lead.assigned_to_user) userIds = [lead.assigned_to_user as string];
  else {
    const { data } = await db().from('profiles').select('id').in('role', ['admin', 'Manager', 'CS Team Leader', 'Tech Team Leader']);
    userIds = (data ?? []).map((p) => p.id as string);
  }
  if (userIds.length === 0) return;
  const { error } = await db().from('notifications').insert(userIds.map((id) => ({
    user_id: id, title: `${title} — ${lead.name ?? ''}`.slice(0, 300), type: 'escalation',
    reference_id: lead.id, reference_type: 'lead', org_id: lead.org_id,
  })));
  if (error) console.error('[wa-bot] handoff notify failed', lead.id, error);
}

/** Every customer whose last message has waited 10+ minutes without any reply. */
export async function sweep(): Promise<{ checked: number; results: Record<string, string> }> {
  const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const { data } = await db()
    .from('wa_messages')
    .select('customer_phone, direction, sent_at')
    .eq('business_phone', BOT_PHONE)
    .gte('sent_at', since)
    .order('sent_at', { ascending: true });
  const lastBy = new Map<string, { direction: string; sent_at: string }>();
  for (const r of data ?? []) lastBy.set(r.customer_phone as string, r as { direction: string; sent_at: string });

  const due = Array.from(lastBy.entries())
    .filter(([, m]) => m.direction === 'in' && Date.now() - new Date(m.sent_at).getTime() >= SWEEP_AFTER_MS)
    .map(([phone]) => phone);
  const results: Record<string, string> = {};
  for (const phone of due) results[phone] = await maybeReply(phone, 'sweep');
  return { checked: due.length, results };
}
