# Plan 1 — Lead Ownership + Assign To Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add team-based lead assignment UI in the drawer, RLS isolation so staff only see their own leads, and display the assigned user's name in the leads list and drawer.

**Architecture:** Four files change in dependency order — types first (so downstream files compile), then the migration SQL (DB layer), then the CRM page (query join + new column + callback prop), then LeadDrawer (Assign To UI + current owner display). No new component files needed.

**Tech Stack:** Next.js 14, TypeScript, Supabase JS client, Ant Design (Select, Button, Divider, Tag, message), PostgreSQL RLS

---

## File Map

| File | Change |
|------|--------|
| `types/index.ts` | Add `assigned_user` join shape to `Lead` interface |
| `supabase/migrations/20260418_plan1_rls_ownership.sql` | RLS policy on leads + expand notifications type constraint |
| `app/(dashboard)/crm/page.tsx` | Join `assigned_user` in query, add "Assigned To" column, pass `onAssigned` to drawer |
| `app/(dashboard)/crm/LeadDrawer.tsx` | Add `onAssigned` prop, Assign To section, current owner display |

---

## Task 1: Extend Lead type with assigned_user join shape

**Files:**
- Modify: `gchv-egypt-ai-co-pilot (3)/loomark/types/index.ts`

- [ ] **Step 1: Add `assigned_user` to the `Lead` interface**

Open `types/index.ts`. Find the `Lead` interface. After the line `assigned_to_user?: string;` (currently line 47), insert:

```typescript
assigned_user?: { id: string; name: string } | null;
```

The Lead interface around this area should now look like:
```typescript
export interface Lead {
  id: string;
  name: string;
  phone: string;
  company?: string;
  email?: string;
  source: LeadSource;
  status: LeadStatus;
  assigned_to: string;
  assigned_to_team?: CrmTeam;
  assigned_to_user?: string;
  assigned_user?: { id: string; name: string } | null;  // ← new
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
  profile?: Profile;
}
```

- [ ] **Step 2: Verify no new TypeScript errors**

Run from `gchv-egypt-ai-co-pilot (3)/loomark/`:
```bash
npx tsc --noEmit 2>&1 | head -30
```
Expected: any pre-existing errors are fine — confirm no new errors mentioning `assigned_user`.

---

## Task 2: DB migration — RLS policy + notification constraint

**Files:**
- Create: `gchv-egypt-ai-co-pilot (3)/loomark/supabase/migrations/20260418_plan1_rls_ownership.sql`

> ⚠️ This file must be **run manually** in Supabase Dashboard → SQL Editor. It is not auto-applied.

- [ ] **Step 1: Create the migration file**

```sql
-- Migration: 20260418_plan1_rls_ownership
-- 1. RLS isolation on leads: staff see only their leads; admin/Manager see all
-- 2. Expand notifications.type constraint to include 'meta_lead' (used by Plan 2)

BEGIN;

-- ── LEADS: ENABLE RLS + SELECT POLICY ───────────────────────────────────────

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Drop any existing select policies with common names
DROP POLICY IF EXISTS "leads_select" ON leads;
DROP POLICY IF EXISTS "leads_read" ON leads;
DROP POLICY IF EXISTS "Enable read access for all users" ON leads;

-- admin and Manager roles see all leads.
-- Staff see leads where they are assigned via either field:
--   assigned_to_user (new system) OR assigned_to (legacy system).
-- Both are checked to avoid data loss during transition.
CREATE POLICY "leads_select" ON leads FOR SELECT USING (
  auth.uid() IN (
    SELECT id FROM profiles WHERE role IN ('admin', 'Manager')
  )
  OR assigned_to_user = auth.uid()
  OR assigned_to = auth.uid()
);

-- ── NOTIFICATIONS: EXPAND TYPE CONSTRAINT ───────────────────────────────────

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'lead_assigned',
    'boq_status',
    'call_logged',
    'low_stock',
    'mention',
    'system',
    'meta_lead'
  ));

COMMIT;
```

- [ ] **Step 2: Document how to run it**

Copy the SQL above and execute it in **Supabase Dashboard → SQL Editor**. After running, verify:
- Authentication → Policies → `leads` table shows a `leads_select` policy
- The `notifications` table constraint now includes `meta_lead`

---

## Task 3: CRM page — query join + Assigned To column + onAssigned prop

**Files:**
- Modify: `gchv-egypt-ai-co-pilot (3)/loomark/app/(dashboard)/crm/page.tsx`

- [ ] **Step 1: Update the Supabase select to join assigned_user**

