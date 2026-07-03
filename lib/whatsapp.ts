import type { PipelineStage } from '@/types';
import { normalizePhone } from '@/lib/phone';

/**
 * Stage-aware WhatsApp message templates (spec 005 US3 / FR-007).
 *
 * Fully manual: these only PRE-FILL the message a human chooses to send — the
 * app never sends anything on its own. Arabic-first (the primary UI language).
 * Templates live here in one editable place (no DB, no API for v1).
 */

export type WhatsAppTemplateKey =
  | 'welcome'
  | 'follow_up'
  | 'quote_sent'
  | 'price_objection'
  | 'generic';

export interface WhatsAppTemplate {
  key: WhatsAppTemplateKey;
  labelAr: string;
  /** Build the message body. `firstName` may be '' → uses a neutral greeting. */
  build: (firstName: string) => string;
}

/** Neutral-safe greeting: "أهلاً محمد" when a name exists, else just "أهلاً". */
function greet(firstName: string): string {
  return firstName ? `أهلاً ${firstName}` : 'أهلاً';
}

export const WHATSAPP_TEMPLATES: readonly WhatsAppTemplate[] = [
  {
    key: 'welcome',
    labelAr: '👋 ترحيب',
    build: (n) =>
      `${greet(n)} 👋\nمعك فريق HelioMax لحلول التكييف والتبريد. سعدنا بتواصلك معنا، كيف نقدر نخدمك؟`,
  },
  {
    key: 'follow_up',
    labelAr: '🔄 متابعة',
    build: (n) =>
      `${greet(n)} 🙏\nنتابع معك بخصوص استفسارك عن أنظمة التكييف لدى HelioMax. هل لديك أي أسئلة نقدر نساعدك فيها؟`,
  },
  {
    key: 'quote_sent',
    labelAr: '📤 عرض السعر',
    build: (n) =>
      `${greet(n)} 🙏\nأرسلنا لك عرض السعر الخاص بمشروعك من HelioMax. هل أتيحت لك فرصة الاطلاع عليه؟ يسعدنا الإجابة على أي استفسار.`,
  },
  {
    key: 'price_objection',
    labelAr: '🤝 تفاوض / السعر',
    build: (n) =>
      `${greet(n)} 🤝\nنقدّر اهتمامك بعرض HelioMax. نحب نناقش معك التفاصيل ونوصل لأفضل حل يناسب ميزانيتك ومتطلبات مشروعك.`,
  },
  {
    key: 'generic',
    labelAr: '💬 رسالة عامة',
    build: (n) => `${greet(n)} 👋\nمعك فريق HelioMax. كيف نقدر نخدمك اليوم؟`,
  },
] as const;

const TEMPLATE_BY_KEY: Record<WhatsAppTemplateKey, WhatsAppTemplate> =
  WHATSAPP_TEMPLATES.reduce((acc, t) => {
    acc[t.key] = t;
    return acc;
  }, {} as Record<WhatsAppTemplateKey, WhatsAppTemplate>);

/** Which template is the default for a given pipeline stage. */
const STAGE_TEMPLATE: Record<PipelineStage, WhatsAppTemplateKey> = {
  NEW: 'welcome',
  WELCOME_SENT: 'welcome',
  NO_RESPONSE: 'follow_up',
  INTERESTED: 'follow_up',
  PRICING: 'price_objection',
  QUOTED: 'quote_sent',
  NEGOTIATION: 'price_objection',
  WON: 'generic',
  LOST: 'generic',
  POSTPONED: 'generic',
};

/** First token of a lead's name, or '' when missing/blank (never 'undefined'). */
export function firstNameOf(name?: string | null): string {
  if (!name) return '';
  return name.trim().split(/\s+/)[0] || '';
}

/** The default template key for a stage (falls back to 'generic'). */
export function defaultTemplateKeyForStage(
  stage?: PipelineStage | null
): WhatsAppTemplateKey {
  if (!stage) return 'generic';
  return STAGE_TEMPLATE[stage] ?? 'generic';
}

interface LeadLike {
  name?: string | null;
}

/**
 * Build a `wa.me` deep link pre-filled with a specific template's message.
 * Returns '#' when the phone can't be normalized (graceful degrade).
 */
export function buildWhatsAppUrlForTemplate(
  phone: string,
  templateKey: WhatsAppTemplateKey,
  lead: LeadLike
): string {
  const normalized = normalizePhone(phone);
  if (!normalized) return '#';
  const template = TEMPLATE_BY_KEY[templateKey] ?? TEMPLATE_BY_KEY.generic;
  const text = template.build(firstNameOf(lead.name));
  return `https://wa.me/${normalized}?text=${encodeURIComponent(text)}`;
}

/**
 * Build a `wa.me` deep link pre-filled with the stage-appropriate template.
 * Returns '#' when the phone can't be normalized.
 */
export function buildWhatsAppUrl(
  phone: string,
  stage: PipelineStage | null | undefined,
  lead: LeadLike
): string {
  return buildWhatsAppUrlForTemplate(phone, defaultTemplateKeyForStage(stage), lead);
}
