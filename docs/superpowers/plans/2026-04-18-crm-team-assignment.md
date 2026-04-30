# CRM Team Assignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `crm_team` to profiles, expose it in user settings, and add an "Assign To" panel in the lead drawer that saves `assigned_to_team` + `assigned_to_user` on the lead and fires a notification to the assigned user.

**Architecture:** All DB columns already exist in Supabase (added manually). This plan covers only TypeScript types, UI components, and Supabase client calls. No API routes needed — all mutations are direct Supabase client calls from the browser.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase JS client, Ant Design (Select, Button, Divider), Tailwind CSS

---

## File Map

| File | Change |
|------|--------|
| `types/index.ts` | Add `CrmTeam` type; extend `Profile` and `Lead` interfaces |
| `supabase/migrations/20260418_crm_team_assignment.sql` | Document the DB changes already applied |
| `app/(dashboard)/settings/page.tsx` | Add `crm_team` state + Select + save |
| `app/(dashboard)/crm/LeadDrawer.tsx` | Add `onAssigned` prop + assign UI + notification insert |
| `app/(dashboard)/crm/page.tsx` | Pass `onAssigned={fetchLeads}` to `<LeadDrawer>` |

---

## Task 1: Add TypeScript types

**Files:**
- Modify: `types/index.ts`

- [ ] **Step 1: Add `CrmTeam` union type after `UserTeam` on line 8**

Open `types/index.ts`. After line 8 (`export type UserTeam = ...`), insert:

```typescript
export type CrmTeam = 'tech' | 'cs';
```

- [ ] **Step 2: Add `crm_team` to the `Profile` interface**

Inside the `Profile` interface (currently lines 22–33), add `crm_team` as an optional field after `team`:

```typescript
export interface Profile {
  id: string;
  name: string;
  role: UserRole;
  team: UserTeam;
  crm_team?: CrmTeam;   // ← add this line
  phone?: string;
  avatar_url?: string;
  email?: string;
  score: number;
  is_admin?: boolean;
  created_at: string;
}
```

- [ ] **Step 3: Add `assigned_to_team` and `assigned_to_user` to the `Lead` interface**

Inside the `Lead` interface (currently lines 35–58), add both fields after `assigned_to`:

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
  assigned_to_team?: CrmTeam;   // ← add
  assigned_to_user?: string;    // ← add (UUID)
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
```

- [ ] **Step 4: Verify TypeScript compiles**

Run from `gchv-egypt-ai-co-pilot (3)/loomark/`:

```bash
npx tsc --noEmit
```

Expected: no errors related to `CrmTeam`, `crm_team`, `assigned_to_team`, or `assigned_to_user`.

- [ ] **Step 5: Commit**

```bash
git add "gchv-egypt-ai-co-pilot (3)/loomark/types/index.ts"
git commit -m "feat(types): add CrmTeam, crm_team on Profile, assignment fields on Lead"
```

---

## Task 2: Document DB migration

**Files:**
- Create: `supabase/migrations/20260418_crm_team_assignment.sql`

- [ ] **Step 1: Create the migration file**

Create `gchv-egypt-ai-co-pilot (3)/loomark/supabase/migrations/20260418_crm_team_assignment.sql` with the following content (these columns were already applied manually — this file is for version-control record only):

```sql
-- Migration: 20260418_crm_team_assignment
-- Columns added manually to Supabase; this file documents the change.

-- Add crm_team to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS crm_team TEXT CHECK (crm_team IN ('tech', 'cs'));

-- Add assignment columns to leads
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS assigned_to_team TEXT CHECK (assigned_to_team IN ('tech', 'cs')),
  ADD COLUMN IF NOT EXISTS assigned_to_user UUID REFERENCES profiles(id);

-- Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_profiles_crm_team ON profiles(crm_team);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_user ON leads(assigned_to_user);
```

- [ ] **Step 2: Commit**

```bash
git add "gchv-egypt-ai-co-pilot (3)/loomark/supabase/migrations/20260418_crm_team_assignment.sql"
git commit -m "chore(db): document crm_team and lead assignment migration"
```

---

## Task 3: Add `crm_team` selector in user settings

**Files:**
- Modify: `app/(dashboard)/settings/page.tsx`

The settings page already imports `{ App } from 'antd'`. We need to add `Select` to that import and add a `crm_team` field to the form.

- [ ] **Step 1: Add `Select` to the antd import and `CrmTeam` to the types import**

Change line 11 (current):
```typescript
import { App } from 'antd';
```
To:
```typescript
import { App, Select } from 'antd';
```

Change line 9 (current):
```typescript
import type { Profile } from '@/types';
```
To:
```typescript
import type { Profile, CrmTeam } from '@/types';
```

- [ ] **Step 2: Add `crmTeam` state variable**

After line 22 (`const [phone, setPhone] = useState('');`), add:

```typescript
const [crmTeam, setCrmTeam] = useState<string>('');
```

- [ ] **Step 3: Initialize `crmTeam` from fetched profile**

Inside the `fetchData` function, after `setPhone(pData.phone || '');` (currently line 41), add:

```typescript
setCrmTeam(pData.crm_team || '');
```

- [ ] **Step 4: Include `crm_team` in the save payload**

Inside `handleSave`, change the `update()` call (currently lines 69–73) to:

```typescript
const { error } = await supabase
  .from('profiles')
  .update({
    name,
    phone,
    crm_team: crmTeam || null,
    updated_at: new Date().toISOString()
  })
  .eq('id', profile.id);
