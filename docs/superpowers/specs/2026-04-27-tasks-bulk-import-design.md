# Tasks Management + Bulk Lead Import — Design Spec (Spec B+C)
**Date:** 2026-04-27  
**Project:** Loomark / Heliopolis International (GCHV Egypt)  
**Stack:** Next.js 14 App Router · Supabase · Ant Design · Tailwind · papaparse · xlsx

---

## 1. Tasks Management System

### Goal
Admins and Managers create tasks and assign them to team members. Each user sees their own tasks in a split-view page. Tasks can be standalone or linked to a specific lead.

### Database

**New table: `tasks`**

```sql
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

CREATE INDEX idx_tasks_assigned_to ON public.tasks(assigned_to);
CREATE INDEX idx_tasks_lead_id ON public.tasks(lead_id);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

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
```

**Migration file:** `supabase/migrations/20260427_tasks.sql`

### UI — `/tasks` page

**File:** `app/(dashboard)/tasks/page.tsx`

**Layout (split view — Option B):**

```
┌─────────────────────────────────────────────┐
│  📋 المهام          [+ مهمة جديدة (admin)]  │
├─────────────────────┬───────────────────────┤
│   مهامي             │  إدارة المهام (admin) │
│   ─────────────     │  ──────────────────   │
│   □ مهمة 1 🔴       │  stats: 8 / 24 / 3   │
│     🔗 عمرو · اليوم │  filter pills         │
│   □ مهمة 2 🟡       │  table rows           │
│   ✓ مهمة 3 (done)   │                       │
└─────────────────────┴───────────────────────┘
```

**Left panel — "مهامي":** visible to all users
- Pending tasks first, done tasks below with strikethrough
- Each task: checkbox (click → mark done) + title + due date indicator + lead link if any
- Due indicators: 🔴 "متأخرة" if `due_date < now()`, 🟡 "اليوم", ⬜ future date

**Right panel — "إدارة المهام":** visible to admin/Manager only
- 3 stat cards: pending / done / overdue
- Filter pills: الكل / معلقة / منتهية / متأخرة / مرتبطة بليد
- Table columns: المهمة, معين لـ, الموعد, الحالة, الأولوية, إجراءات (edit/delete)

**Create Task Modal** (admin/manager only):
- Fields: title (required), description, assigned_to (Select from profiles), lead_id (optional Select from leads), due_date (DatePicker), priority (Select: high/medium/low)
- On save: insert to `tasks` table

**Sidebar:** Add "Tasks" nav item with `CheckSquare` icon + red badge showing pending count for current user

**Badge count:** `supabase.from('tasks').select('*', {count:'exact', head:true}).eq('assigned_to', user.id).eq('status', 'pending')`

---

## 2. Bulk Lead Import

### Goal
Upload a CSV or Excel file containing multiple leads. Duplicates (matched by phone) are updated; new entries are inserted.

### Libraries
- `papaparse` — CSV parsing (already lightweight, add if not installed)
- `xlsx` — Excel `.xlsx` parsing (add if not installed)

Install: `npm install papaparse xlsx --legacy-peer-deps`
Types: `npm install --save-dev @types/papaparse --legacy-peer-deps`

### Template Columns (exact order)
`name, phone, company, email, status, source, region, notes, next_follow_up`

- `status` must match one of: New, Contacted, Interested, Proposal Sent, Won, Lost, On Hold
- `source` must match one of: Direct, WhatsApp, Meta, Phone, Referral, Website
- `next_follow_up` format: `YYYY-MM-DD`

### UI — CRM page header

**File:** `app/(dashboard)/crm/page.tsx`

Add an "استيراد مجمع" button next to "إضافة عميل" in the header.

**Import Modal flow:**

```
Step 1: Upload
  [📥 تحميل Template]
  [Drag & drop zone — CSV or Excel]

Step 2: Preview (after file parsed)
  Table showing first 10 rows
  Summary: "سيتم إضافة X ليد · تحديث Y ليد موجود"
  [تأكيد الاستيراد]  [إلغاء]

Step 3: Result
  "✓ تم استيراد X ليد بنجاح · تم تحديث Y"
```

**Import logic (client-side):**

```ts
// For each row in parsed data:
// 1. Validate required fields (name, phone)
// 2. Check if phone exists in DB:
//    - EXISTS → UPDATE lead
//    - NOT EXISTS → INSERT lead
// Use supabase.from('leads').upsert(..., { onConflict: 'phone' })
```

**Template download:** generate a CSV blob in-browser with the header row and 2 example rows, trigger download as `loomark-leads-template.csv`.

**File:** `app/(dashboard)/crm/ImportModal.tsx` (new component)

---

## Summary of New Files / Migrations

| Type | Path | Responsibility |
|---|---|---|
| Migration | `supabase/migrations/20260427_tasks.sql` | `tasks` table + RLS |
| Page | `app/(dashboard)/tasks/page.tsx` | Split-view tasks screen |
| Component | `app/(dashboard)/crm/ImportModal.tsx` | Bulk import modal |
| Modify | `app/(dashboard)/crm/page.tsx` | Add import button + modal |
| Modify | `lib/constants.ts` | Add Tasks to NAV_ITEMS |
| Modify | `components/layout/Sidebar.tsx` | Tasks badge |