Find `fetchLeads` (around line 89). Change the `.select(...)` call from:
```typescript
.select('*', { count: 'exact' })
```
To:
```typescript
.select('*, assigned_user:profiles!leads_assigned_to_user_fkey(id, name)', { count: 'exact' })
```

The FK alias `profiles!leads_assigned_to_user_fkey` uses the auto-generated PostgreSQL constraint name for `leads.assigned_to_user REFERENCES profiles(id)`.

- [ ] **Step 2: Add "Assigned To" table column**

Find the `columns` array (starts around line 137). Locate the "Actions" column object — it has `fixed: 'right'`. Insert the following column **immediately before** the Actions column:

```typescript
{
  title: 'المعين (Assigned To)',
  key: 'assigned_user',
  width: 140,
  render: (_: unknown, record: Lead) =>
    record.assigned_user?.name ? (
      <Text>{record.assigned_user.name}</Text>
    ) : (
      <Text type="secondary">—</Text>
    ),
},
```

- [ ] **Step 3: Pass `onAssigned` to `<LeadDrawer>`**

Find the `<LeadDrawer>` block (around line 410). Change it from:
```tsx
<LeadDrawer
  lead={selectedLead}
  open={drawerOpen}
  onClose={() => setDrawerOpen(false)}
  onEdit={(lead: Lead) => { setDrawerOpen(false); setEditingLead(lead); setModalOpen(true); }}
/>
```
To:
```tsx
<LeadDrawer
  lead={selectedLead}
  open={drawerOpen}
  onClose={() => setDrawerOpen(false)}
  onEdit={(lead: Lead) => { setDrawerOpen(false); setEditingLead(lead); setModalOpen(true); }}
  onAssigned={() => fetchLeads()}
/>
```

- [ ] **Step 4: Verify no new TypeScript errors**

```bash
npx tsc --noEmit 2>&1 | head -30
```
Expected: no new errors from these three changes.

---

## Task 4: LeadDrawer — Assign To UI + current owner display

**Files:**
- Modify: `gchv-egypt-ai-co-pilot (3)/loomark/app/(dashboard)/crm/LeadDrawer.tsx`

Read the full current file before making any changes — several edits touch different locations.

- [ ] **Step 1: Add `onAssigned` to `LeadDrawerProps`**

Find the `LeadDrawerProps` interface (currently lines 31–36):
```typescript
interface LeadDrawerProps {
  lead: Lead | null;
  open: boolean;
  onClose: () => void;
  onEdit: (lead: Lead) => void;
}
```
Change to:
```typescript
interface LeadDrawerProps {
  lead: Lead | null;
  open: boolean;
  onClose: () => void;
  onEdit: (lead: Lead) => void;
  onAssigned?: () => void;
}
```

- [ ] **Step 2: Destructure `onAssigned` in the component signature**

Find:
```typescript
export default function LeadDrawer({ lead, open, onClose, onEdit }: LeadDrawerProps) {
```
Change to:
```typescript
export default function LeadDrawer({ lead, open, onClose, onEdit, onAssigned }: LeadDrawerProps) {
```

- [ ] **Step 3: Add assignment state variables**

Find `const supabase = createClient();` (around line 47). Add four new state variables immediately after it:

```typescript
const [assignTeam, setAssignTeam] = useState<string | undefined>();
const [assignUser, setAssignUser] = useState<string | undefined>();
const [teamUsers, setTeamUsers] = useState<{ id: string; name: string }[]>([]);
const [assigning, setAssigning] = useState(false);
```

- [ ] **Step 4: Initialize assignment state when drawer opens**

Find the `useEffect` that calls `fetchActivities`, `fetchBoqs`, `fetchCalls` (lines 86–92). Add a **second** `useEffect` immediately after it:

```typescript
useEffect(() => {
  if (open && lead) {
    setAssignTeam(lead.assigned_to_team);
    setAssignUser(lead.assigned_to_user);
    if (lead.assigned_to_team) {
      supabase
        .from('profiles')
        .select('id, name')
        .eq('crm_team', lead.assigned_to_team)
        .then(({ data }) => setTeamUsers((data || []) as { id: string; name: string }[]));
    } else {
      setTeamUsers([]);
    }
  }
}, [open, lead, supabase]);
```

- [ ] **Step 5: Add `handleTeamChange` function**

Find `handleFBUpdate` (around line 124). After its closing `}`, add:

```typescript
const handleTeamChange = async (team: string) => {
  setAssignTeam(team);
  setAssignUser(undefined);
  const { data } = await supabase
    .from('profiles')
    .select('id, name')
    .eq('crm_team', team);
  setTeamUsers((data || []) as { id: string; name: string }[]);
};
```

