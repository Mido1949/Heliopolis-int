-- ═══════════════════════════════════════════════════════
-- LOOMARK — Database Schema (Supabase / PostgreSQL)
-- Phase 1: Foundation
-- ═══════════════════════════════════════════════════════

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ──────────────────── PROFILES ────────────────────
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  avatar_url TEXT,
  score INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ──────────────────── PRODUCTS ────────────────────
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  model TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('Outdoor', 'Indoor', 'Mini VRF', 'Controller')),
  capacity_kw NUMERIC,
  price NUMERIC NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0,
  min_stock INTEGER NOT NULL DEFAULT 5,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ──────────────────── LEADS ────────────────────
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  company TEXT,
  phone TEXT,
  email TEXT,
  source TEXT DEFAULT 'Direct' CHECK (source IN ('WhatsApp', 'Meta', 'Direct', 'Phone')),
  status TEXT DEFAULT 'New' CHECK (status IN ('New', 'Interested', 'Quote Sent', 'Won', 'Lost')),
  region TEXT CHECK (region IN ('Cairo', 'Alexandria', 'Riyadh', 'Jeddah', 'Other')),
  notes TEXT,
  assigned_to UUID REFERENCES profiles(id),
  next_follow_up TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ──────────────────── BOQ (Bill of Quantity) ────────────────────
CREATE TABLE boqs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  boq_number TEXT UNIQUE NOT NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  customer_name TEXT,
  customer_phone TEXT,
  customer_address TEXT,
  created_by UUID REFERENCES profiles(id),
  status TEXT DEFAULT 'Draft' CHECK (status IN ('Draft', 'Sent', 'Paid', 'Cancelled')),
  subtotal NUMERIC DEFAULT 0,
  discount_percent NUMERIC DEFAULT 0,
  discount_amount NUMERIC DEFAULT 0,
  vat_percent NUMERIC DEFAULT 14,
  vat_amount NUMERIC DEFAULT 0,
  grand_total NUMERIC DEFAULT 0,
  exchange_rate NUMERIC DEFAULT 50.5,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ──────────────────── BOQ ITEMS ────────────────────
CREATE TABLE boq_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  boq_id UUID REFERENCES boqs(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  model TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC GENERATED ALWAYS AS (quantity * unit_price) STORED,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ──────────────────── EMAIL CAMPAIGNS ────────────────────
CREATE TABLE email_campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT DEFAULT 'Draft' CHECK (status IN ('Draft', 'Sent')),
  from_name TEXT,
  sent_count INTEGER DEFAULT 0,
  opened_count INTEGER DEFAULT 0,
  created_by UUID REFERENCES profiles(id),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ──────────────────── EMAIL RECIPIENTS ────────────────────
CREATE TABLE email_recipients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID REFERENCES email_campaigns(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'opened', 'bounced')),
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ
);

-- ──────────────────── TIME LOGS ────────────────────
CREATE TABLE time_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  task_type TEXT NOT NULL CHECK (task_type IN ('BOQ', 'Call', 'Meeting', 'Email', 'Admin', 'Other')),
  description TEXT,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ──────────────────── SCRAPED LEADS ────────────────────
CREATE TABLE scraped_leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  place_name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  rating NUMERIC,
  reviews_count INTEGER,
  website TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  imported BOOLEAN DEFAULT FALSE,
  imported_lead_id UUID REFERENCES leads(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ──────────────────── INVENTORY LOG ────────────────────
CREATE TABLE inventory_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('Sale', 'Return', 'Damage', 'Transfer', 'Restock')),
  quantity INTEGER NOT NULL,
  note TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ──────────────────── AI CHAT LOGS ────────────────────
CREATE TABLE ai_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  response TEXT NOT NULL,
  tokens_used INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ──────────────────── SCORE LOG ────────────────────
