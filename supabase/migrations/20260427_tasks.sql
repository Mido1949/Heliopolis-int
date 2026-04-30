-- Tasks table migration
-- Date: 2026-04-27
-- Project: Loomark / Heliopolis International (GCHV Egypt)

-- Create tasks table
CREATE TABLE public.tasks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  description  TEXT,
  assigned_to  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_by   UUID NOT NULL REFERENCES public.profiles(id),
  lead_id      UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  due_date     TIMESTAMPTZ,
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'done')),
  priority     TEXT NOT NULL DEFAULT 'medium'
                 CHECK (priority IN ('high', 'medium', 'low')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Create indexes
CREATE INDEX idx_tasks_assigned_to ON public.tasks(assigned_to);
CREATE INDEX idx_tasks_lead_id ON public.tasks(lead_id);

-- Enable RLS
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users see their own tasks; admins/managers see all
CREATE POLICY "tasks_select" ON public.tasks FOR SELECT TO authenticated
  USING (
    assigned_to = auth.uid()
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'Manager')
  );

-- Only admin/manager can create tasks
CREATE POLICY "tasks_insert" ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'Manager')
  );

-- Assigned user or admin/manager can update (mark done)
CREATE POLICY "tasks_update" ON public.tasks FOR UPDATE TO authenticated
  USING (
    assigned_to = auth.uid()
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'Manager')
  );

-- Only admin/manager can delete
CREATE POLICY "tasks_delete" ON public.tasks FOR DELETE TO authenticated
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'Manager')
  );