import { normalizePhone } from '@/lib/phone';

/**
 * Pure parsing of WhatsApp Cloud API webhook payloads into flat message rows.
 *
 * The same payload arrives whether Meta calls us directly or 360dialog relays
 * it, so nothing here is provider-specific. Three change fields matter:
 *   messages            customer → us (plus delivery `statuses` for our sends)
 *   smb_message_echoes  rep → customer, sent from the Business app / Web
 *   history             one-time 180-day backfill after Coexistence onboarding
 * Anything else is ignored. No I/O here, so the route stays thin.
 */

export type Direction = 'in' | 'out';
export type Origin = 'customer' | 'app' | 'api' | 'history';

export interface ParsedMessage {
  wamid: string;
  businessPhone: string;
  phoneNumberId: string | null;
  customerPhone: string;
  customerName: string | null;
  direction: Direction;
  origin: Origin;
  msgType: string;
  body: string | null;
  mediaId: string | null;
  referral: Record<string, unknown> | null;
  sentAt: string;
  country: 'EG' | 'SA';
  raw: unknown;
}

export interface ParsedStatus {
  wamid: string;
  status: string;
}

export interface ParsedPayload {
  messages: ParsedMessage[];
  statuses: ParsedStatus[];
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

/** Our number decides the market: +966 is the Saudi book, everything else Egypt. */
export function countryForBusinessPhone(digits: string): 'EG' | 'SA' {
  return digits.startsWith('966') ? 'SA' : 'EG';
}

function digitsOf(raw: unknown): string {
  if (typeof raw !== 'string' && typeof raw !== 'number') return '';
  const s = String(raw);
  return normalizePhone(s.startsWith('+') ? s : '+' + s.replace(/\D/g, '')) ?? s.replace(/\D/g, '');
}

function tsToIso(ts: unknown): string {
  const n = Number(ts);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : new Date().toISOString();
}

/** Human-readable text for any message type, so the CRM thread never shows blanks. */
export function bodyOf(m: Any): { body: string | null; mediaId: string | null } {
  const t = m?.type;
  const media = t && m?.[t] && typeof m[t] === 'object' ? m[t] : null;
  switch (t) {
    case 'text':
      return { body: m.text?.body ?? null, mediaId: null };
    case 'image':
    case 'video':
    case 'document':
    case 'audio':
    case 'sticker': {
      const labels: Record<string, string> = { image: '📷 صورة', video: '🎬 فيديو', document: '📄 ملف', audio: '🎤 رسالة صوتية', sticker: 'ملصق' };
      const label = labels[t as string];
      const extra = media?.caption || media?.filename || '';
      return { body: extra ? `${label} — ${extra}` : label, mediaId: media?.id ?? null };
    }
    case 'location':
      return { body: `📍 موقع: ${m.location?.name ?? ''} ${m.location?.latitude},${m.location?.longitude}`.trim(), mediaId: null };
    case 'contacts':
      return { body: '👤 جهة اتصال', mediaId: null };
    case 'button':
      return { body: m.button?.text ?? null, mediaId: null };
    case 'interactive':
      return {
        body: m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? 'رد تفاعلي',
        mediaId: null,
      };
    case 'reaction':
      return { body: `تفاعل ${m.reaction?.emoji ?? ''}`.trim(), mediaId: null };
    case 'template':
      return { body: 'رسالة قالب (Template)', mediaId: null };
    default:
      return { body: t ? `[${t}]` : null, mediaId: null };
  }
}

function row(
  m: Any,
  meta: { businessPhone: string; phoneNumberId: string | null },
  customerRaw: unknown,
  direction: Direction,
  origin: Origin,
  customerName: string | null,
): ParsedMessage | null {
  const customerPhone = digitsOf(customerRaw);
  if (!m?.id || !customerPhone) return null;
  const { body, mediaId } = bodyOf(m);
  return {
    wamid: String(m.id),
    businessPhone: meta.businessPhone,
    phoneNumberId: meta.phoneNumberId,
    customerPhone,
    customerName,
    direction,
    origin,
    msgType: m.type ?? 'unknown',
    body,
    mediaId,
    referral: m.referral ?? null,
    sentAt: tsToIso(m.timestamp),
    country: countryForBusinessPhone(meta.businessPhone),
    raw: m,
  };
}

export function parseWebhook(payload: Any): ParsedPayload {
  const out: ParsedPayload = { messages: [], statuses: [] };
  if (payload?.object !== 'whatsapp_business_account') return out;

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change?.value ?? {};
      const meta = {
        businessPhone: digitsOf(v.metadata?.display_phone_number),
        phoneNumberId: v.metadata?.phone_number_id ?? null,
      };
      if (!meta.businessPhone) continue;

      if (change.field === 'messages') {
        const names = new Map<string, string>();
        for (const c of v.contacts ?? []) {
          if (c?.wa_id && c?.profile?.name) names.set(digitsOf(c.wa_id), c.profile.name);
        }
        for (const m of v.messages ?? []) {
          const p = row(m, meta, m.from, 'in', 'customer', names.get(digitsOf(m.from)) ?? null);
          if (p) out.messages.push(p);
        }
        for (const s of v.statuses ?? []) {
          if (s?.id && s?.status) out.statuses.push({ wamid: String(s.id), status: String(s.status) });
        }
      } else if (change.field === 'smb_message_echoes') {
        for (const m of v.message_echoes ?? []) {
          const p = row(m, meta, m.to, 'out', 'app', null);
          if (p) out.messages.push(p);
        }
      } else if (change.field === 'history') {
        for (const h of v.history ?? []) {
          for (const thread of h.threads ?? []) {
            for (const m of thread.messages ?? []) {
              // In history both sides share one list; our number marks our own sends.
              const ours = digitsOf(m.from) === meta.businessPhone;
              const p = row(m, meta, ours ? (m.to ?? thread.id) : m.from, ours ? 'out' : 'in', 'history', null);
              if (p) out.messages.push(p);
            }
          }
        }
      }
    }
  }
  return out;
}
