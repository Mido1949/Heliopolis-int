# Tasks Management + Bulk Lead Import — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a split-view Tasks Management page (assign tasks to team members, mark done) and a Bulk Lead Import modal (CSV/Excel upload with upsert-on-duplicate-phone logic).

**Architecture:** Tasks use a new `tasks` Supabase table with RLS (assigned users see their own; admin/Manager see all). The `/tasks` page splits into a personal tasks panel (left) and an admin management panel (right). Bulk import lives in a self-contained `ImportModal.tsx` component wired into the existing CRM page header.

**Tech Stack:** Next.js 14 App Router · Supabase · Ant Design · Tailwind · papaparse (CSV) · xlsx (Excel)

---

## File Map

| Action | Path | Purpose |
|---|---|---|
| Create | `supabase/migrations/20260427_tasks.sql` | tasks table + indexes + RLS policies |
| Modify | `types/index.ts` | Add Task, TaskStatus, TaskPriority types |
| Modify | `lib/constants.ts` | Add tasks nav item |
| Modify | `components/layout/Sidebar.tsx` | Add CheckSquare icon + pending badge |
| Create | `app/(dashboard)/tasks/page.tsx` | Full split-view tasks screen |
| Create | `app/(dashboard)/crm/ImportModal.tsx` | Bulk import modal (3-step) |
| Modify | `app/(dashboard)/crm/page.tsx` | Add import button + wire ImportModal |

---

## Task 1: Install Packages

**Files:**
- No file changes — npm installs only

- [ ] **Step 1: Install runtime dependencies**

Run from `d:\Loomark\gchv-egypt-ai-co-pilot (3)\loomark\`:

```bash
npm install papaparse xlsx --legacy-peer-deps
```

Expected output: `added 2 packages` (or similar). No errors.

- [ ] **Step 2: Install type definitions**

```bash
npm install --save-dev @types/papaparse --legacy-peer-deps
```

Expected: `added 1 package`.

- [ ] **Step 3: Verify build still passes**

```bash
npm run build
```

Expected: ✓ Compiled successfully (no new errors from these packages alone).

---

## Task 2: Database Migration

**Files:**
- Create: `supabase/migrations/20260427_tasks.sql`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/20260427_tasks.sql` with this exact content:

```sql
-- Tasks table
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

- [ ] **Step 2: Run in Supabase SQL Editor**

Open Supabase Dashboard → SQL Editor → paste the entire file → Run.

Expected: `Success. No rows returned.`

If you get `relation "tasks" already exists`, the table was already created — skip to Step 3 and add only the missing RLS policies.

- [ ] **Step 3: Verify the table exists**

In Supabase SQL Editor:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'tasks'
ORDER BY ordinal_position;
```

Expected: 11 rows listing id, title, description, assigned_to, created_by, lead_id, due_date, status, priority, created_at, completed_at.

---

## Task 3: Add Task Type to types/index.ts

**Files:**
- Modify: `types/index.ts`

- [ ] **Step 1: Add the types**

Open `types/index.ts`. After the line `export type CallOutcome = 'Answered' | 'No Answer' | 'Busy' | 'Callback Requested';` (line 20), add:

```typescript
export type TaskStatus = 'pending' | 'done';
export type TaskPriority = 'high' | 'medium' | 'low';
```

Then after the `CallLog` interface (after line 195), add:

```typescript
export interface Task {
  id: string;
  title: string;
  description?: string;
  assigned_to: string;
  created_by: string;
  lead_id?: string | null;
  due_date?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  created_at: string;
  completed_at?: string | null;
  // Joined
  assigned_profile?: { id: string; name: string } | null;
  lead?: { id: string; name: string } | null;
}
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
npx tsc --noEmit
```

Expected: No errors from this change.

---

## Task 4: Add Tasks to NAV_ITEMS + Sidebar

**Files:**
- Modify: `lib/constants.ts`
- Modify: `components/layout/Sidebar.tsx`

- [ ] **Step 1: Add Tasks to NAV_ITEMS in lib/constants.ts**

In `lib/constants.ts`, the `NAV_ITEMS` array ends with `reports`. Add the tasks entry after `calls` (before `ai-assistant`):

