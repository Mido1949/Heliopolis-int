// ═══════════════════════════════════════════════
// HELIOMAX — Constants
// ═══════════════════════════════════════════════

export const APP_NAME = 'HelioMax';
export const COMPANY_NAME = 'HelioMax';

// Navigation Items
export const NAV_ITEMS = [
  { key: 'dashboard', labelAr: 'لوحة التحكم', labelEn: 'Dashboard', icon: 'dashboard', path: '/dashboard' },
  { key: 'hub', labelAr: 'مركز الشركة', labelEn: 'Company Hub', icon: 'hub', path: '/hub' },
  { key: 'crm', labelAr: 'إدارة العملاء', labelEn: 'CRM', icon: 'contacts', path: '/crm' },
  { key: 'crm-ksa', labelAr: 'CRM KSA', labelEn: 'CRM KSA', icon: 'contacts', path: '/crm-ksa' },
  { key: 'boq', labelAr: 'عروض الأسعار', labelEn: 'BOQ', icon: 'fileText', path: '/boq' },
  { key: 'email', labelAr: 'حملات البريد', labelEn: 'Email', icon: 'mail', path: '/email' },
  { key: 'inventory', labelAr: 'المخزون', labelEn: 'Inventory', icon: 'database', path: '/inventory' },
  { key: 'scraper', labelAr: 'استخراج البيانات', labelEn: 'Scraper', icon: 'search', path: '/scraper' },
  { key: 'calls', labelAr: 'المكالمات', labelEn: 'Calls', icon: 'phone', path: '/calls' },
  { key: 'tasks', labelAr: 'المهام', labelEn: 'Tasks', icon: 'tasks', path: '/tasks' },
  { key: 'after-sales', labelAr: 'خدمة ما بعد البيع', labelEn: 'After Sales', icon: 'wrench', path: '/after-sales' },
  { key: 'ai-assistant', labelAr: 'المساعد الذكي', labelEn: 'AI Assistant', icon: 'robot', path: '/ai-assistant' },
  { key: 'helio', labelAr: 'مركز هيليو', labelEn: 'Helio', icon: 'brain', path: '/helio' },
  { key: 'reports', labelAr: 'التقارير والأهداف', labelEn: 'Reports', icon: 'barChart', path: '/reports' },
] as const;

// Lead Sources
export const LEAD_SOURCES = [
  { value: 'Meta Ad',  labelAr: 'إعلان ميتا', color: '#1877F2' },
  { value: 'WhatsApp', labelAr: 'واتساب',     color: '#25D366' },
  { value: 'Meta',     labelAr: 'ميتا',       color: '#1877F2' },
  { value: 'Direct',   labelAr: 'مباشر',      color: '#0D2137' },
  { value: 'Phone',    labelAr: 'هاتف',       color: '#FF9800' },
] as const;

// Lead Statuses (legacy — kept for backward compatibility, mirrored 1:1 from
// PIPELINE_STAGES below via lib/leads/stageStatus.ts). Previously only 5 of
// the 10 stages had a distinct status — WELCOME_SENT, NO_RESPONSE, PRICING,
// NEGOTIATION, and POSTPONED all fell through to 'New', silently miscounting
// any lead in those stages on every status-based chart (Analytics, Reports,
// Dashboard). Now one entry per stage, same order, same Arabic labels/colors
// as PIPELINE_STAGES so status- and stage-based views agree visually.
export const LEAD_STATUSES = [
  { value: 'New', labelAr: 'جديد', color: '#1890FF' },
  { value: 'Contacted', labelAr: 'تم الترحيب', color: '#13C2C2' },
  { value: 'No Response', labelAr: 'لم يرد', color: '#8C8C8C' },
  { value: 'Interested', labelAr: 'مهتم', color: '#FAAD14' },
  { value: 'Pricing', labelAr: 'جاري التسعير', color: '#722ED1' },
  { value: 'Quote Sent', labelAr: 'تم إرسال العرض', color: '#2F54EB' },
  { value: 'Negotiation', labelAr: 'تفاوض', color: '#FAAD14' },
  { value: 'Won', labelAr: 'تم الفوز', color: '#52C41A' },
  { value: 'Lost', labelAr: 'خسران', color: '#FF4D4F' },
  { value: 'Postponed', labelAr: 'مؤجل', color: '#EB2F96' },
] as const;

