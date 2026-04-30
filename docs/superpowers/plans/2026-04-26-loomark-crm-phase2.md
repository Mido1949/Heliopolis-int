# Loomark CRM Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add page-transition quotes, auto activity timeline, 24h daily tasks logic, and admin role fix to the Loomark CRM.

**Architecture:** Client-side `NavigationLoader` component watches `usePathname()` for transitions; activity auto-logging added inline to existing handlers; daily tasks upgraded to a Postgres RPC that combines `next_follow_up` overdue + 24h inactivity logic; admin role verified via SQL.

**Tech Stack:** Next.js 14 App Router · Supabase JS v2 · Ant Design 5 · Tailwind CSS · Framer Motion (already installed)

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Create | `supabase/migrations/20260426_get_daily_tasks.sql` | Postgres function for combined daily tasks logic |
| Create | `components/layout/NavigationLoader.tsx` | Shows LoadingScreen for 600ms on every route change |
| Modify | `components/layout/Shell.tsx` | Mount `<NavigationLoader />` |
| Modify | `app/(dashboard)/crm/LeadDrawer.tsx` | Auto-log assignment + call to `lead_activities` |
| Modify | `app/(dashboard)/dashboard/page.tsx` | Use `get_daily_tasks` RPC + reason-based indicators |

---

## Task 1: DB Migration — get_daily_tasks

