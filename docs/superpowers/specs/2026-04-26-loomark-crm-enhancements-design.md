# Loomark CRM Enhancements — Design Spec
**Date:** 2026-04-26  
**Project:** Loomark / Heliopolis International (GCHV Egypt)  
**Stack:** Next.js 14 App Router · Supabase · Ant Design · Tailwind · Framer Motion  
**Approach:** Hybrid (RLS for data security + client-side for UX features)

---

## 1. Activity Log (Lead Drawer)

### Goal
Activate the existing "النشاط (Activity)" tab in `LeadDrawer.tsx` with a functional activity feed per lead.

### Database
`lead_activities` table **already exists** in schema with `details JSONB`. Alter it to add explicit columns needed for the UI:

Migration: `20260426_lead_activities_body.sql`
```sql
ALTER TABLE public.lead_activities
  ADD COLUMN IF NOT EXISTS body TEXT,
  ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;

-- Expand type to include 'call' and 'note' (existing: 'status_change', 'note_added', 'edit', 'creation')
ALTER TABLE public.lead_activities
  DROP CONSTRAINT IF EXISTS lead_activities_type_check;

ALTER TABLE public.lead_activities
  ADD CONSTRAINT lead_activities_type_check
  CHECK (type IN ('call', 'note', 'status_change', 'note_added', 'edit', 'creation'));
```
Existing RLS policies kept as-is.

### UI — `LeadDrawer.tsx`
- Sub-tabs: الكل / مكالمات / ملاحظات (filter `type`)
- Each entry: user avatar (initials), user name, timestamp (relative), body text
- Type icons: 📞 call, 📝 note, 🔄 status_change
- "**+ إضافة نشاط**" button → inline form: type select + body textarea + optional duration (for calls)
- Auto-log: when `LeadFormModal` saves a status change, insert a `status_change` activity row automatically
- Empty state: "لا يوجد نشاط حتى الآن"

---

## 2. Daily Follow-up Tasks Widget (Dashboard)

### Goal
Show each user their leads requiring follow-up today or overdue, prominently on the dashboard.

### Query
```sql
SELECT leads.*, profiles.name as assigned_name
FROM leads
WHERE next_follow_up <= now()
  AND assigned_to_user = auth.uid()  -- filtered by role (see Section 4)
ORDER BY next_follow_up ASC
LIMIT 20;
```

### UI — `app/(dashboard)/dashboard/page.tsx`
- New card: **"🔥 مهام اليوم"** with red badge showing pending count
- Each row: lead name + status indicator
  - 🔴 Red dot + "متأخر" = `next_follow_up < today`
  - 🟡 Amber dot + "اليوم" = `next_follow_up = today`
- Clicking a row opens `LeadDrawer` for that lead
- Empty state: "✓ لا توجد متابعات اليوم"
- Admins/Managers see all users' tasks; others see only their own

---

## 3. Lead Visibility by Role

### Goal
Admins and Managers see all leads. All other roles see only leads assigned to them.

### Roles
- **See all:** `admin`, `Manager`
- **See own only:** `Sales Engineer`, `Telesales`, `Call Center`

### Database — RLS Policy
**Already deployed** in `supabase/migrations/20260418_plan1_rls_ownership.sql`. The existing `"leads_select"` policy already enforces:
- `admin` and `Manager` roles → see all leads
- All other roles → only `assigned_to_user = auth.uid()` OR `assigned_to = auth.uid()`

**No new migration needed.**

### Client Layer — `crm/page.tsx`
Add query filter for non-admin/manager users as a UI-layer guard:
```ts
if (!isAdmin && !isManager) {
  query = query.eq('assigned_to_user', user.id);
}
```
Same filter applied to the Kanban view in `KanbanView.tsx`.

---

## 4. Auto Session Timer (Silent, On Login)

### Goal
Automatically log the user's session time without any UI interaction.

### Implementation — `useSessionManager` hook
New file: `hooks/useSessionManager.ts`

```ts
// On mount: insert time_logs row with task_type='Session', started_at=now()
// On unmount / beforeunload: update row with ended_at=now()
```

Uses the existing `time_logs` table with `task_type = 'Other'` and `description = 'Auto Session'`. (The `task_type` constraint does not include `'Session'`; using `'Other'` avoids a schema change.)  
Added to `Shell.tsx` — fires once per login session, invisible to the user.

---

## 5. Auto Logout After 30 Minutes Inactivity

### Goal
Automatically sign the user out after 30 minutes of no interaction.

### Implementation — part of `useSessionManager` hook
Tracks: `mousemove`, `keydown`, `click`, `touchstart`  
On each event: resets a 30-minute timeout  
On timeout: calls `supabase.auth.signOut()` → `router.push('/login')`  
Silent — no warning dialog.