// Pipeline Zones (visual grouping + notification routing — NOT permission locks)
export const PIPELINE_ZONES = [
  { value: 'tech',  labelAr: 'الفريق التقني', color: '#1A6FD4' },
  { value: 'cs',    labelAr: 'خدمة العملاء',  color: '#16A34A' },
  { value: 'sales', labelAr: 'المبيعات',      color: '#D72B2B' },
] as const;

// Unified Pipeline (10 stages — replaces legacy `status`)
export const PIPELINE_STAGES = [
  { value: 'NEW',          labelAr: 'جديد',                  emoji: '🆕', zone: 'tech',  color: '#1890FF' },
  { value: 'WELCOME_SENT', labelAr: 'تم الترحيب',            emoji: '👋', zone: 'tech',  color: '#13C2C2' },
  { value: 'NO_RESPONSE',  labelAr: 'لم يرد',                emoji: '📵', zone: 'cs',    color: '#8C8C8C' },
  { value: 'INTERESTED',   labelAr: 'مهتم / عنده مشروع',     emoji: '🔥', zone: 'tech',  color: '#FA8C16' },
  { value: 'PRICING',      labelAr: 'جاري التسعير',          emoji: '🧮', zone: 'tech',  color: '#722ED1' },
  { value: 'QUOTED',       labelAr: 'تم إرسال العرض',        emoji: '📤', zone: 'sales', color: '#2F54EB' },
  { value: 'NEGOTIATION',  labelAr: 'متابعة السيلز / تفاوض', emoji: '🤝', zone: 'sales', color: '#FAAD14' },
  { value: 'WON',          labelAr: 'تم البيع',              emoji: '✅', zone: 'sales', color: '#52C41A' },
  { value: 'LOST',         labelAr: 'خسارة',                 emoji: '❌', zone: 'sales', color: '#FF4D4F' },
  { value: 'POSTPONED',    labelAr: 'مؤجل',                  emoji: '⏸️', zone: 'sales', color: '#EB2F96' },
] as const;

export const ACTIVE_PIPELINE_STAGES: ReadonlyArray<typeof PIPELINE_STAGES[number]['value']> = [
  'NEW', 'WELCOME_SENT', 'NO_RESPONSE', 'INTERESTED', 'PRICING', 'QUOTED', 'NEGOTIATION',
];

// Terminal stages carry no SLA urgency (deal is closed one way or another).
export const TERMINAL_PIPELINE_STAGES: ReadonlyArray<typeof PIPELINE_STAGES[number]['value']> = [
  'WON', 'LOST', 'POSTPONED',
];

// SLA card colors (spec 005 US4 / FR-008): how long a lead may sit in its
// current stage before the card turns amber, then red. One editable place.
export const SLA_THRESHOLDS = { amberDays: 2, redDays: 5 } as const;

/** Whole days a lead has spent in its CURRENT stage (from stage_timestamps). */
export function stageAgeDays(lead: {
  pipeline_stage?: string | null;
  stage_timestamps?: Record<string, string> | null;
}): number {
  const stage = lead.pipeline_stage || 'NEW';
  const ts = lead.stage_timestamps?.[stage];
  if (!ts) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 86_400_000));
}

/**
 * SLA urgency color for a lead card based on its stage age.
 * Returns null for terminal stages (WON/LOST/POSTPONED) — no urgency color.
 */