CREATE TABLE score_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  points INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ══════════════════════════════════════════════════
-- INDEXES
-- ══════════════════════════════════════════════════
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_assigned ON leads(assigned_to);
CREATE INDEX idx_leads_source ON leads(source);
CREATE INDEX idx_boqs_lead ON boqs(lead_id);
CREATE INDEX idx_boqs_status ON boqs(status);
CREATE INDEX idx_boq_items_boq ON boq_items(boq_id);
CREATE INDEX idx_time_logs_user ON time_logs(user_id);
CREATE INDEX idx_time_logs_date ON time_logs(started_at);
CREATE INDEX idx_inventory_product ON inventory_log(product_id);
CREATE INDEX idx_email_recipients_campaign ON email_recipients(campaign_id);
CREATE INDEX idx_scraped_imported ON scraped_leads(imported);

-- ══════════════════════════════════════════════════
-- UPDATED_AT TRIGGER
-- ══════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_profiles_updated BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_products_updated BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_leads_updated BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_boqs_updated BEFORE UPDATE ON boqs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ══════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- ══════════════════════════════════════════════════

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE boqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE boq_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraped_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE score_log ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read all, update own
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Products: all authenticated can read, admin can modify
CREATE POLICY "products_select" ON products FOR SELECT USING (true);
CREATE POLICY "products_insert" ON products FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "products_update" ON public.products FOR UPDATE USING (true);

-- Leads: all authenticated can CRUD
CREATE POLICY "leads_select" ON leads FOR SELECT USING (true);
CREATE POLICY "leads_insert" ON leads FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "leads_update" ON leads FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "leads_delete" ON leads FOR DELETE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- BOQs: all authenticated
CREATE POLICY "boqs_select" ON boqs FOR SELECT USING (true);
CREATE POLICY "boqs_insert" ON boqs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "boqs_update" ON boqs FOR UPDATE USING (auth.uid() IS NOT NULL);

-- BOQ Items: same as BOQs
CREATE POLICY "boq_items_select" ON boq_items FOR SELECT USING (true);
CREATE POLICY "boq_items_insert" ON boq_items FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "boq_items_update" ON boq_items FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "boq_items_delete" ON boq_items FOR DELETE USING (auth.uid() IS NOT NULL);

-- Email Campaigns: all authenticated
CREATE POLICY "campaigns_select" ON email_campaigns FOR SELECT USING (true);
CREATE POLICY "campaigns_insert" ON email_campaigns FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "campaigns_update" ON email_campaigns FOR UPDATE USING (auth.uid() IS NOT NULL);

-- Email Recipients: all authenticated
CREATE POLICY "recipients_select" ON email_recipients FOR SELECT USING (true);
CREATE POLICY "recipients_insert" ON email_recipients FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Time Logs: users see own, admin sees all
CREATE POLICY "time_logs_select" ON time_logs FOR SELECT USING (
  auth.uid() = user_id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "time_logs_insert" ON time_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "time_logs_update" ON time_logs FOR UPDATE USING (auth.uid() = user_id);

-- Scraped Leads: all authenticated
CREATE POLICY "scraped_select" ON scraped_leads FOR SELECT USING (true);
CREATE POLICY "scraped_insert" ON scraped_leads FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "scraped_update" ON scraped_leads FOR UPDATE USING (auth.uid() IS NOT NULL);

-- Inventory Log: all authenticated
CREATE POLICY "inventory_select" ON inventory_log FOR SELECT USING (true);
CREATE POLICY "inventory_insert" ON inventory_log FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- AI Logs: users see own
CREATE POLICY "ai_logs_select" ON ai_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "ai_logs_insert" ON ai_logs FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Score Log: users see own, admin sees all
CREATE POLICY "score_log_select" ON score_log FOR SELECT USING (
  auth.uid() = user_id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "score_log_insert" ON score_log FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ══════════════════════════════════════════════════
-- AUTO-CREATE PROFILE ON SIGNUP
-- ══════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    'sales'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
-- LEAD ACTIVITIES: History of changes
CREATE TABLE IF NOT EXISTS public.lead_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  type TEXT NOT NULL, -- 'status_change', 'note_added', 'edit', 'creation'
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;

-- Policies for lead_activities
CREATE POLICY "Everyone can view lead activities" ON public.lead_activities
  FOR SELECT USING (true);

CREATE POLICY "Users can insert their own activities" ON public.lead_activities
  FOR INSERT WITH CHECK (auth.uid() = user_id);
