-- ══════════════════════════════════════════════════
-- LOOMARK SECURITY PATCH: RLS for Calls & Notifications
-- ══════════════════════════════════════════════════

-- 1. CALL LOGS
ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view call logs" ON public.call_logs
  FOR SELECT USING (true);

CREATE POLICY "Users can log their own calls" ON public.call_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own calls" ON public.call_logs
  FOR UPDATE USING (auth.uid() = user_id);

-- 2. NOTIFICATIONS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications" ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications (mark as read)" ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id);

-- 3. ADDITIONAL LEAD SECURITY
CREATE POLICY "Admins can delete leads" ON public.leads
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'Manager'))
  );

-- 4. BOQ ITEMS SECURITY
ALTER TABLE public.boq_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view BOQ items" ON public.boq_items
  FOR SELECT USING (true);

CREATE POLICY "Users can manage BOQ items" ON public.boq_items
  FOR ALL USING (auth.uid() IS NOT NULL);