```

Also update the optimistic local state line (currently `setProfile({ ...profile, name, phone })`):

```typescript
setProfile({ ...profile, name, phone, crm_team: (crmTeam as CrmTeam) || undefined });
```

- [ ] **Step 5: Add the `crm_team` Select field to the Profile Details form**

The form grid (currently 2 fields: Display Name, Phone Number) is inside:
```jsx
<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
```

Add a third `<div>` block inside that grid after the Phone Number block:

```jsx
<div className="space-y-2">
  <label className="text-sm font-semibold text-slate-700">CRM Team</label>
  <Select
    value={crmTeam || undefined}
    onChange={(v) => setCrmTeam(v)}
    placeholder="اختر الفريق..."
    allowClear
    className="w-full"
    style={{ height: 48 }}
    options={[
      { value: 'tech', label: 'Tech Team' },
      { value: 'cs', label: 'CS Team' },
    ]}
  />
</div>
```

- [ ] **Step 6: Verify the settings page renders and saves correctly**

Start the dev server (`npm run dev`), navigate to `/settings`, confirm:
1. The "CRM Team" dropdown appears below Display Name / Phone Number
2. Selecting a value and clicking "Save Profile" shows "Profile updated successfully"
3. Refreshing the page retains the selected value

- [ ] **Step 7: Commit**

```bash
git add "gchv-egypt-ai-co-pilot (3)/loomark/app/(dashboard)/settings/page.tsx"
git commit -m "feat(settings): add crm_team selector to profile details form"
```

---

## Task 4: Add "Assign To" section in LeadDrawer

**Files:**
- Modify: `app/(dashboard)/crm/LeadDrawer.tsx`

- [ ] **Step 1: Add `onAssigned` to the `LeadDrawerProps` interface**

Change the interface (currently lines 31–36):

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

Change line 38 (current):
```typescript
export default function LeadDrawer({ lead, open, onClose, onEdit }: LeadDrawerProps) {
```
To:
```typescript
export default function LeadDrawer({ lead, open, onClose, onEdit, onAssigned }: LeadDrawerProps) {
```

- [ ] **Step 3: Add assignment state variables**

After line 47 (`const supabase = createClient();`), add:

```typescript
const [assignTeam, setAssignTeam] = useState<string | undefined>();
const [assignUser, setAssignUser] = useState<string | undefined>();
const [teamUsers, setTeamUsers] = useState<{ id: string; name: string }[]>([]);
const [assigning, setAssigning] = useState(false);
```

- [ ] **Step 4: Initialize assignment state when drawer opens**

After the existing `useEffect` that calls `fetchActivities`, `fetchBoqs`, `fetchCalls` (currently lines 86–92), add a new effect:

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
    }
  }
}, [open, lead, supabase]);
```

- [ ] **Step 5: Add `handleTeamChange` function**

After `handleFBUpdate` (currently ends at line 149), add:

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

- [ ] **Step 7: Add the "Assign To" UI section in the Details tab**

Inside the Details tab (`key: '1'`), after the closing `</div>` of the Follow-ups section (after the third FB checkbox block, currently around line 270), add:

```jsx
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

- [ ] **Step 8: Verify LeadDrawer renders and assignment works**

Start the dev server, navigate to `/crm`, open any lead drawer:
1. The "Assign To" section appears at the bottom of the Details tab
2. Selecting "Tech Team" populates the user dropdown with only `crm_team = 'tech'` profiles
3. Selecting a user and clicking "Assign" shows "تم تعيين الليد بنجاح"
4. Check Supabase `leads` table: `assigned_to_team` and `assigned_to_user` are saved
5. Check Supabase `notifications` table: a row appears with `title = 'تم تعيين ليد جديد ليك'` and the correct `user_id`

- [ ] **Step 9: Commit**

```bash
git add "gchv-egypt-ai-co-pilot (3)/loomark/app/(dashboard)/crm/LeadDrawer.tsx"
git commit -m "feat(crm): add Assign To section in lead drawer with team filter and notification"
```

---

## Task 5: Wire `onAssigned` callback in CRM page

**Files:**
- Modify: `app/(dashboard)/crm/page.tsx`

- [ ] **Step 1: Pass `onAssigned` to `<LeadDrawer>`**

Find the `<LeadDrawer>` usage (currently lines 410–414):

```jsx
<LeadDrawer
  lead={selectedLead}
  open={drawerOpen}
  onClose={() => setDrawerOpen(false)}
  onEdit={(lead: Lead) => { setDrawerOpen(false); setEditingLead(lead); setModalOpen(true); }}
/>
```

Change to:

```jsx
<LeadDrawer
  lead={selectedLead}
  open={drawerOpen}
  onClose={() => setDrawerOpen(false)}
  onEdit={(lead: Lead) => { setDrawerOpen(false); setEditingLead(lead); setModalOpen(true); }}
  onAssigned={() => fetchLeads()}
/>
```

- [ ] **Step 2: Verify end-to-end flow**

1. Open a lead drawer, assign it to a user
2. After clicking "Assign", the leads table in the background silently refreshes (no visual flash needed, just confirms no error)
3. Re-open the same lead drawer — `assigned_to_team` and `assigned_to_user` are pre-selected

- [ ] **Step 3: Commit**

```bash
git add "gchv-egypt-ai-co-pilot (3)/loomark/app/(dashboard)/crm/page.tsx"
git commit -m "feat(crm): refresh leads list after assignment"
```

---

## Self-Review Checklist

- [x] **Spec coverage**: All 3 original requirements covered — TypeScript types (Task 1), settings selector (Task 3), assign UI with team filter (Task 4), notification insert (Task 4 Step 6)
- [x] **No placeholders**: Every step has actual code
- [x] **Type consistency**: `CrmTeam` defined in Task 1 and used in Tasks 3, 4. `assigned_to_team` and `assigned_to_user` defined in Task 1, used in Task 4. `onAssigned` prop defined and consumed consistently across Tasks 4 and 5
- [x] **Migration file**: Added in Task 2 for record-keeping (DB already updated)
