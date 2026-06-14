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
  { value: 'WhatsApp', labelAr: 'واتساب', color: '#25D366' },
  { value: 'Meta', labelAr: 'ميتا', color: '#1877F2' },
  { value: 'Direct', labelAr: 'مباشر', color: '#0D2137' },
  { value: 'Phone', labelAr: 'هاتف', color: '#FF9800' },
] as const;

// Lead Statuses (legacy — kept for backward compatibility)
export const LEAD_STATUSES = [
  { value: 'New', labelAr: 'جديد', color: '#1890FF' },
  { value: 'Interested', labelAr: 'مهتم', color: '#FAAD14' },
  { value: 'Quote Sent', labelAr: 'تم إرسال العرض', color: '#722ED1' },
  { value: 'Won', labelAr: 'تم الفوز', color: '#52C41A' },
  { value: 'Lost', labelAr: 'خسران', color: '#FF4D4F' },
] as const;

// Pipeline Stages (9-stage funnel — Phase 2)
export const PIPELINE_STAGES = [
  { value: 'NEW',           labelAr: 'جديد',                  color: '#1890FF' },
  { value: 'CONTACTED',     labelAr: 'تم التواصل',            color: '#13C2C2' },
  { value: 'ASSIGNED_TECH', labelAr: 'محال للتقني',           color: '#722ED1' },
  { value: 'QUOTED',        labelAr: 'تم إرسال العرض',        color: '#2F54EB' },
  { value: 'FOLLOW_UP',     labelAr: 'متابعة',                color: '#FAAD14' },
  { value: 'WON',           labelAr: 'تم الفوز',              color: '#52C41A' },
  { value: 'LOST_PRICE',    labelAr: 'خسران - سعر',           color: '#FF4D4F' },
  { value: 'GHOSTED',       labelAr: 'لم يرد',                color: '#8C8C8C' },
  { value: 'POSTPONED',     labelAr: 'مؤجل',                  color: '#EB2F96' },
] as const;

export const ACTIVE_PIPELINE_STAGES: ReadonlyArray<typeof PIPELINE_STAGES[number]['value']> = [
  'NEW', 'CONTACTED', 'ASSIGNED_TECH', 'QUOTED', 'FOLLOW_UP',
];

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
