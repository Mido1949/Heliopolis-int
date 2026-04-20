// ═══════════════════════════════════════════════
// LOOMARK — Type Definitions
// Company: GCHV Egypt | Industry: HVAC
// ═══════════════════════════════════════════════

// ── Enums & Union Types ─────────────────────────
export type UserRole = 'admin' | 'Sales Engineer' | 'Manager' | 'Telesales' | 'Call Center';
export type UserTeam = 'Tech Team' | 'Sales Team' | 'Management';
export type CrmTeam = 'tech' | 'cs';
export type LeadSource = 'WhatsApp' | 'Meta' | 'Direct' | 'Phone';
export type LeadStatus = 'New' | 'Interested' | 'Quote Sent' | 'Won' | 'Lost';
export type BOQStatus = 'Draft' | 'Sent' | 'Paid' | 'Cancelled';
export type ProductCategory = 'Outdoor' | 'Indoor' | 'Mini VRF' | 'Controller';
export type Region = 'Cairo' | 'Alexandria' | 'Riyadh' | 'Jeddah' | 'Other';
export type TaskType = 'BOQ' | 'Call' | 'Meeting' | 'Email' | 'Admin' | 'Other';
export type InventoryAction = 'Sale' | 'Return' | 'Damage' | 'Transfer' | 'Restock';
export type CampaignStatus = 'Draft' | 'Scheduled' | 'Sent' | 'Failed';
export type ScrapedLeadStatus = 'New' | 'Added to CRM' | 'Duplicate';
export type CallType = 'Inbound' | 'Outbound';
export type CallOutcome = 'Answered' | 'No Answer' | 'Busy' | 'Callback Requested';

// ── Data Models ─────────────────────────────────
export interface Profile {
  id: string;
  name: string;
  role: UserRole;
  team: UserTeam;
  crm_team?: CrmTeam;
  phone?: string;
  avatar_url?: string;
  email?: string;
  score: number;
  is_admin?: boolean;
  created_at: string;
}

export interface Lead {
  id: string;
  name: string;
  phone: string;
  company?: string;
  email?: string;
  source: LeadSource;
  status: LeadStatus;
  assigned_to?: string;
  assigned_to_team?: CrmTeam;
  assigned_to_user?: string;
  assigned_user?: { id: string; name: string } | null;
  meta_lead_id?: string;
  form_id?: string;
  project_capacity?: string;
  region?: Region;
  notes?: string;
  next_follow_up?: string;
  fb1?: boolean;
  fb1_date?: string;
  fb2?: boolean;
  fb2_date?: string;
  fb3?: boolean;
  fb3_date?: string;
  created_at: string;
  updated_at: string;
  // Joined
  profile?: Profile;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  model: string;
  series?: string;
  category: ProductCategory;
  capacity_hp?: number;
  cooling_kw?: number;
  capacity_kw?: number;
  heating_kw?: number;
  price: number;
  stock_quantity: number;
  stock: number;
  min_stock: number;
  features?: string[];
  specs?: Record<string, string>;
  image_url?: string;
  created_at?: string;
}

export interface InventoryLog {
  id: string;
  product_id: string;
  action: InventoryAction;
  quantity_change: number;
  note?: string;
  created_by: string;
  created_at: string;
  // Joined
  product?: Product;
  profile?: Profile;
}

export interface BOQ {
  id: string;
  boq_number: string;
  lead_id?: string;
  customer_name?: string;
  customer_phone?: string;
  customer_address?: string;
  subtotal: number;
  discount_percent: number;
  vat_percent: number;
  discount_amount: number;
  vat_amount: number;
  grand_total: number;
  exchange_rate: number;
  status: BOQStatus;
  notes?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
  // Joined
  lead?: Lead;
  boq_items?: BOQItem[];
}

export interface BOQItem {
  id: string;
  boq_id: string;
  product_id?: string;
  model: string;
  quantity: number;
  unit_price: number;
  total: number;
  product?: Product;
}

export interface EmailCampaign {
  id: string;
  subject: string;
  body: string;
  status: 'Draft' | 'Sent';
  sent_count: number;
  opened_count: number;
  created_by: string;
  sent_at?: string;
  created_at: string;
  // Joined
  profile?: Profile;
}

export interface EmailRecipient {
  id: string;
  campaign_id: string;
  lead_id: string;
  status: 'pending' | 'sent' | 'opened' | 'bounced';
  sent_at?: string;
  opened_at?: string;
  // Joined
  lead?: Lead;
}

export interface TimeLog {
  id: string;
  user_id: string;
  task_description?: string;
  lead_id?: string;
  task_type: TaskType;
  started_at: string;
  ended_at?: string;
  duration_seconds?: number;
  created_at: string;
  // Joined
  profile?: Profile;
  lead?: Lead;
}

export interface ScoreEvent {
  id: string;
  user_id: string;
  action: string;
  points: number;
  reference_id?: string;
  reference_type?: string;
  created_at: string;
}

export interface CallLog {
  id: string;
  lead_id: string;
  call_type: CallType;
  outcome: CallOutcome;
  duration_minutes: number;
  notes?: string;
  created_by: string;
  created_at: string;
}

export interface ScrapedLead {
  id: string;
  business_name?: string;
  category?: string;
  phone?: string;
  address?: string;
  rating?: number;
  website?: string;
  source_location?: string;
  status: ScrapedLeadStatus;
  scraped_at: string;
}

export interface AIChat {
  id: string;
  user_id: string;
  title?: string;
  messages: ChatMessage[];
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

// ── API Response Types ──────────────────────────
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ── Dashboard KPI Types ─────────────────────────
export interface KPIData {
  label: string;
  labelAr: string;
  value: number | string;
  change?: number;
  icon?: string;
  color?: string;
}