---

## 6. Reports: Lead Maker + Assigned To Columns

### Goal
Add two new columns to the Reports page meta leads table and CSV export.

### Database
Add `created_by` to the leads query (join to profiles):
```sql
SELECT leads.*, 
  creator.name as creator_name,
  assignee.name as assignee_name
FROM leads
LEFT JOIN profiles creator ON creator.id = leads.created_by
LEFT JOIN profiles assignee ON assignee.id = leads.assigned_to_user
```

**Note:** `leads.created_by` does NOT exist in the current schema (only `boqs.created_by` does). Add via migration:

Migration: `20260426_leads_created_by.sql`
```sql
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id);

-- Backfill: set created_by = assigned_to_user for existing leads where possible
UPDATE leads SET created_by = assigned_to_user WHERE created_by IS NULL AND assigned_to_user IS NOT NULL;
```

### UI — `reports/page.tsx`
- New column **"صاحب الليد (Lead Maker)"** showing `creator_name`
- New column **"المعين له (Assigned To)"** showing `assignee_name`
- Both columns added to the CSV export in the download handler

---

## 7. Login Page Animation

### Goal
Replace the static left panel with an animated branded experience using Framer Motion.

### Implementation — `app/(auth)/login/page.tsx`

**LOOMARK name:** `motion.h1` with `fadeSlideDown` (opacity 0→1, y -20→0, duration 0.8s)

**Subtitle "GCHV EGYPT":** static, red, letter-spaced

**Rotating quotes:** Array of 10 quotes, cycle every 4 seconds with `AnimatePresence` fade (opacity 0→1→0):
1. "النجاح يبدأ بخطوة واحدة"
2. "كل عميل هو فرصة جديدة"
3. "الإصرار هو مفتاح الإنجاز"
4. "تواصل، أقنع، انجز"
5. "فريق قوي يصنع نتائج استثنائية"
6. "السعى ليه وقت"
7. "صلى على محمد"
8. "الامل فى الداخل ينتظر الخروج"
9. "فى اختلافنا رحمة"
10. "مدد يا رب"

**Dot indicators:** active dot = red + wider (18px), inactive = grey (6px)

### Page Loading Screen — `app/loading.tsx`
Replace current plain spinner with:
- Dark branded background (`#0D2137`)
- Loomark logo centered
- Random quote from the same 10-quote list
- Subtle fade-in animation
- Small spinner below the quote

---

## 8. Performance Improvements

### Fixes

| Location | Issue | Fix |
|---|---|---|
| `Shell.tsx` | Duplicate profile fetch (already in `AuthContext`) | Remove Shell's `loadProfile`, use `useAuth()` profile |
| `crm/page.tsx` | No debounce on search input | Add 300ms debounce before triggering `fetchLeads` |
| `LeadDrawer.tsx` | Re-fetches same lead data on every open | Cache last-fetched lead ID + timestamp; skip re-fetch if same lead within 60s |
| `lib/supabase/client.ts` | Verify singleton pattern | Ensure client is created once via module-level singleton |
| Dashboard | `DashboardCharts` may have its own fetches | Audit and consolidate into parent `Promise.all` |

---

## 9. Logout Button (Mobile-Accessible)

### Goal
The existing sidebar logout button must be reliably accessible on all screen sizes.

### Fix — `Shell.tsx` + `Sidebar.tsx`
- Extract `handleLogout` into `Shell.tsx` and pass as prop to `Sidebar`
- Ensure the logout button is always visible in collapsed sidebar (icon-only mode) — not clipped
- On mobile: the logout button is already inside the sidebar drawer. Ensure the drawer opens reliably via the hamburger button in `Navbar.tsx`
- No new navbar elements

---

## Summary of New Files / Migrations

| Type | Path |
|---|---|
| Migration | `supabase/migrations/20260426_lead_activities_body.sql` |
| Migration | `supabase/migrations/20260426_leads_created_by.sql` |
| Hook | `hooks/useSessionManager.ts` |
| Component (updated) | `app/(dashboard)/crm/LeadDrawer.tsx` |
| Component (updated) | `app/(dashboard)/crm/page.tsx` |
| Component (updated) | `app/(dashboard)/crm/KanbanView.tsx` |
| Component (updated) | `app/(dashboard)/dashboard/page.tsx` |
| Component (updated) | `app/(dashboard)/reports/page.tsx` |
| Component (updated) | `app/(auth)/login/page.tsx` |
| Component (updated) | `app/loading.tsx` |
| Component (updated) | `components/layout/Shell.tsx` |
| Component (updated) | `components/layout/Sidebar.tsx` |