- [ ] **Step 6: Add `handleAssign` function**

Immediately after `handleTeamChange`, add:

```typescript
const handleAssign = async () => {
  if (!lead || !assignTeam || !assignUser) return;
  setAssigning(true);
  try {
    const { error: updateError } = await supabase
      .from('leads')
      .update({ assigned_to_team: assignTeam, assigned_to_user: assignUser })
      .eq('id', lead.id);
    if (updateError) throw updateError;

    const { error: notifError } = await supabase
      .from('notifications')
      .insert({
        user_id: assignUser,
        title: 'تم تعيين ليد جديد ليك',
        type: 'lead_assigned',
        reference_id: lead.id,
        reference_type: 'lead',
      });
    if (notifError) throw notifError;

    message.success('تم تعيين الليد بنجاح');
    onAssigned?.();
  } catch (err) {
    console.error('Assign error:', err);
    message.error('فشل التعيين');
  } finally {
    setAssigning(false);
  }
};
```

- [ ] **Step 7A: Add current owner display at top of Details tab**

Find the Details tab (`key: '1'`) children. Its content starts with `<Descriptions column={1} ...>`. Insert the owner banner **before** that `<Descriptions>` opening tag:

```tsx
{lead.assigned_user?.name && (
  <div className="flex items-center gap-2 mb-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
    <Tag color="blue" style={{ margin: 0 }}>المعين</Tag>
    <Text strong>{lead.assigned_user.name}</Text>
  </div>
)}
```

- [ ] **Step 7B: Add Assign To section after follow-ups**

Find the end of the follow-ups section — the closing `</div>` after the FB3 checkbox block (the third `<div className="flex items-center justify-between p-3...">` block). After that closing `</div>` and before the closing `</>` of the Details tab children, add:

```tsx
<Divider>تعيين (Assign To)</Divider>
<div className="flex flex-col gap-3">
  <Select
    placeholder="اختر الفريق (Select Team)"
    value={assignTeam}
    onChange={handleTeamChange}
    className="w-full"
    options={[
      { value: 'tech', label: 'Tech Team' },
      { value: 'cs', label: 'CS Team' },
    ]}
  />
  <Select
    placeholder="اختر المستخدم (Select User)"
    value={assignUser}
    onChange={(v: string) => setAssignUser(v)}
    className="w-full"
    disabled={!assignTeam || teamUsers.length === 0}
    options={teamUsers.map((u) => ({ value: u.id, label: u.name }))}
    notFoundContent="لا يوجد مستخدمون في هذا الفريق"
  />
  <Button
    type="primary"
    block
    loading={assigning}
    disabled={!assignTeam || !assignUser}
    onClick={handleAssign}
    style={{ backgroundColor: '#D72B2B', borderColor: '#D72B2B' }}
  >
    تعيين (Assign)
  </Button>
</div>
```

- [ ] **Step 8: Verify no new TypeScript errors**

```bash
npx tsc --noEmit 2>&1 | head -30
```
Expected: no new errors from these changes.

---

## Self-Review

- [x] **Spec coverage:**
  - ✅ RLS policy with dual-field check → Task 2
  - ✅ Notification constraint expanded with `meta_lead` → Task 2
  - ✅ `assigned_user` join type → Task 1
  - ✅ Query join → Task 3, Step 1
  - ✅ Assigned To column in leads list → Task 3, Step 2
  - ✅ `onAssigned` wired in CRM page → Task 3, Step 3
  - ✅ `onAssigned` prop on LeadDrawer → Task 4, Steps 1–2
  - ✅ Assign To UI (team → user → button → notification) → Task 4, Steps 3–6 + 7B
  - ✅ Current owner display in drawer → Task 4, Step 7A

- [x] **Placeholder scan:** No TBD, no "handle edge cases", no "similar to Task N". Every step has complete code.

- [x] **Type consistency:**
  - `assigned_user?: { id: string; name: string } | null` defined in Task 1, consumed in Task 3 Step 2 (`record.assigned_user?.name`) and Task 4 Step 7A (`lead.assigned_user?.name`)
  - `onAssigned?: () => void` defined in Task 4 Step 1, consumed in Task 3 Step 3 (`onAssigned={() => fetchLeads()}`) and called in Task 4 Step 6 (`onAssigned?.()`)
  - All state variables (`assignTeam`, `assignUser`, `teamUsers`, `assigning`) defined in Task 4 Step 3 before first use in Steps 4–7