```typescript
export const NAV_ITEMS = [
  { key: 'dashboard', labelAr: 'لوحة التحكم', labelEn: 'Dashboard', icon: 'dashboard', path: '/dashboard' },
  { key: 'crm', labelAr: 'إدارة العملاء', labelEn: 'CRM', icon: 'contacts', path: '/crm' },
  { key: 'boq', labelAr: 'عروض الأسعار', labelEn: 'BOQ', icon: 'fileText', path: '/boq' },
  { key: 'email', labelAr: 'حملات البريد', labelEn: 'Email', icon: 'mail', path: '/email' },
  { key: 'inventory', labelAr: 'المخزون', labelEn: 'Inventory', icon: 'database', path: '/inventory' },
  { key: 'time-tracker', labelAr: 'تتبع الوقت', labelEn: 'Time Tracker', icon: 'clock', path: '/time-tracker' },
  { key: 'scraper', labelAr: 'استخراج البيانات', labelEn: 'Scraper', icon: 'search', path: '/scraper' },
  { key: 'calls', labelAr: 'المكالمات', labelEn: 'Calls', icon: 'phone', path: '/calls' },
  { key: 'tasks', labelAr: 'المهام', labelEn: 'Tasks', icon: 'checkSquare', path: '/tasks' },
  { key: 'ai-assistant', labelAr: 'المساعد الذكي', labelEn: 'AI Assistant', icon: 'robot', path: '/ai-assistant' },
  { key: 'reports', labelAr: 'التقارير والأهداف', labelEn: 'Reports', icon: 'barChart', path: '/reports' },
] as const;
```

- [ ] **Step 2: Update Sidebar.tsx — add imports**

In `components/layout/Sidebar.tsx`, change the first few lines to add `useState`, `useEffect`, `CheckSquare`, and `createClient`:

```typescript
'use client';

import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  LayoutDashboard,
  Users,
  FileText,
  Mail,
  Database,
  Clock,
  Search,
  Bot,
  LogOut,
  Phone,
  ChevronLeft,
  ChevronRight,
  BarChart2,
  CheckSquare,
} from 'lucide-react';
import { NAV_ITEMS } from '@/lib/constants';
import { getInitials } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import type { Profile } from '@/types';
```

- [ ] **Step 3: Add checkSquare to ICON_MAP**

In `components/layout/Sidebar.tsx`, update `ICON_MAP` to include `checkSquare`:

```typescript
const ICON_MAP: Record<string, React.ReactNode> = {
  dashboard: <LayoutDashboard className="w-5 h-5" />,
  contacts: <Users className="w-5 h-5" />,
  fileText: <FileText className="w-5 h-5" />,
  mail: <Mail className="w-5 h-5" />,
  database: <Database className="w-5 h-5" />,
  clock: <Clock className="w-5 h-5" />,
  search: <Search className="w-5 h-5" />,
  robot: <Bot className="w-5 h-5" />,
  phone: <Phone className="w-5 h-5" />,
  barChart: <BarChart2 className="w-5 h-5" />,
  checkSquare: <CheckSquare className="w-5 h-5" />,
};
```

- [ ] **Step 4: Add pending badge state inside Sidebar component**

In `components/layout/Sidebar.tsx`, inside the `Sidebar` function body (right after the `const pathname = usePathname();` line), add:

```typescript
const [pendingTasksCount, setPendingTasksCount] = useState(0);

useEffect(() => {
  if (!profile?.id) return;
  const supabase = createClient();
  supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .eq('assigned_to', profile.id)
    .eq('status', 'pending')
    .then(({ count }) => setPendingTasksCount(count || 0));
}, [profile?.id]);
```

- [ ] **Step 5: Render badge on the Tasks nav item**

In `components/layout/Sidebar.tsx`, find the nav item label section inside `NAV_ITEMS.map`. Replace the `{!collapsed && (...)}` block inside the `<Link>` with:

