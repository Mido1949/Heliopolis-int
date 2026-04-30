# Plan 1 — Lead Ownership + Assign To: Design Spec

**Date:** 2026-04-18  
**Status:** Approved

---

## Scope

Combines three incomplete/new items into one cohesive plan:
1. **Tasks 4–5 (incomplete):** LeadDrawer "Assign To" UI + CRM page wiring
2. **RLS isolation:** Staff see only their leads; admin/manager see all
3. **Owner name display:** Show assigned user's name in leads list and drawer

---

## Data Layer

### RLS Policy

```sql
DROP POLICY IF EXISTS "leads_select" ON leads;
CREATE POLICY "leads_select" ON leads FOR SELECT USING (
  auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin', 'Manager'))
  OR assigned_to_user = auth.uid()
  OR assigned_to = auth.uid()
);
```

Both `assigned_to_user` (new) and `assigned_to` (legacy) are checked to avoid data loss during transition.

### Notification Constraint Expansion

```sql
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('lead_assigned','boq_status','call_logged','low_stock','mention','system','meta_lead'));
```

`'meta_lead'` added here (needed by Plan 2) to avoid a second constraint migration.

---

## TypeScript Types

Add to `Lead` interface in `types/index.ts`:
```typescript
assigned_user?: { id: string; name: string } | null;
```
Represents the Supabase join result from `profiles!leads_assigned_to_user_fkey`.

---

## CRM Page (`page.tsx`)

- Query: `select('*, assigned_user:profiles!leads_assigned_to_user_fkey(id, name)')`
- New table column **"Assigned To"** showing `record.assigned_user?.name ?? '—'`
- Pass `onAssigned={() => fetchLeads()}` to `<LeadDrawer>`

---

## LeadDrawer (`LeadDrawer.tsx`)

### New prop
```typescript
onAssigned?: () => void;
```

### Assign To section (Details tab, after follow-ups)
- Dropdown 1: Team (`tech` → "Tech Team" / `cs` → "CS Team")
- Dropdown 2: Users with `crm_team = selectedTeam` queried from `profiles`
- Pre-populated from `lead.assigned_to_team` / `lead.assigned_to_user` on open
- On assign: update `leads.assigned_to_team` + `leads.assigned_to_user`, insert notification `{ user_id, title: 'تم تعيين ليد جديد ليك', type: 'lead_assigned', reference_id: lead.id }`, call `onAssigned?.()`

### Current owner display
Show current assignee name at top of Details tab (from `lead.assigned_user?.name`).

---

## Role Values (Verified)

- `'admin'` — lowercase  
- `'Manager'` — capital M  

Consistent across all existing RLS policies in `schema.sql` and `apply_security_patch.sql`.
