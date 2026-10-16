// scripts/import-wa-history.ts
// Imports the Coexistence history export downloaded from the 360dialog Hub
// (Channel > number > API Settings > Coexistence Webhooks) into wa_messages.
//
// Run:   npx tsx scripts/import-wa-history.ts <export.json>                      (dry run, counts only)
//        npx tsx scripts/import-wa-history.ts <export.json> --apply              (writes)
//        npx tsx scripts/import-wa-history.ts <export.json> --apply --leads 50   (+ newest 50 chats become leads)
//
// Same rules as the live webhook: history never creates leads. Messages for a
// phone that is already a lead are attached to it; the rest stay unattached
// and the adopt_wa_messages trigger attaches them if that number becomes a lead.
// Upserts on wamid, so re-running is harmless.
//
// --leads N is the one exception, chosen by Mido: the N chats with the newest
// customer message that are not leads yet become NEW leads (source WhatsApp),
// named from the phone's saved contacts when known. Only chats where the
// customer wrote at least once qualify, so broadcasts don't become leads.

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import { readFileSync } from 'fs';
import { parseWebhook, type ParsedMessage } from '../lib/wa-inbound';
import { statusForStage } from '../lib/leads/stageStatus';

config({ path: resolve(process.cwd(), '.env.local') });

const file = process.argv[2];
const apply = process.argv.includes('--apply');
const leadsArg = process.argv.indexOf('--leads');
const newLeads = leadsArg > 0 ? Number(process.argv[leadsArg + 1]) || 0 : 0;
if (!file) {
  console.error('Usage: npx tsx scripts/import-wa-history.ts <export.json> [--apply]');
  process.exit(1);
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

// Meta could not export these; they carry no content.
const SKIP_TYPES = new Set(['errors', 'edit', 'bot_feedback']);

async function main() {
  const events = JSON.parse(readFileSync(file, 'utf-8')) as Array<{ event: string; data: any }>; // eslint-disable-line @typescript-eslint/no-explicit-any

  // Names saved on the phone, from the smb_app_state_sync events.
  const names = new Map<string, string>();
  for (const e of events) {
    if (e.event !== 'smb_app_state_sync') continue;
    for (const s of e.data?.state_sync ?? []) {
      const c = s?.contact;
      if (s?.type === 'contact' && c?.phone_number && c?.full_name) names.set(String(c.phone_number).replace(/\D/g, ''), c.full_name);
    }
  }

  const all: ParsedMessage[] = [];
  for (const e of events) {
    if (e.event !== 'history') continue;
    // The export holds the bare webhook values; wrap them the way Meta sends them.
    const payload = { object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'history', value: e.data }] }] };
    all.push(...parseWebhook(payload).messages);
  }
  const msgs = all.filter((m) => !SKIP_TYPES.has(m.msgType));
  for (const m of msgs) {
    if (m.msgType === 'media_placeholder') m.body = '📎 وسائط (مش متاحة في الأرشيف)';
  }

  // phone_normalized → lead id, paged past the 1000-row cap.
  const leads = new Map<string, string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('leads').select('id, phone_normalized').not('phone_normalized', 'is', null).range(from, from + 999);
    if (error) throw error;
    for (const l of data ?? []) leads.set(l.phone_normalized as string, l.id as string);
    if (!data || data.length < 1000) break;
  }

  const phones = new Set(msgs.map((m) => m.customerPhone));
  const matchedPhones = Array.from(phones).filter((p) => leads.has(p));
  const matchedMsgs = msgs.filter((m) => leads.has(m.customerPhone));
  const span = msgs.map((m) => m.sentAt).sort();

  console.log(`events: ${events.length}, parsed: ${all.length}, kept: ${msgs.length} (skipped ${all.length - msgs.length} empty)`);
  console.log(`span: ${span[0]} → ${span[span.length - 1]}`);
  console.log(`chats: ${phones.size}, already leads: ${matchedPhones.length} (${matchedMsgs.length} msgs attach to them)`);
  console.log(`in: ${msgs.filter((m) => m.direction === 'in').length}, out: ${msgs.filter((m) => m.direction === 'out').length}`);

  // Newest customer message per chat, for --leads.
  const lastIn = new Map<string, string>();
  for (const m of msgs) {
    if (m.direction !== 'in' || leads.has(m.customerPhone) || m.customerPhone === m.businessPhone) continue;
    if ((lastIn.get(m.customerPhone) ?? '') < m.sentAt) lastIn.set(m.customerPhone, m.sentAt);
  }
  const picked = Array.from(lastIn.entries()).sort((a, b) => b[1].localeCompare(a[1])).slice(0, newLeads);
  if (newLeads) {
    console.log(`
new leads (${picked.length}), newest customer message first:`);
    for (const [p, at] of picked) console.log(`  +${p}  ${at.slice(0, 16)}  ${names.get(p) ?? '—'}`);
  }

  if (!apply) {
    console.log('\nDry run. Nothing written. Add --apply to import.');
    return;
  }

  if (picked.length) {
    const { data: admin, error: orgErr } = await db.from('profiles').select('org_id').eq('role', 'admin').not('org_id', 'is', null).limit(1).single();
    if (orgErr || !admin) throw orgErr ?? new Error('no admin profile with org_id');
    const now = new Date().toISOString();
    const country = msgs[0].country;
    const { data: created, error } = await db
      .from('leads')
      .insert(
        picked.map(([p, at]) => ({
          name: names.get(p) || 'عميل واتساب',
          phone: '+' + p,
          phone_normalized: p,
          source: 'WhatsApp',
          pipeline_stage: 'NEW',
          status: statusForStage('NEW'),
          stage_timestamps: { NEW: now },
          notes: `من أرشيف واتساب (آخر رسالة من العميل ${at.slice(0, 10)})`,
          org_id: admin.org_id,
          country,
        })),
      )
      .select('id, phone_normalized');
    if (error) throw error;
    for (const l of created ?? []) leads.set(l.phone_normalized as string, l.id as string);
    console.log(`created ${created?.length ?? 0} leads`);
  }

  let done = 0;
  for (let i = 0; i < msgs.length; i += 200) {
    const rows = msgs.slice(i, i + 200).map((m) => ({
      wamid: m.wamid,
      lead_id: leads.get(m.customerPhone) ?? null,
      business_phone: m.businessPhone,
      phone_number_id: m.phoneNumberId,
      customer_phone: m.customerPhone,
      direction: m.direction,
      origin: m.origin,
      msg_type: m.msgType,
      body: m.body,
      media_id: m.mediaId,
      referral: m.referral,
      sent_at: m.sentAt,
      country: m.country,
      raw: m.raw,
    }));
    const { error } = await db.from('wa_messages').upsert(rows, { onConflict: 'wamid', ignoreDuplicates: true });
    if (error) throw error;
    done += rows.length;
    process.stdout.write(`\rimported ${done}/${msgs.length}`);
  }
  console.log('\nDone.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