```tsx
{!collapsed && (
  <div className="flex items-center gap-2 flex-1 overflow-hidden">
    <span className="font-medium text-sm whitespace-nowrap overflow-hidden">{label}</span>
    {item.key === 'tasks' && pendingTasksCount > 0 && (
      <span className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none ${
        isActive ? 'bg-white text-[#D72B2B]' : 'bg-[#D72B2B] text-white'
      }`}>
        {pendingTasksCount > 99 ? '99+' : pendingTasksCount}
      </span>
    )}
  </div>
)}
```

- [ ] **Step 6: Verify build**

```bash
npm run build
```

Expected: ✓ Compiled. No TypeScript errors. Tasks item will now appear in sidebar.

---

## Task 5: Create the Tasks Page

**Files:**
- Create: `app/(dashboard)/tasks/page.tsx`

- [ ] **Step 1: Create the file**

Create `app/(dashboard)/tasks/page.tsx` with the full content below:

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Button, Checkbox, Modal, Form, Input, Select, DatePicker,
  Table, Tag, message, Typography,
} from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/context/AuthContext';
import type { Task, Profile, Lead } from '@/types';
import { formatDate } from '@/lib/utils';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

export default function TasksPage() {
  const { user, isAdmin, isManager } = useAuth();
  const supabase = createClient();
  const isPrivileged = isAdmin || isManager;

  // Personal tasks
  const [myTasks, setMyTasks] = useState<Task[]>([]);
  const [myTasksLoading, setMyTasksLoading] = useState(true);

  // Admin panel
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [allTasksLoading, setAllTasksLoading] = useState(false);
  const [adminFilter, setAdminFilter] = useState<'all' | 'pending' | 'done' | 'overdue' | 'linked'>('all');
  const [stats, setStats] = useState({ pending: 0, done: 0, overdue: 0 });

  // Create modal
  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [form] = Form.useForm();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);

  // ── Fetch personal tasks ──────────────────────────────────────────
  const fetchMyTasks = useCallback(async () => {
    if (!user?.id) return;
    setMyTasksLoading(true);
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*, lead:leads(id, name)')
        .eq('assigned_to', user.id)
        .order('status', { ascending: true })
        .order('due_date', { ascending: true, nullsFirst: false });
      if (error) throw error;
      setMyTasks((data || []) as unknown as Task[]);
    } catch {
      message.error('فشل تحميل مهامك');
    } finally {
      setMyTasksLoading(false);
    }
  }, [supabase, user?.id]);

  // ── Fetch all tasks (admin) ───────────────────────────────────────
  const fetchAllTasks = useCallback(async () => {
    if (!isPrivileged) return;
    setAllTasksLoading(true);
    try {
      let query = supabase
        .from('tasks')
        .select('*, assigned_profile:profiles!assigned_to(id, name), lead:leads(id, name)')
        .order('created_at', { ascending: false });

      const now = new Date().toISOString();
      if (adminFilter === 'pending') query = query.eq('status', 'pending');
      else if (adminFilter === 'done') query = query.eq('status', 'done');
      else if (adminFilter === 'overdue') query = query.eq('status', 'pending').lt('due_date', now);
      else if (adminFilter === 'linked') query = query.not('lead_id', 'is', null);

      const { data, error } = await query;
      if (error) throw error;
      setAllTasks((data || []) as unknown as Task[]);
    } catch {
      message.error('فشل تحميل المهام');
    } finally {
      setAllTasksLoading(false);
    }
  }, [supabase, isPrivileged, adminFilter]);

  // ── Fetch stats ───────────────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    if (!isPrivileged) return;
    const now = new Date().toISOString();
    const [
      { count: pending },
      { count: done },
      { count: overdue },
    ] = await Promise.all([
      supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('status', 'done'),
      supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending')
        .lt('due_date', now),
    ]);
    setStats({ pending: pending || 0, done: done || 0, overdue: overdue || 0 });
  }, [supabase, isPrivileged]);

  // ── Fetch form data ───────────────────────────────────────────────
  const fetchFormData = useCallback(async () => {
    const [{ data: profs }, { data: lds }] = await Promise.all([
      supabase.from('profiles').select('id, name').order('name'),
      supabase.from('leads').select('id, name').order('name').limit(200),
    ]);
    setProfiles((profs || []) as Profile[]);
    setLeads((lds || []) as Lead[]);
  }, [supabase]);

  // ── Initial load ──────────────────────────────────────────────────
  useEffect(() => {
    fetchMyTasks();
  }, [fetchMyTasks]);

  useEffect(() => {
    if (isPrivileged) {
      fetchAllTasks();
      fetchStats();
      fetchFormData();
    }
  }, [isPrivileged, fetchAllTasks, fetchStats, fetchFormData]);

  useEffect(() => {
    if (isPrivileged) fetchAllTasks();
  }, [adminFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mark done / undo ─────────────────────────────────────────────
  const handleMarkDone = async (task: Task) => {
    const newStatus = task.status === 'done' ? 'pending' : 'done';
    const { error } = await supabase
      .from('tasks')
      .update({
        status: newStatus,
        completed_at: newStatus === 'done' ? new Date().toISOString() : null,
      })
      .eq('id', task.id);
    if (error) {
      message.error('فشل تحديث المهمة');
    } else {
      fetchMyTasks();
      if (isPrivileged) { fetchAllTasks(); fetchStats(); }
    }
  };

  // ── Delete task ───────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('tasks').delete().eq('id', id);
    if (error) {
      message.error('فشل حذف المهمة');
    } else {
      message.success('تم حذف المهمة');
      fetchMyTasks();
      fetchAllTasks();
      fetchStats();
    }
  };

  // ── Create task ───────────────────────────────────────────────────
  const handleCreate = async () => {
    setModalLoading(true);
    try {
      const values = await form.validateFields();
      const payload = {
        ...values,
        due_date: values.due_date ? (values.due_date as dayjs.Dayjs).toISOString() : null,
        created_by: user?.id,
      };
      const { error } = await supabase.from('tasks').insert(payload);
      if (error) throw error;
      message.success('تم إنشاء المهمة');
      setModalOpen(false);
      form.resetFields();
      fetchMyTasks();
      fetchAllTasks();
      fetchStats();
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      message.error('فشل إنشاء المهمة');
    } finally {
      setModalLoading(false);
    }
  };

  // ── Helpers ───────────────────────────────────────────────────────
  const getDueIndicator = (task: Task) => {
    if (!task.due_date) return null;
    const now = new Date();
    const due = new Date(task.due_date);
    const isToday = due.toDateString() === now.toDateString();
    const isOverdue = due < now && !isToday;
    if (isOverdue) return <span className="text-xs text-red-500 font-medium">🔴 متأخرة</span>;
    if (isToday) return <span className="text-xs text-amber-500 font-medium">🟡 اليوم</span>;
    return <span className="text-xs text-slate-400">{formatDate(task.due_date)}</span>;
  };

  const priorityTag = (priority: string) => {
    const map: Record<string, { color: string; label: string }> = {
      high: { color: '#ff4d4f', label: 'عالية' },
      medium: { color: '#faad14', label: 'متوسطة' },
      low: { color: '#52c41a', label: 'منخفضة' },
    };
    const cfg = map[priority] || map.medium;
    return <Tag color={cfg.color}>{cfg.label}</Tag>;
  };

  // ── Admin table columns ───────────────────────────────────────────
  const adminColumns: ColumnsType<Task> = [
    {
      title: 'المهمة',
      dataIndex: 'title',
      key: 'title',
      render: (title: string, record: Task) => (
        <div>
          <Text strong>{title}</Text>
          {record.lead && (
            <div className="text-xs text-slate-400 mt-0.5">
              🔗 <span className="text-[#D72B2B]">{record.lead.name}</span>
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'معين لـ',
      key: 'assigned_profile',
      width: 120,
      render: (_: unknown, record: Task) => record.assigned_profile?.name || '—',
    },
    {
      title: 'الموعد',
      key: 'due_date',
      width: 100,
      render: (_: unknown, record: Task) => getDueIndicator(record) || <Text type="secondary">—</Text>,
    },
    {
      title: 'الحالة',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (status: string) => (
        <Tag color={status === 'done' ? 'green' : 'orange'}>
          {status === 'done' ? 'منتهية' : 'معلقة'}
        </Tag>
      ),
    },
    {
      title: 'الأولوية',
      dataIndex: 'priority',
      key: 'priority',
      width: 90,
      render: (priority: string) => priorityTag(priority),
    },
    {
      title: 'حذف',
      key: 'actions',
      width: 60,
      render: (_: unknown, record: Task) => (
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          size="small"
          onClick={() => handleDelete(record.id)}
        />
      ),
    },
  ];

  // ── Sorted my tasks: pending first, done below ────────────────────
  const sortedMyTasks = [
    ...myTasks.filter((t) => t.status === 'pending'),
    ...myTasks.filter((t) => t.status === 'done'),
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Title level={4} style={{ margin: 0 }}>📋 المهام</Title>
          <Text type="secondary">إدارة المهام اليومية</Text>
        </div>
        {isPrivileged && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setModalOpen(true)}
            style={{ backgroundColor: '#D72B2B', borderColor: '#D72B2B' }}
          >
            + مهمة جديدة
          </Button>
        )}
      </div>

      {/* Split layout */}
      <div className={`grid gap-6 ${isPrivileged ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1 max-w-2xl'}`}>

        {/* LEFT: My Tasks */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <span className="font-bold text-[#0D2137]">مهامي</span>
            <span className="bg-[#D72B2B] text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {myTasks.filter((t) => t.status === 'pending').length}
            </span>
          </div>
          <div className="p-3 space-y-2 max-h-[600px] overflow-y-auto">
            {myTasksLoading ? (
              <div className="text-center py-8 text-slate-400">جاري التحميل...</div>
            ) : sortedMyTasks.length === 0 ? (
              <div className="text-center py-8 text-slate-400">لا توجد مهام</div>
            ) : (
              sortedMyTasks.map((task) => (
                <div
                  key={task.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors ${
                    task.status === 'done' ? 'opacity-50' : ''
                  }`}
                >
                  <Checkbox
                    checked={task.status === 'done'}
                    onChange={() => handleMarkDone(task)}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold text-[#0D2137] ${task.status === 'done' ? 'line-through' : ''}`}>
                      {task.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {getDueIndicator(task)}
                      {task.lead && (
                        <span className="text-xs text-[#D72B2B]">🔗 {task.lead.name}</span>
                      )}
                      {priorityTag(task.priority)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* RIGHT: Admin Management Panel */}
        {isPrivileged && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <span className="font-bold text-[#0D2137]">إدارة المهام</span>
            </div>
            <div className="p-3">
              {/* Stats */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="bg-red-50 rounded-lg p-2 text-center">
                  <div className="text-xl font-black text-[#D72B2B]">{stats.pending}</div>
                  <div className="text-xs text-slate-400">معلقة</div>
                </div>
                <div className="bg-green-50 rounded-lg p-2 text-center">
                  <div className="text-xl font-black text-green-600">{stats.done}</div>
                  <div className="text-xs text-slate-400">منتهية</div>
                </div>
                <div className="bg-amber-50 rounded-lg p-2 text-center">
                  <div className="text-xl font-black text-amber-500">{stats.overdue}</div>
                  <div className="text-xs text-slate-400">متأخرة</div>
                </div>
              </div>

              {/* Filter pills */}
              <div className="flex gap-2 mb-3 flex-wrap">
                {(['all', 'pending', 'done', 'overdue', 'linked'] as const).map((f) => {
                  const labels: Record<string, string> = {
                    all: 'الكل',
                    pending: 'معلقة',
                    done: 'منتهية',
                    overdue: 'متأخرة',
                    linked: 'مرتبطة بليد',
                  };
                  return (
                    <button
                      key={f}
                      onClick={() => setAdminFilter(f)}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                        adminFilter === f
                          ? 'bg-[#0D2137] text-white border-[#0D2137]'
                          : 'bg-white text-slate-500 border-slate-200 hover:border-[#0D2137]'
                      }`}
                    >
                      {labels[f]}
                    </button>
                  );
                })}
              </div>

              {/* Table */}
              <div className="max-h-[450px] overflow-y-auto">
                <Table
                  columns={adminColumns}
                  dataSource={allTasks}
                  rowKey="id"
                  loading={allTasksLoading}
                  size="small"
                  pagination={false}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Create Task Modal */}
      {isPrivileged && (
        <Modal
          title="إنشاء مهمة جديدة"
          open={modalOpen}
          onCancel={() => { setModalOpen(false); form.resetFields(); }}
          onOk={handleCreate}
          okText="إنشاء"
          cancelText="إلغاء"
          okButtonProps={{
            style: { backgroundColor: '#D72B2B', borderColor: '#D72B2B' },
            loading: modalLoading,
          }}
          destroyOnClose
        >
          <Form form={form} layout="vertical" requiredMark={false}>
            <Form.Item
              name="title"
              label="عنوان المهمة"
              rules={[{ required: true, message: 'مطلوب' }]}
            >
              <Input placeholder="أدخل عنوان المهمة" />
            </Form.Item>

            <Form.Item name="description" label="الوصف (اختياري)">
              <Input.TextArea rows={2} placeholder="وصف تفصيلي..." />
            </Form.Item>

            <Form.Item
              name="assigned_to"
              label="معين لـ"
              rules={[{ required: true, message: 'مطلوب' }]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                placeholder="اختر عضو الفريق"
                options={profiles.map((p) => ({ value: p.id, label: p.name }))}
              />
            </Form.Item>

            <Form.Item name="lead_id" label="ليد مرتبط (اختياري)">
              <Select
                showSearch
                allowClear
                optionFilterProp="label"
                placeholder="اختر ليد (اختياري)"
                options={leads.map((l) => ({ value: l.id, label: l.name }))}
              />
            </Form.Item>

            <Form.Item name="due_date" label="تاريخ الاستحقاق">
              <DatePicker className="w-full" placeholder="اختر التاريخ" />
            </Form.Item>

            <Form.Item name="priority" label="الأولوية" initialValue="medium">
              <Select
                options={[
                  { value: 'high', label: 'عالية' },
                  { value: 'medium', label: 'متوسطة' },
                  { value: 'low', label: 'منخفضة' },
                ]}
              />
            </Form.Item>
          </Form>
        </Modal>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify the page compiles**

```bash
npm run build
```

Expected: ✓ page `/tasks` appears in the build output. No TypeScript errors.

- [ ] **Step 3: Manual smoke test**

Start dev server (`npm run dev`), navigate to `/tasks`.

As **admin**: both panels visible, "+ مهمة جديدة" button appears, create a test task assigned to yourself — it should appear in both panels.

As **regular user** (open in incognito with a non-admin account): only the left "مهامي" panel visible, can check/uncheck tasks.

---

## Task 6: Create ImportModal.tsx

**Files:**
- Create: `app/(dashboard)/crm/ImportModal.tsx`

- [ ] **Step 1: Create the file**

Create `app/(dashboard)/crm/ImportModal.tsx` with:

```tsx
'use client';

import { useState } from 'react';
import { Modal, Button, Table, Upload, message, Steps } from 'antd';
import { InboxOutlined, DownloadOutlined, CheckCircleOutlined } from '@ant-design/icons';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { createClient } from '@/lib/supabase/client';
import type { Lead } from '@/types';

const { Dragger } = Upload;

type ImportStep = 'upload' | 'preview' | 'result';

interface ParsedRow {
  name: string;
  phone: string;
  company?: string;
  email?: string;
  status?: string;
  source?: string;
  region?: string;
  notes?: string;
  next_follow_up?: string;
}

interface ImportResult {
  inserted: number;
  updated: number;
  errors: number;
}

interface ImportModalProps {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

const TEMPLATE_HEADERS = [
  'name', 'phone', 'company', 'email', 'status',
  'source', 'region', 'notes', 'next_follow_up',
];

const VALID_STATUSES = ['New', 'Contacted', 'Interested', 'Proposal Sent', 'Won', 'Lost', 'On Hold'];
const VALID_SOURCES = ['Direct', 'WhatsApp', 'Meta', 'Phone', 'Referral', 'Website'];

function normalizeRows(raw: Record<string, string>[]): ParsedRow[] {
  return raw
    .map((row) => {
      const get = (a: string, b: string) => (row[a] || row[b] || '').trim();
      const statusRaw = get('status', 'Status');
      const sourceRaw = get('source', 'Source');
      return {
        name: get('name', 'Name'),
        phone: get('phone', 'Phone'),
        company: get('company', 'Company') || undefined,
        email: get('email', 'Email') || undefined,
        status: VALID_STATUSES.includes(statusRaw) ? statusRaw : 'New',
        source: VALID_SOURCES.includes(sourceRaw) ? sourceRaw : 'Direct',
        region: get('region', 'Region') || undefined,
        notes: get('notes', 'Notes') || undefined,
        next_follow_up: get('next_follow_up', 'Next_Follow_Up') || undefined,
      };
    })
    .filter((r) => r.name && r.phone);
}

export default function ImportModal({ open, onClose, onImported }: ImportModalProps) {
  const supabase = createClient();
  const [step, setStep] = useState<ImportStep>('upload');
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);

  // ── Parse uploaded file ───────────────────────────────────────────
  const parseFile = (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'csv') {
      Papa.parse<Record<string, string>>(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const rows = normalizeRows(results.data);
          if (rows.length === 0) {
            message.error('الملف لا يحتوي على بيانات صالحة (name + phone مطلوبان)');
            return;
          }
          setParsedRows(rows);
          setStep('preview');
        },
        error: () => message.error('فشل قراءة ملف CSV'),
      });
    } else if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const workbook = XLSX.read(e.target?.result, { type: 'array' });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: '' });
          const rows = normalizeRows(json);
          if (rows.length === 0) {
            message.error('الملف لا يحتوي على بيانات صالحة');
            return;
          }
          setParsedRows(rows);
          setStep('preview');
        } catch {
          message.error('فشل قراءة ملف Excel');
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      message.error('يُرجى رفع ملف CSV أو Excel فقط (.csv, .xlsx)');
    }
    return false; // prevent antd auto-upload
  };

  // ── Upsert rows ───────────────────────────────────────────────────
  const handleImport = async () => {
    setImporting(true);
    let inserted = 0;
    let updated = 0;
    let errors = 0;

    try {
      // Pre-check which phones already exist
      const phones = parsedRows.map((r) => r.phone);
      const { data: existing } = await supabase
        .from('leads')
        .select('phone')
        .in('phone', phones);
      const existingPhones = new Set((existing || []).map((e) => e.phone));

      for (const row of parsedRows) {
        const payload: Partial<Lead> = {
          name: row.name,
          phone: row.phone,
          ...(row.company ? { company: row.company } : {}),
          ...(row.email ? { email: row.email } : {}),
          status: (row.status as Lead['status']) || 'New',
          source: (row.source as Lead['source']) || 'Direct',
          ...(row.region ? { region: row.region as Lead['region'] } : {}),
          ...(row.notes ? { notes: row.notes } : {}),
          ...(row.next_follow_up ? { next_follow_up: row.next_follow_up } : {}),
        };

        const { error } = await supabase
          .from('leads')
          .upsert(payload, { onConflict: 'phone' });

        if (error) {
          errors++;
        } else if (existingPhones.has(row.phone)) {
          updated++;
        } else {
          inserted++;
        }
      }

      setImportResult({ inserted, updated, errors });
      setStep('result');
      onImported();
    } catch {
      message.error('فشل استيراد البيانات');
    } finally {
      setImporting(false);
    }
  };

  // ── Download CSV template ─────────────────────────────────────────
  const downloadTemplate = () => {
    const exampleRows = [
      ['أحمد محمد', '01012345678', 'شركة المستقبل', 'ahmed@example.com', 'New', 'WhatsApp', 'Cairo', 'ملاحظة', '2026-05-01'],
      ['سارة علي', '01098765432', '', 'sara@example.com', 'Interested', 'Meta', 'Alexandria', '', ''],
    ];
    const csvContent = [
      TEMPLATE_HEADERS.join(','),
      ...exampleRows.map((r) => r.map((v) => `"${v}"`).join(',')),
    ].join('\n');
    const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'loomark-leads-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClose = () => {
    setStep('upload');
    setParsedRows([]);
    setImportResult(null);
    onClose();
  };

  const previewColumns = [
    { title: 'الاسم', dataIndex: 'name', key: 'name' },
    { title: 'الهاتف', dataIndex: 'phone', key: 'phone' },
    {
      title: 'الشركة',
      dataIndex: 'company',
      key: 'company',
      render: (v: string) => v || '—',
    },
    { title: 'الحالة', dataIndex: 'status', key: 'status' },
    { title: 'المصدر', dataIndex: 'source', key: 'source' },
  ];

  return (
    <Modal
      title="استيراد مجمع للعملاء"
      open={open}
      onCancel={handleClose}
      footer={null}
      width={700}
      destroyOnClose
    >
      <Steps
        current={step === 'upload' ? 0 : step === 'preview' ? 1 : 2}
        items={[
          { title: 'رفع الملف' },
          { title: 'مراجعة' },
          { title: 'النتيجة' },
        ]}
        className="mb-6"
        size="small"
      />

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button icon={<DownloadOutlined />} onClick={downloadTemplate} size="small">
              تحميل Template
            </Button>
          </div>
          <Dragger
            accept=".csv,.xlsx,.xls"
            beforeUpload={parseFile}
            showUploadList={false}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined style={{ fontSize: 40, color: '#94a3b8' }} />
            </p>
            <p className="ant-upload-text font-semibold">اسحب الملف هنا أو اضغط للاختيار</p>
            <p className="ant-upload-hint text-slate-400">CSV أو Excel (.xlsx) — الأعمدة المطلوبة: name, phone</p>
          </Dragger>
        </div>
      )}

      {/* Step 2: Preview */}
      {step === 'preview' && (
        <div className="space-y-4">
          <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-700">
            تم قراءة <strong>{parsedRows.length}</strong> صف صالح من الملف
            {parsedRows.length > 10 && ` — يُعرض أول 10 فقط`}
          </div>
          <Table
            columns={previewColumns}
            dataSource={parsedRows.slice(0, 10)}
            rowKey={(_, i) => String(i)}
            size="small"
            pagination={false}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button onClick={() => setStep('upload')}>رجوع</Button>
            <Button
              type="primary"
              loading={importing}
              onClick={handleImport}
              style={{ backgroundColor: '#D72B2B', borderColor: '#D72B2B' }}
            >
              تأكيد الاستيراد ({parsedRows.length} سجل)
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Result */}
      {step === 'result' && importResult && (
        <div className="text-center py-8 space-y-4">
          <CheckCircleOutlined style={{ fontSize: 48, color: '#52c41a' }} />
          <div className="text-lg font-bold text-[#0D2137]">تم الاستيراد!</div>
          <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto">
            <div className="bg-green-50 rounded-lg p-3">
              <div className="text-2xl font-black text-green-600">{importResult.inserted}</div>
              <div className="text-xs text-slate-500">ليد جديد</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-3">
              <div className="text-2xl font-black text-blue-600">{importResult.updated}</div>
              <div className="text-xs text-slate-500">تم تحديثه</div>
            </div>
            <div className="bg-red-50 rounded-lg p-3">
              <div className="text-2xl font-black text-red-500">{importResult.errors}</div>
              <div className="text-xs text-slate-500">أخطاء</div>
            </div>
          </div>
          <Button
            type="primary"
            onClick={handleClose}
            style={{ backgroundColor: '#D72B2B', borderColor: '#D72B2B' }}
          >
            إغلاق
          </Button>
        </div>
      )}
    </Modal>
  );
}
```

- [ ] **Step 2: Verify the file compiles**

```bash
npm run build
```

Expected: ✓ No TypeScript errors from ImportModal.tsx.

---

## Task 7: Wire ImportModal into CRM Page

**Files:**
- Modify: `app/(dashboard)/crm/page.tsx`

- [ ] **Step 1: Add import + state for the modal**

In `app/(dashboard)/crm/page.tsx`, add the import for `ImportModal` after the last import line:

```typescript
import ImportModal from './ImportModal';
```

Then inside the `CRMPage` component body, add the state variable after the existing `const [viewType, ...]` line:

```typescript
const [importModalOpen, setImportModalOpen] = useState(false);
```

- [ ] **Step 2: Add "استيراد مجمع" button to the header**

In `app/(dashboard)/crm/page.tsx`, find the `<Col>` that contains the "إضافة عميل" button in the header `<Row>`. Replace it with:

```tsx
<Col>
  <Space>
    <Button
      icon={<UploadOutlined />}
      onClick={() => setImportModalOpen(true)}
    >
      استيراد مجمع
    </Button>
    <Button
      type="primary"
      icon={<PlusOutlined />}
      onClick={() => { setEditingLead(null); setModalOpen(true); }}
      style={{ backgroundColor: '#D72B2B', borderColor: '#D72B2B' }}
    >
      إضافة عميل (Add Lead)
    </Button>
  </Space>
</Col>
```

- [ ] **Step 3: Add UploadOutlined to existing antd icons import**

In the Ant Design icons import line at the top of `crm/page.tsx`, add `UploadOutlined`:

```typescript
import {
  PlusOutlined, SearchOutlined, WhatsAppOutlined,
  MoreOutlined, FilterOutlined,
  EyeOutlined, EditOutlined, DeleteOutlined,
  TableOutlined, AppstoreOutlined, FileTextOutlined,
  PhoneOutlined, UploadOutlined,
} from '@ant-design/icons';
```

- [ ] **Step 4: Mount the ImportModal**

In `app/(dashboard)/crm/page.tsx`, at the bottom of the JSX (after the `<LeadFormModal ... />` closing tag, before the closing `</div>`), add:

```tsx
<ImportModal
  open={importModalOpen}
  onClose={() => setImportModalOpen(false)}
  onImported={() => { setImportModalOpen(false); fetchLeads(1); }}
/>
```

- [ ] **Step 5: Final build**

```bash
npm run build
```

Expected: ✓ Compiled successfully. No TypeScript errors.

- [ ] **Step 6: Manual smoke test for Import**

1. Start dev server, navigate to `/crm`.
2. Click "استيراد مجمع" — modal opens showing Step 1 (upload).
3. Click "تحميل Template" — `loomark-leads-template.csv` downloads.
4. Open the template, add 2-3 rows (make one phone number that already exists in the DB).
5. Drag the file into the modal — Step 2 shows preview table with those rows.
6. Click "تأكيد الاستيراد" — Step 3 shows result with inserted/updated counts.
7. Close modal — CRM table refreshes and shows the new leads.

---

## Self-Review Notes

**Spec coverage check:**
- ✅ tasks table + RLS — Task 2
- ✅ Tasks nav item with badge — Tasks 4
- ✅ Split-view /tasks page — Task 5
- ✅ My tasks panel (pending first, strikethrough done, checkbox mark done) — Task 5
- ✅ Due indicators (🔴 overdue, 🟡 today, date otherwise) — Task 5
- ✅ Admin panel: stats, filter pills, table with delete — Task 5
- ✅ Create Task Modal (title, desc, assigned_to, lead_id, due_date, priority) — Task 5
- ✅ papaparse + xlsx install — Task 1
- ✅ ImportModal: drag-drop, CSV + Excel parse, 10-row preview, upsert with onConflict:phone — Task 6
- ✅ Template download — Task 6
- ✅ CRM page "استيراد مجمع" button — Task 7
- ✅ Result summary (inserted / updated / errors) — Task 6

**Type consistency check:**
- `Task` interface defined in Task 3, used as `Task[]` in tasks page (Task 5) ✅
- `assigned_profile` field on Task used in `adminColumns` ✅
- `lead` field on Task used in both panels ✅
- `ParsedRow` and `ImportResult` defined locally in ImportModal — no external type dependencies ✅
