// ═══════════════════════════════════════════════
// LOOMARK — Constants
// ═══════════════════════════════════════════════

export const APP_NAME = 'Heliopolis INT';
export const COMPANY_NAME = 'GCHV Egypt';

// Navigation Items
export const NAV_ITEMS = [
  { key: 'dashboard', labelAr: 'لوحة التحكم', labelEn: 'Dashboard', icon: 'dashboard', path: '/dashboard' },
  { key: 'crm', labelAr: 'إدارة العملاء', labelEn: 'CRM', icon: 'contacts', path: '/crm' },
  { key: 'boq', labelAr: 'عروض الأسعار', labelEn: 'BOQ', icon: 'fileText', path: '/boq' },
  { key: 'email', labelAr: 'حملات البريد', labelEn: 'Email', icon: 'mail', path: '/email' },
  { key: 'inventory', labelAr: 'المخزون', labelEn: 'Inventory', icon: 'database', path: '/inventory' },
  { key: 'time-tracker', labelAr: 'تتبع الوقت', labelEn: 'Time Tracker', icon: 'clock', path: '/time-tracker' },
  { key: 'scraper', labelAr: 'استخراج البيانات', labelEn: 'Scraper', icon: 'search', path: '/scraper' },
  { key: 'ai-assistant', labelAr: 'المساعد الذكي', labelEn: 'AI Assistant', icon: 'robot', path: '/ai-assistant' },
] as const;

// Lead Sources
export const LEAD_SOURCES = [
  { value: 'WhatsApp', labelAr: 'واتساب', color: '#25D366' },
  { value: 'Meta', labelAr: 'ميتا', color: '#1877F2' },
  { value: 'Direct', labelAr: 'مباشر', color: '#0D2137' },
  { value: 'Phone', labelAr: 'هاتف', color: '#FF9800' },
] as const;

// Lead Statuses
export const LEAD_STATUSES = [
  { value: 'New', labelAr: 'جديد', color: '#1890FF' },
  { value: 'Interested', labelAr: 'مهتم', color: '#FAAD14' },
  { value: 'Quote Sent', labelAr: 'تم إرسال العرض', color: '#722ED1' },
  { value: 'Won', labelAr: 'تم الفوز', color: '#52C41A' },
  { value: 'Lost', labelAr: 'خسران', color: '#FF4D4F' },
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

// Regions
export const REGIONS = [
  { value: 'Cairo', labelAr: 'القاهرة' },
  { value: 'Alexandria', labelAr: 'الإسكندرية' },
  { value: 'Riyadh', labelAr: 'الرياض' },
  { value: 'Jeddah', labelAr: 'جدة' },
  { value: 'Other', labelAr: 'أخرى' },
] as const;

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