export function slaColor(lead: {
  pipeline_stage?: string | null;
  stage_timestamps?: Record<string, string> | null;
}): 'green' | 'amber' | 'red' | null {
  const stage = lead.pipeline_stage || 'NEW';
  if ((TERMINAL_PIPELINE_STAGES as readonly string[]).includes(stage)) return null;
  const age = stageAgeDays(lead);
  if (age >= SLA_THRESHOLDS.redDays) return 'red';
  if (age >= SLA_THRESHOLDS.amberDays) return 'amber';
  return 'green';
}

// Loss reasons (used when a lead moves to LOST)
export const LOST_REASONS = [
  { value: 'price',      labelAr: 'السعر مرتفع' },
  { value: 'no_need',    labelAr: 'لا يوجد احتياج' },
  { value: 'competitor', labelAr: 'اختار منافس' },
  { value: 'ghosted',    labelAr: 'اختفى / لم يرد' },
  { value: 'other',      labelAr: 'أخرى' },
] as const;

// BOQ Statuses
export const BOQ_STATUSES = [
  { value: 'Draft', labelAr: 'مسودة', color: '#8C8C8C' },
  { value: 'Sent', labelAr: 'مرسل', color: '#1890FF' },
  { value: 'Paid', labelAr: 'مدفوع', color: '#52C41A' },
  { value: 'Cancelled', labelAr: 'ملغي', color: '#FF4D4F' },
] as const;

// Product Categories
export const PRODUCT_CATEGORIES = [
  { value: 'Outdoor', labelAr: 'وحدة خارجية' },
  { value: 'Indoor', labelAr: 'وحدة داخلية' },
  { value: 'Mini VRF', labelAr: 'ميني VRF' },
  { value: 'Controller', labelAr: 'جهاز تحكم' },
] as const;

// Lead Client Types
export const LEAD_CLIENT_TYPES = [
  { value: 'موزع', labelAr: 'موزع' },
  { value: 'شركة تكييف', labelAr: 'شركة تكييف' },
  { value: 'مقاول', labelAr: 'مقاول' },
  { value: 'عميل منفرد', labelAr: 'عميل منفرد' },
] as const;

// Regions
export const REGIONS = [
  { value: 'Cairo', labelAr: 'القاهرة' },
  { value: 'Alexandria', labelAr: 'الإسكندرية' },
  { value: 'Riyadh', labelAr: 'الرياض' },
  { value: 'Jeddah', labelAr: 'جدة' },
  { value: 'Other', labelAr: 'أخرى' },
] as const;

export const SAUDI_REGIONS = ['Riyadh', 'Jeddah'] as const;

// Task Types
export const TASK_TYPES = [
  { value: 'BOQ', labelAr: 'عرض أسعار' },
  { value: 'Call', labelAr: 'مكالمة' },
  { value: 'Meeting', labelAr: 'اجتماع' },
  { value: 'Email', labelAr: 'بريد إلكتروني' },
  { value: 'Admin', labelAr: 'إداري' },
  { value: 'Other', labelAr: 'أخرى' },
] as const;

// Scoring Points
export const SCORE_POINTS = {
  NEW_LEAD: 10,
  LEAD_INTERESTED: 20,
  BOQ_SENT: 30,
  DEAL_WON: 100,
  EMAIL_SENT: 15,
  DAILY_LOGIN: 5,
  SCRAPER_TO_CRM: 5,
  TIME_LOG_4HRS: 10,
} as const;

// Inventory Actions
export const INVENTORY_ACTIONS = [
  { value: 'Sale', labelAr: 'بيع', color: '#FF4D4F' },
  { value: 'Return', labelAr: 'إرجاع', color: '#1890FF' },
  { value: 'Damage', labelAr: 'تلف', color: '#FAAD14' },
  { value: 'Transfer', labelAr: 'نقل', color: '#722ED1' },
  { value: 'Restock', labelAr: 'إعادة تخزين', color: '#52C41A' },
] as const;

// VAT
export const DEFAULT_VAT_PERCENT = 14;
export const CURRENCY = 'EGP';