**Files:**
- Create: `supabase/migrations/20260426_get_daily_tasks.sql`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/20260426_get_daily_tasks.sql` with this exact content:

```sql
CREATE OR REPLACE FUNCTION public.get_daily_tasks(p_user_id UUID DEFAULT NULL)
RETURNS TABLE (
  id             UUID,
  name           TEXT,
  next_follow_up TIMESTAMPTZ,
  status         TEXT,
  reason         TEXT
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

- [ ] **Step 2: Run in Supabase SQL Editor**

Open Supabase Dashboard → SQL Editor, paste and run the SQL above.

Expected: `Success. No rows returned.`

- [ ] **Step 3: Verify**

Run in SQL Editor:
```sql
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_name = 'get_daily_tasks';
```
Expected: one row returned.

- [ ] **Step 4: Verify admin role**

Run in SQL Editor:
```sql
SELECT id, name, email, role FROM profiles WHERE email = 'admin@gchvegypt.com';
```

If `role` is not `'admin'`, run:
```sql
UPDATE profiles SET role = 'admin' WHERE email = 'admin@gchvegypt.com';
```

---

## Task 2: NavigationLoader Component

**Files:**
- Create: `components/layout/NavigationLoader.tsx`
- Modify: `components/layout/Shell.tsx` (lines 1–12 imports + line 37 render)

- [ ] **Step 1: Create the component**

Create `components/layout/NavigationLoader.tsx` with this exact content:

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

- [ ] **Step 2: Add to Shell.tsx**

Open `components/layout/Shell.tsx`.

Add the import after the existing imports:
```tsx
import NavigationLoader from './NavigationLoader';
```

Find the return statement's root `<div>`:
```tsx
return (
  <div className="min-h-screen bg-[#F4F6F8] font-sans text-slate-900">
```

Add `<NavigationLoader />` as the first child:
```tsx
return (
  <div className="min-h-screen bg-[#F4F6F8] font-sans text-slate-900">
    <NavigationLoader />
    <Sidebar
```

- [ ] **Step 3: Verify locally**

Run `npm run dev` and navigate between Dashboard → CRM → Reports. Each transition should flash the dark LoadingScreen with a random Arabic quote for ~600ms.

- [ ] **Step 4: Commit**

```bash
git add components/layout/NavigationLoader.tsx components/layout/Shell.tsx
git commit -m "feat: add page-transition loading screen with Arabic quotes"
```

---

## Task 3: Auto-log Assignment in LeadDrawer

**Files:**
- Modify: `app/(dashboard)/crm/LeadDrawer.tsx` (around line 233 — `handleAssign`)

- [ ] **Step 1: Add activity insert after successful assignment**

Open `app/(dashboard)/crm/LeadDrawer.tsx`.

Find the `handleAssign` function. After line 258 (`message.success('تم تعيين الليد بنجاح');`), add:

```tsx
const assignedName = teamUsers.find(u => u.id === assignUser)?.name ?? assignUser;
await supabase.from('lead_activities').insert({
  lead_id: lead.id,
  user_id: user?.id,
  type: 'assignment',
  body: `تم التعيين لـ: ${assignedName}`,
});
```

The block should look like this after the edit:

```tsx
message.success('تم تعيين الليد بنجاح');

const assignedName = teamUsers.find(u => u.id === assignUser)?.name ?? assignUser;
await supabase.from('lead_activities').insert({
  lead_id: lead.id,
  user_id: user?.id,
  type: 'assignment',
  body: `تم التعيين لـ: ${assignedName}`,
});

onAssigned?.();
```

- [ ] **Step 2: Verify**

Open any lead → assign it to a team member → check the Activity tab. An entry with type `assignment` and body "تم التعيين لـ: [Name]" should appear.

---

## Task 4: Auto-log Calls in LeadDrawer

**Files:**
- Modify: `app/(dashboard)/crm/LeadDrawer.tsx` (around line 171 — `handleLogCall`)

- [ ] **Step 1: Add activity insert after successful call log**

Find the `handleLogCall` function. After the successful `call_logs` insert and before `message.success(...)`, add:

```tsx
await supabase.from('lead_activities').insert({
  lead_id: lead.id,
  user_id: user.id,
  type: 'call',
  body: `${values.outcome} — ${values.duration_minutes ?? 0} دقيقة`,
  duration_seconds: values.duration_minutes ? values.duration_minutes * 60 : null,
});
```

The block should look like:

```tsx
const { error } = await supabase
  .from('call_logs')
  .insert({
    lead_id: lead.id,
    user_id: user.id,
    ...values
  });

if (error) throw error;

await supabase.from('lead_activities').insert({
  lead_id: lead.id,
  user_id: user.id,
  type: 'call',
  body: `${values.outcome} — ${values.duration_minutes ?? 0} دقيقة`,
  duration_seconds: values.duration_minutes ? values.duration_minutes * 60 : null,
});

message.success('تم تسجيل المكالمة بنجاح');
```

- [ ] **Step 2: Verify**

Open any lead → Calls tab → log a call. Go to the Activity tab. An entry with type `call` should appear alongside the manual entries.

- [ ] **Step 3: Commit**

```bash
git add app/\(dashboard\)/crm/LeadDrawer.tsx
git commit -m "feat: auto-log assignment and call events to lead_activities"
```

---

## Task 5: Dashboard — get_daily_tasks RPC

**Files:**
- Modify: `app/(dashboard)/dashboard/page.tsx` (lines 20–92)

- [ ] **Step 1: Add useAuth import and state type update**

Open `app/(dashboard)/dashboard/page.tsx`.

Add the import at the top (after existing imports):
```tsx
import { useAuth } from '@/context/AuthContext';
```

Inside `DashboardPage()`, add after `const supabase = createClient();`:
```tsx
const { user, isAdmin, isManager } = useAuth();
```

Change the `todayTasks` state type from:
```tsx
const [todayTasks, setTodayTasks] = useState<{ id: string; name: string; next_follow_up: string }[]>([]);
```
to:
```tsx
const [todayTasks, setTodayTasks] = useState<{ id: string; name: string; next_follow_up: string | null; status: string; reason: string }[]>([]);
```

- [ ] **Step 2: Replace the tasks query in Promise.all + fix useEffect deps**

Find this line inside the `Promise.all` array (line ~67):
```tsx
supabase.from('leads').select('id, name, next_follow_up').lte('next_follow_up', new Date().toISOString()).not('next_follow_up', 'is', null).order('next_follow_up', { ascending: true }).limit(20),
```

Replace it with:
```tsx
supabase.rpc('get_daily_tasks', { p_user_id: (isAdmin || isManager) ? null : (user?.id ?? null) }),
```

Also update the `useEffect` dependency array at the bottom of `fetchDashboardData` from:
```tsx
}, [supabase]);
```
to:
```tsx
}, [supabase, user?.id, isAdmin, isManager]);
```
This ensures the RPC re-runs with the correct `p_user_id` once auth loads.

- [ ] **Step 3: Update the UI row indicators**

Find the `todayTasks.map(task => {` block (around line 222). Replace the `isOverdue` logic and label:

Old code:
```tsx
{todayTasks.map(task => {
  const isOverdue = new Date(task.next_follow_up) < new Date(new Date().setHours(0,0,0,0));
  return (
    <button
      key={task.id}
      onClick={async () => {
        const { data } = await supabase.from('leads').select('*, assigned_user:profiles!leads_assigned_to_user_fkey(id, name)').eq('id', task.id).single();
        if (data) { setSelectedTaskLead(data as Lead); setTaskDrawerOpen(true); }
      }}
      className="w-full flex items-center justify-between p-2.5 rounded-lg border border-slate-100 hover:border-slate-300 transition-colors text-right"
    >
      <span className="text-sm text-[#0D2137] font-medium">{task.name}</span>
      <span className={`flex items-center gap-1 text-xs font-medium ${isOverdue ? 'text-red-500' : 'text-amber-500'}`}>
        <span className={`w-2 h-2 rounded-full ${isOverdue ? 'bg-red-500' : 'bg-amber-400'}`} />
        {isOverdue ? 'متأخر' : 'اليوم'}
      </span>
    </button>
  );
})}
```

New code:
```tsx
{todayTasks.map(task => {
  const isOverdue = task.reason === 'overdue';
  const isNoActivity = task.reason === 'no_activity';
  return (
    <button
      key={task.id}
      onClick={async () => {
        const { data } = await supabase.from('leads').select('*, assigned_user:profiles!leads_assigned_to_user_fkey(id, name)').eq('id', task.id).single();
        if (data) { setSelectedTaskLead(data as Lead); setTaskDrawerOpen(true); }
      }}
      className="w-full flex items-center justify-between p-2.5 rounded-lg border border-slate-100 hover:border-slate-300 transition-colors text-right"
    >
      <span className="text-sm text-[#0D2137] font-medium">{task.name}</span>
      <span className={`flex items-center gap-1 text-xs font-medium ${isOverdue ? 'text-red-500' : 'text-amber-500'}`}>
        <span className={`w-2 h-2 rounded-full ${isOverdue ? 'bg-red-500' : 'bg-amber-400'}`} />
        {isOverdue ? 'متأخر' : isNoActivity ? 'لا نشاط 24س' : 'اليوم'}
      </span>
    </button>
  );
})}
```

- [ ] **Step 4: Verify**

Open the Dashboard. The "مهام اليوم" widget should now show:
- 🔴 "متأخر" for leads with `next_follow_up` in the past
- 🟡 "لا نشاط 24س" for active leads with no activity in 24 hours

- [ ] **Step 5: Commit**

```bash
git add app/\(dashboard\)/dashboard/page.tsx
git commit -m "feat: upgrade daily tasks to 24h inactivity + overdue logic via RPC"
```

---

## Task 6: Build Verification + Deploy

**Files:** none

- [ ] **Step 1: Type check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 2: Build**

```bash
npm run build
```
Expected: `✓ Compiled successfully` with no errors (warnings about `useEffect` deps in `calls/page.tsx` are pre-existing and safe to ignore).

- [ ] **Step 3: Deploy**

```bash
npx vercel --prod --yes
```
Expected: `Aliased: https://loomark.vercel.app`

- [ ] **Step 4: Smoke test on production**

1. Login → confirm quotes rotate on the left panel
2. Navigate Dashboard → CRM → Reports → confirm LoadingScreen flashes on each transition
3. Open any lead → Activity tab → assign to a team member → confirm assignment entry appears
4. Open any lead → Calls tab → log a call → Activity tab shows the call entry
5. Dashboard "مهام اليوم" shows 🔴 متأخر and 🟡 لا نشاط 24س indicators
