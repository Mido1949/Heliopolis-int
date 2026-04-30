# Loomark CRM Phase 2 — Design Spec (Spec A)
**Date:** 2026-04-26  
**Project:** Loomark / Heliopolis International (GCHV Egypt)  
**Stack:** Next.js 14 App Router · Supabase · Ant Design · Tailwind · Framer Motion

---

## 1. Page Transition Loader

### Goal
Show the branded `LoadingScreen` (dark background + random Arabic quote) during every client-side navigation between pages inside the app.

### Implementation

**New file:** `components/layout/NavigationLoader.tsx`

```tsx
'use client';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import LoadingScreen from '@/components/shared/LoadingScreen';

export default function NavigationLoader() {
  const pathname = usePathname();
  const isInitialMount = useRef(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(timer);
  }, [pathname]);

  if (!loading) return null;
  return <LoadingScreen />;
}
```

**Modified file:** `components/layout/Shell.tsx`
- Import `NavigationLoader`
- Render `<NavigationLoader />` as the first child inside the root `<div>`

---

## 2. Auto Activity Timeline

### Goal
Every significant lead event is recorded automatically in `lead_activities` without any user action. The activity tab shows a complete, chronological history of the lead's lifecycle.

### Events Matrix

| Event | Trigger location | Type | Body |
|---|---|---|---|
| Lead created | `LeadFormModal` — on insert ✅ already done | `creation` | — |
| Status changed | `LeadFormModal` + `KanbanView` ✅ already done | `status_change` | `"Old → New"` |
| Assigned to user | `LeadDrawer` `handleAssign()` — **new** | `assignment` | `"تم التعيين لـ: {name}"` |
| Call logged | `LeadDrawer` calls tab handler — **new** | `call` | `"{outcome} — {duration}s"` |
| Call logged (from Calls page) | `calls/page.tsx` log handler — **new** | `call` | `"{outcome}"` |

### Implementation

**`LeadDrawer.tsx` — `handleAssign()`**
After the successful `update` of `assigned_to_user`, insert:
```ts
const assignedName = teamUsers.find(u => u.id === assignUser)?.name ?? assignUser;
await supabase.from('lead_activities').insert({
  lead_id: lead.id,
  user_id: user?.id,
  type: 'assignment',
  body: `تم التعيين لـ: ${assignedName}`,
});
```

**`LeadDrawer.tsx` — call log handler**
After inserting into `call_logs`, also insert:
```ts
await supabase.from('lead_activities').insert({
  lead_id: lead.id,
  user_id: user?.id,
  type: 'call',
  body: `${outcome} — ${duration ?? 0}ث`,
  duration_seconds: duration ?? null,
});
```

**`calls/page.tsx` — log handler**
Same pattern: after `call_logs` insert, mirror into `lead_activities`.

### Activity Tab — unified view
The activity tab in `LeadDrawer` already reads from `lead_activities`. Since calls are now mirrored there automatically, no UI change needed — the tab shows everything in one place.

---

## 3. Daily Tasks — 24h Logic

### Goal
"مهام اليوم" widget on the dashboard shows leads that need attention based on two conditions:
1. `next_follow_up <= now()` — scheduled follow-up is overdue or due today
2. Status not in `('Won', 'Lost')` AND no activity recorded in the last 24 hours

### Database — Postgres Function

**Migration:** `supabase/migrations/20260426_get_daily_tasks.sql`

```sql
CREATE OR REPLACE FUNCTION public.get_daily_tasks(p_user_id UUID DEFAULT NULL)
RETURNS TABLE (
  id            UUID,
  name          TEXT,
  next_follow_up TIMESTAMPTZ,
  status        TEXT,
  reason        TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT DISTINCT ON (l.id)
    l.id,
    l.name,
    l.next_follow_up,
    l.status,
    CASE
      WHEN l.next_follow_up IS NOT NULL AND l.next_follow_up <= now() THEN 'overdue'
      ELSE 'no_activity'
    END AS reason
  FROM leads l
  WHERE (p_user_id IS NULL OR l.assigned_to_user = p_user_id)
    AND (
      (l.next_follow_up IS NOT NULL AND l.next_follow_up <= now())
      OR (
        l.status NOT IN ('Won', 'Lost')
        AND NOT EXISTS (
          SELECT 1 FROM lead_activities la
          WHERE la.lead_id = l.id
            AND la.created_at > now() - INTERVAL '24 hours'
        )
      )
    )
  ORDER BY l.id, l.next_follow_up ASC NULLS LAST
  LIMIT 20;
$$;

GRANT EXECUTE ON FUNCTION public.get_daily_tasks(UUID) TO authenticated;
```

**Admin/Manager behavior:** Pass `p_user_id = null` → function skips the `assigned_to_user` filter → sees all leads.

```ts
// dashboard/page.tsx
const taskUserId = (isAdmin || isManager) ? null : user?.id ?? null;
supabase.rpc('get_daily_tasks', { p_user_id: taskUserId })
```

### UI — `dashboard/page.tsx`

- Replace the existing `leads.select(...).lte('next_follow_up', ...)` query with `supabase.rpc('get_daily_tasks', { p_user_id: user.id })`
- Add `reason` field to `todayTasks` state type: `{ id, name, next_follow_up, status, reason }`
- Row indicators:
  - `reason === 'overdue'` → 🔴 red dot + "متأخر"
  - `reason === 'no_activity'` → 🟡 amber dot + "لا نشاط 24س"

---

## 4. Admin Role Verification

### Goal
Confirm `admin@gchvegypt.com` has `role = 'admin'` in the `profiles` table. Fix if not.

### SQL (run in Supabase SQL Editor)

**Check:**
```sql
SELECT id, name, email, role FROM profiles WHERE email = 'admin@gchvegypt.com';
```

**Fix if role is wrong:**
```sql
UPDATE profiles SET role = 'admin' WHERE email = 'admin@gchvegypt.com';
```

---

## Summary of Changes

| Type | Path | Change |
|---|---|---|
| Create | `components/layout/NavigationLoader.tsx` | New component — route-change loader |
| Modify | `components/layout/Shell.tsx` | Add `<NavigationLoader />` |
| Modify | `app/(dashboard)/crm/LeadDrawer.tsx` | Auto-log assignment + call |
| Modify | `app/(dashboard)/calls/page.tsx` | Auto-log call to `lead_activities` |
| Modify | `app/(dashboard)/dashboard/page.tsx` | Use `get_daily_tasks` RPC + reason indicators |
| Migration | `supabase/migrations/20260426_get_daily_tasks.sql` | New Postgres function |
| SQL (manual) | Supabase SQL Editor | Verify/fix admin role |
