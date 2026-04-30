# Loomark CRM Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add activity logging, daily tasks widget, lead visibility by role, auto session/logout, animated login, performance fixes, and accessible logout to the Loomark CRM.

**Architecture:** Hybrid approach — Supabase RLS already enforces lead visibility at the DB layer (migration `20260418_plan1_rls_ownership.sql`); client-side query filters add a UI-layer guard. UX features (idle logout, session timer, animations) live entirely client-side. Two DB migrations add `body`/`duration_seconds` to `lead_activities` and `created_by` to `leads`.

**Tech Stack:** Next.js 14 App Router · Supabase JS v2 · Ant Design 5 · Tailwind CSS · Framer Motion (already installed)

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Create | `hooks/useSessionManager.ts` | Silent session timer + 30-min idle logout |
| Create | `supabase/migrations/20260426_lead_activities_body.sql` | Add `body`, `duration_seconds` cols; expand type constraint |
| Create | `supabase/migrations/20260426_leads_created_by.sql` | Add `created_by` col to `leads`, backfill |
| Modify | `components/layout/Shell.tsx` | Use `useSessionManager`; remove duplicate profile fetch; pass logout handler to Sidebar |
| Modify | `components/layout/Sidebar.tsx` | Accept `onLogout` prop; ensure logout icon always visible when collapsed |
| Modify | `components/shared/LoadingScreen.tsx` | Dark background; random Arabic quote; keep Framer Motion animation |
| Modify | `app/(auth)/login/page.tsx` | Animated LOOMARK name + rotating Arabic quotes with dot indicators |
| Modify | `app/(dashboard)/crm/page.tsx` | Add client-side role filter + 300ms search debounce |
| Modify | `app/(dashboard)/crm/LeadDrawer.tsx` | Full activity tab: sub-tabs, avatar feed, add-activity form, cache |
| Modify | `app/(dashboard)/crm/LeadFormModal.tsx` | Auto-log `status_change` activity on save |
| Modify | `app/(dashboard)/dashboard/page.tsx` | Add "مهام اليوم" daily tasks widget with lead drawer integration |
| Modify | `app/(dashboard)/reports/page.tsx` | Add `creator_name` + `assignee_name` to table and CSV |

---

## Task 1: DB Migration — lead_activities columns

**Files:**
- Create: `supabase/migrations/20260426_lead_activities_body.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260426_lead_activities_body.sql
-- Add body and duration_seconds to lead_activities; expand type constraint

ALTER TABLE public.lead_activities
  ADD COLUMN IF NOT EXISTS body TEXT,
  ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;

ALTER TABLE public.lead_activities
  DROP CONSTRAINT IF EXISTS lead_activities_type_check;

ALTER TABLE public.lead_activities
  ADD CONSTRAINT lead_activities_type_check
  CHECK (type IN ('call', 'note', 'status_change', 'note_added', 'edit', 'creation'));
```

- [ ] **Step 2: Apply in Supabase SQL Editor**

Open Supabase Dashboard → SQL Editor → paste and run the migration.

Expected: "Success. No rows returned."

- [ ] **Step 3: Verify**

Run in SQL Editor:
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'lead_activities'
ORDER BY ordinal_position;
```
Expected: columns `body` (text) and `duration_seconds` (integer) appear in the result.

- [ ] **Step 4: Commit the migration file**

```bash
git add supabase/migrations/20260426_lead_activities_body.sql
git commit -m "feat: add body and duration_seconds to lead_activities"
```

---

## Task 2: DB Migration — leads.created_by

**Files:**
- Create: `supabase/migrations/20260426_leads_created_by.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260426_leads_created_by.sql

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id);

UPDATE leads
SET created_by = assigned_to_user
WHERE created_by IS NULL AND assigned_to_user IS NOT NULL;
```

- [ ] **Step 2: Apply in Supabase SQL Editor**

Run the migration. Expected: "Success."

- [ ] **Step 3: Verify**

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'leads' AND column_name = 'created_by';
```
Expected: one row returned.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260426_leads_created_by.sql
git commit -m "feat: add created_by column to leads with backfill"
```

---

## Task 3: useSessionManager Hook

**Files:**
- Create: `hooks/useSessionManager.ts`

- [ ] **Step 1: Create the hook**

```ts
// hooks/useSessionManager.ts
'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export function useSessionManager(userId: string | null) {
  const router = useRouter();
  const supabase = createClient();
  const logIdRef = useRef<string | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Session timer ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;

    let logId: string | null = null;

    const startSession = async () => {
      const { data, error } = await supabase
        .from('time_logs')
        .insert({
          user_id: userId,
          task_type: 'Other',
          description: 'Auto Session',
          duration_seconds: 0,
          started_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (!error && data) {
        logId = data.id;
        logIdRef.current = data.id;
      }
    };

    const endSession = async () => {
      if (!logIdRef.current) return;
      const started = new Date().getTime();
      const { data: row } = await supabase
        .from('time_logs')
        .select('started_at')
        .eq('id', logIdRef.current)
        .single();

      const durationSeconds = row
        ? Math.floor((Date.now() - new Date(row.started_at).getTime()) / 1000)
        : 0;

      await supabase
        .from('time_logs')
        .update({
          ended_at: new Date().toISOString(),
          duration_seconds: durationSeconds,
        })
        .eq('id', logIdRef.current);
    };

    startSession();

    const handleUnload = () => { endSession(); };
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      endSession();
    };
  }, [userId, supabase]);

  // ── Idle logout ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;

    const resetTimer = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(async () => {
        await supabase.auth.signOut();
        router.push('/login');
      }, IDLE_TIMEOUT_MS);
    };

    const events = ['mousemove', 'keydown', 'click', 'touchstart'] as const;
    events.forEach(e => window.addEventListener(e, resetTimer));
    resetTimer();

    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      events.forEach(e => window.removeEventListener(e, resetTimer));
    };
  }, [userId, supabase, router]);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "d:/Loomark/gchv-egypt-ai-co-pilot (3)/loomark"
npx tsc --noEmit
```
Expected: no errors in `hooks/useSessionManager.ts`.

- [ ] **Step 3: Commit**

```bash
git add hooks/useSessionManager.ts
git commit -m "feat: add useSessionManager hook (session timer + idle logout)"
```

---

## Task 4: Shell.tsx — Performance + Session Manager + Logout

**Files:**
- Modify: `components/layout/Shell.tsx`

- [ ] **Step 1: Read the current file**

Read `components/layout/Shell.tsx` — note the `loadProfile` useEffect and the profile state that duplicates `AuthContext`.

- [ ] **Step 2: Replace Shell.tsx**

```tsx
// components/layout/Shell.tsx
'use client';

import { useState } from 'react';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import LookAgent from '@/components/agent/LookAgent';
import { useAuth } from '@/context/AuthContext';
import { useSessionManager } from '@/hooks/useSessionManager';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/context/LanguageContext';

interface ShellProps {
  children: React.ReactNode;
}

export default function Shell({ children }: ShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { lang, toggleLanguage } = useLanguage();
  const { profile, user } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  useSessionManager(user?.id ?? null);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-[#F4F6F8] font-sans text-slate-900">
      <Sidebar
        collapsed={collapsed}
        onCollapse={setCollapsed}
        lang={lang}
        profile={profile}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        onLogout={handleLogout}
      />
      <Navbar
        lang={lang}
        onToggleLang={toggleLanguage}
        collapsed={collapsed}
        onToggleMobileMenu={() => setMobileMenuOpen(!mobileMenuOpen)}
      />
      <main
        className={`transition-all duration-300 min-h-screen pt-16 ${
          collapsed ? 'md:ml-[72px] ml-0' : 'md:ml-[200px] ml-0'
        }`}
      >
        <div className="p-4 md:p-8 max-w-[1600px] mx-auto overflow-x-hidden">
          {children}
        </div>
      </main>
      <LookAgent />
    </div>
  );
}
```

- [ ] **Step 3: Run TypeScript check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/layout/Shell.tsx
git commit -m "perf: remove duplicate profile fetch in Shell; wire useSessionManager and logout"
```

---

## Task 5: Sidebar.tsx — Accept onLogout Prop + Collapsed Visibility

**Files:**
- Modify: `components/layout/Sidebar.tsx`

- [ ] **Step 1: Read current Sidebar.tsx**

Note the `handleLogout` function defined locally inside Sidebar and the logout button rendering at the bottom.

- [ ] **Step 2: Update SidebarProps interface and component signature**

Find this block:
```tsx
interface SidebarProps {
  collapsed: boolean;
  onCollapse: (collapsed: boolean) => void;
  lang: 'ar' | 'en';
  profile?: Profile | null;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
}
```

Replace with:
```tsx
interface SidebarProps {
  collapsed: boolean;
  onCollapse: (collapsed: boolean) => void;
  lang: 'ar' | 'en';
  profile?: Profile | null;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
  onLogout: () => void;
}
```

- [ ] **Step 3: Update the component signature**

Find:
```tsx
export default function Sidebar({ collapsed, onCollapse, lang, profile, mobileMenuOpen, setMobileMenuOpen }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };
```

Replace with:
```tsx
export default function Sidebar({ collapsed, onCollapse, lang, profile, mobileMenuOpen, setMobileMenuOpen, onLogout }: SidebarProps) {
  const pathname = usePathname();
```

- [ ] **Step 4: Replace all `handleLogout` calls with `onLogout`**

Search for `handleLogout` in Sidebar.tsx and replace every occurrence with `onLogout`.

- [ ] **Step 5: Remove unused imports**

Remove `useRouter` and `createClient` imports from Sidebar.tsx if no longer used after removing `handleLogout`.

- [ ] **Step 6: Ensure logout button visible when collapsed**

Find the logout button at the bottom of the sidebar. Ensure it renders in both collapsed (icon-only) and expanded states. The button should show only the `LogOut` icon when collapsed:

```tsx
<button
  onClick={onLogout}
  className="w-full flex items-center gap-3 px-4 py-3 text-white/60 hover:text-white hover:bg-white/10 transition-colors rounded-lg"
  title="تسجيل الخروج"
>
  <LogOut className="w-5 h-5 shrink-0" />
  {!collapsed && <span className="text-sm">تسجيل الخروج</span>}
</button>
```

- [ ] **Step 7: TypeScript check + commit**

```bash
npx tsc --noEmit
git add components/layout/Sidebar.tsx
git commit -m "fix: accept onLogout prop in Sidebar; ensure logout visible when collapsed"
```

---

## Task 6: LoadingScreen — Dark Background + Arabic Quote

**Files:**
- Modify: `components/shared/LoadingScreen.tsx`

- [ ] **Step 1: Replace LoadingScreen.tsx**

```tsx
// components/shared/LoadingScreen.tsx
'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';

const QUOTES = [
  'النجاح يبدأ بخطوة واحدة',
  'كل عميل هو فرصة جديدة',
  'الإصرار هو مفتاح الإنجاز',
  'تواصل، أقنع، انجز',
  'فريق قوي يصنع نتائج استثنائية',
  'السعى ليه وقت',
  'صلى على محمد',
  'الامل فى الداخل ينتظر الخروج',
  'فى اختلافنا رحمة',
  'مدد يا رب',
];

export default function LoadingScreen() {
  const quote = useMemo(() => QUOTES[Math.floor(Math.random() * QUOTES.length)], []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
      style={{ background: 'linear-gradient(135deg, #000917 0%, #0D2137 60%, #1a3a5c 100%)' }}
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="relative w-24 h-24 mb-6"
      >
        <Image src="/logo.png" alt="Loomark" fill className="object-contain" priority />
      </motion.div>

      <motion.p
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="text-white/80 text-lg font-medium text-center px-8 mb-6"
        dir="rtl"
      >
        &ldquo;{quote}&rdquo;
      </motion.p>

      <motion.div
        animate={{ scaleX: [0, 1, 0] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
        className="h-0.5 w-24 bg-[#D72B2B] rounded-full origin-left"
      />
    </motion.div>
  );
}
```

- [ ] **Step 2: Verify in browser**

Run `npm run dev` and navigate to any page — the loading screen between pages should show the dark branded background and a random Arabic quote.

- [ ] **Step 3: Commit**

```bash
git add components/shared/LoadingScreen.tsx
git commit -m "feat: dark branded loading screen with random Arabic quote"
```

---

## Task 7: Login Page Animation

**Files:**
- Modify: `app/(auth)/login/page.tsx`

- [ ] **Step 1: Read the current login page**

Note the left panel (`hidden lg:flex lg:w-1/2`) with the static LOOMARK heading and description text. The right panel contains the login form — leave it untouched.

- [ ] **Step 2: Replace only the left panel content**

Find the left panel div (starts with `<div className="hidden lg:flex lg:w-1/2`). Replace its inner content:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { Form, Input, Button, Typography, message, Space } from 'antd';
import { MailOutlined, LockOutlined } from '@ant-design/icons';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';

const { Title, Text } = Typography;

const QUOTES = [
  'النجاح يبدأ بخطوة واحدة',
  'كل عميل هو فرصة جديدة',
  'الإصرار هو مفتاح الإنجاز',
  'تواصل، أقنع، انجز',
  'فريق قوي يصنع نتائج استثنائية',
  'السعى ليه وقت',
  'صلى على محمد',
  'الامل فى الداخل ينتظر الخروج',
  'فى اختلافنا رحمة',
  'مدد يا رب',
];

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [quoteIndex, setQuoteIndex] = useState(0);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const interval = setInterval(() => {
      setQuoteIndex(i => (i + 1) % QUOTES.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const onFinish = async (values: { email: string; password: string }) => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: values.email,
        password: values.password,
      });
      if (error) { message.error(error.message); return; }
      message.success('تم تسجيل الدخول بنجاح');
      router.push('/dashboard');
      router.refresh();
    } catch {
      message.error('حدث خطأ غير متوقع');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Panel — Animated Branding */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12"
        style={{ background: 'linear-gradient(135deg, #000917 0%, #0D2137 50%, #1a3a5c 100%)' }}
      >
        <div>
          <motion.h1
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-white text-4xl font-bold tracking-tight"
          >
            LOOMARK
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mt-1 text-lg font-bold tracking-[4px] uppercase"
            style={{ color: '#D72B2B' }}
          >
            GCHV EGYPT
          </motion.p>
        </div>

        <div className="space-y-6">
          <div
            className="rounded-xl p-6 border"
            style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)' }}
          >
            <AnimatePresence mode="wait">
              <motion.p
                key={quoteIndex}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.5 }}
                className="text-white/90 text-xl font-semibold leading-relaxed text-right"
                dir="rtl"
              >
                &ldquo;{QUOTES[quoteIndex]}&rdquo;
              </motion.p>
            </AnimatePresence>
            <div className="flex gap-1.5 mt-4 justify-end">
              {QUOTES.map((_, i) => (
                <motion.div
                  key={i}
                  animate={{ width: i === quoteIndex ? 18 : 6, background: i === quoteIndex ? '#D72B2B' : '#334155' }}
                  transition={{ duration: 0.3 }}
                  className="h-1.5 rounded-full"
                />
              ))}
            </div>
          </div>
        </div>

        <p className="text-white/20 text-xs">© 2026 GCHV Egypt. All rights reserved.</p>
      </div>

      {/* Right Panel — Login Form (unchanged) */}
      <div className="flex-1 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-sm">
          <Space direction="vertical" size="large" className="w-full">
            <div className="text-center">
              <Title level={3} style={{ margin: 0 }}>مرحباً بعودتك</Title>
              <Text type="secondary">سجّل دخولك إلى نظام Loomark</Text>
            </div>
            <Form layout="vertical" onFinish={onFinish} autoComplete="off">
              <Form.Item name="email" rules={[{ required: true, type: 'email', message: 'بريد إلكتروني صحيح مطلوب' }]}>
                <Input prefix={<MailOutlined />} placeholder="البريد الإلكتروني" size="large" />
              </Form.Item>
              <Form.Item name="password" rules={[{ required: true, message: 'كلمة المرور مطلوبة' }]}>
                <Input.Password prefix={<LockOutlined />} placeholder="كلمة المرور" size="large" />
              </Form.Item>
              <Form.Item>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={loading}
                  block
                  size="large"
                  style={{ backgroundColor: '#D72B2B', borderColor: '#D72B2B' }}
                >
                  تسجيل الدخول
                </Button>
              </Form.Item>
            </Form>
          </Space>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify in browser**

Navigate to `/login`. The left panel should show LOOMARK sliding down, then the quote box with fading Arabic quotes and animated dots.

- [ ] **Step 4: Commit**

```bash
git add "app/(auth)/login/page.tsx"
git commit -m "feat: animated login panel with rotating Arabic quotes"
```

---

## Task 8: CRM Page — Role Filter + Search Debounce

**Files:**
- Modify: `app/(dashboard)/crm/page.tsx`

- [ ] **Step 1: Add search debounce**

Find the search `Input` onChange handler:
```tsx
onChange={(e) => setSearch(e.target.value)}
```

Replace with a debounced version. Add this ref at the top of the component, after existing state declarations:
```tsx
const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
```

Add `useRef` to the React import. Replace the onChange handler:
```tsx
onChange={(e) => {
  const val = e.target.value;
  setSearch(val);
  if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
  searchDebounceRef.current = setTimeout(() => {
    setPage(1);
    fetchLeads(1);
  }, 300);
}}
```

- [ ] **Step 2: Add role-based client filter**

Find the `fetchLeads` function. Locate the query construction block:
```tsx
let query = supabase
  .from('leads')
  .select('*, assigned_user:profiles!leads_assigned_to_user_fkey(id, name)', { count: 'exact' })
  .order('created_at', { ascending: false })
  .range((p - 1) * pageSize, p * pageSize - 1);
```

Add the role filter immediately after the `.range(...)` line:
```tsx
if (!isAdmin && !isManager) {
  query = query.eq('assigned_to_user', user?.id);
}
```

`isAdmin`, `isManager`, and `user` are already available from `useAuth()` at the top of the component.

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/crm/page.tsx"
git commit -m "feat: lead visibility role filter + search debounce in CRM page"
```

---

## Task 9: Activity Tab in LeadDrawer

**Files:**
- Modify: `app/(dashboard)/crm/LeadDrawer.tsx`

- [ ] **Step 1: Update antd imports to include InputNumber**

Find the antd import line at the top of `LeadDrawer.tsx`:
```tsx
import {
  Drawer, Descriptions, Tag, Space, Button, Timeline, Typography, Divider, Tooltip, Tabs, Form, Select, Input, InputNumber, message, Row, Col, Checkbox,
} from 'antd';
```
`InputNumber` is already imported — verify it's in the list. If missing, add it.

- [ ] **Step 2: Update the Activity interface**

Find:
```tsx
interface Activity {
  id: string;
  type: string;
  note: string;
  created_at: string;
  user_id: string;
}
```

Replace with:
```tsx
interface Activity {
  id: string;
  type: string;
  body: string | null;
  duration_seconds: number | null;
  details: Record<string, unknown> | null;
  created_at: string;
  user_id: string;
}
```

- [ ] **Step 3: Add activity state, profile map, and drawer cache**

Add these state declarations after the existing ones:
```tsx
const [activityTab, setActivityTab] = useState<'all' | 'call' | 'note'>('all');
const [addingActivity, setAddingActivity] = useState(false);
const [activityForm] = Form.useForm();
const [profileMap, setProfileMap] = useState<Record<string, string>>({});
const lastFetchRef = useRef<{ leadId: string; time: number } | null>(null);
```

- [ ] **Step 4: Fetch profiles for activity avatars + add 60s drawer cache**

Add this `fetchProfileMap` callback alongside `fetchActivities`:
```tsx
const fetchProfileMap = useCallback(async () => {
  const { data } = await supabase.from('profiles').select('id, name');
  if (data) {
    const map: Record<string, string> = {};
    data.forEach(p => { map[p.id] = p.name; });
    setProfileMap(map);
  }
}, [supabase]);
```

Replace the existing `useEffect` that fires on `open && lead` with a cached version:
```tsx
useEffect(() => {
  if (!open || !lead) return;
  const now = Date.now();
  const cache = lastFetchRef.current;
  const isCached = cache && cache.leadId === lead.id && now - cache.time < 60_000;
  if (!isCached) {
    lastFetchRef.current = { leadId: lead.id, time: now };
    fetchActivities();
    fetchBoqs();
    fetchCalls();
    fetchProfileMap();
  }
}, [open, lead, fetchActivities, fetchBoqs, fetchCalls, fetchProfileMap]);
```

- [ ] **Step 4: Add handleAddActivity function**

Add this function before the `return` statement:
```tsx
const handleAddActivity = async (values: { type: 'call' | 'note'; body: string; duration_seconds?: number }) => {
  if (!lead || !user) return;
  const { error } = await supabase.from('lead_activities').insert({
    lead_id: lead.id,
    user_id: user.id,
    type: values.type,
    body: values.body,
    duration_seconds: values.type === 'call' ? (values.duration_seconds ?? null) : null,
  });
  if (error) {
    message.error('فشل إضافة النشاط');
    return;
  }
  message.success('تم إضافة النشاط');
  activityForm.resetFields();
  setAddingActivity(false);
  fetchActivities();
};
```

- [ ] **Step 5: Replace the Activity tab (key '3') children**

Find the tab with `key: '3'` and `label: 'النشاط (Activity)'`. Replace its `children` with:

```tsx
children: (
  <div className="space-y-3">
    {/* Sub-tabs */}
    <div className="flex gap-2 flex-wrap">
      {(['all', 'call', 'note'] as const).map(tab => (
        <button
          key={tab}
          onClick={() => setActivityTab(tab)}
          className={`text-xs px-3 py-1 rounded-full border transition-colors ${
            activityTab === tab
              ? 'bg-[#D72B2B] text-white border-[#D72B2B]'
              : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
          }`}
        >
          {tab === 'all' ? `الكل (${activities.length})` : tab === 'call' ? `مكالمات (${activities.filter(a => a.type === 'call').length})` : `ملاحظات (${activities.filter(a => a.type === 'note').length})`}
        </button>
      ))}
    </div>

    {/* Add Activity Button */}
    <Button
      type="dashed"
      block
      icon={<PlusOutlined />}
      onClick={() => setAddingActivity(!addingActivity)}
    >
      {addingActivity ? 'إلغاء' : '+ إضافة نشاط'}
    </Button>

    {/* Add Activity Form */}
    {addingActivity && (
      <div className="bg-gray-50 p-3 rounded-lg border border-dashed border-gray-300">
        <Form form={activityForm} layout="vertical" size="small" onFinish={handleAddActivity}>
          <Form.Item name="type" label="النوع" rules={[{ required: true }]} initialValue="note">
            <Select options={[
              { value: 'note', label: '📝 ملاحظة' },
              { value: 'call', label: '📞 مكالمة' },
            ]} />
          </Form.Item>
          <Form.Item name="body" label="التفاصيل" rules={[{ required: true }]}>
            <Input.TextArea rows={2} placeholder="اكتب تفاصيل النشاط..." />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.type !== cur.type}>
            {({ getFieldValue }) =>
              getFieldValue('type') === 'call' ? (
                <Form.Item name="duration_seconds" label="المدة (ثوانٍ)">
                  <InputNumber min={0} style={{ width: '100%' }} placeholder="مثال: 180" />
                </Form.Item>
              ) : null
            }
          </Form.Item>
          <Button type="primary" htmlType="submit" block style={{ backgroundColor: '#D72B2B', borderColor: '#D72B2B' }}>
            حفظ
          </Button>
        </Form>
      </div>
    )}

    {/* Activity Feed */}
    {activities
      .filter(a => activityTab === 'all' || a.type === activityTab)
      .length === 0 ? (
      <Text type="secondary" className="block text-center py-6">لا يوجد نشاط حتى الآن</Text>
    ) : (
      <div className="space-y-2">
        {activities
          .filter(a => activityTab === 'all' || a.type === activityTab)
          .map(a => {
            const userName = profileMap[a.user_id] || 'مستخدم';
            const initials = userName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
            const icon = a.type === 'call' ? '📞' : a.type === 'note' ? '📝' : '🔄';
            const label = a.type === 'call' ? 'مكالمة' : a.type === 'note' ? 'ملاحظة' : a.type === 'status_change' ? 'تغيير الحالة' : 'نشاط';
            return (
              <div key={a.id} className="flex gap-2 items-start">
                <div className="w-7 h-7 rounded-full bg-[#0D2137] text-white text-[9px] font-bold flex items-center justify-center shrink-0">
                  {initials}
                </div>
                <div className="bg-gray-50 rounded-lg p-2 flex-1 border border-gray-100">
                  <div className="flex justify-between items-start mb-0.5">
                    <span className="text-[10px] text-gray-500">{userName}</span>
                    <span className="text-[10px] text-gray-400">{formatDate(a.created_at)}</span>
                  </div>
                  <p className="text-xs text-gray-800">
                    {icon} <strong>{label}</strong>
                    {a.duration_seconds ? ` · ${Math.floor(a.duration_seconds / 60)} د` : ''}
                    {a.body ? ` — ${a.body}` : ''}
                  </p>
                </div>
              </div>
            );
          })}
      </div>
    )}
  </div>
),
```

- [ ] **Step 6: TypeScript check**

```bash
npx tsc --noEmit
```
Fix any type errors (most likely `InputNumber` import — add it to the `antd` import line if missing).

- [ ] **Step 7: Commit**

```bash
git add "app/(dashboard)/crm/LeadDrawer.tsx"
git commit -m "feat: full activity tab in LeadDrawer (sub-tabs, avatar feed, add activity form)"
```

---

## Task 10: Auto-log Status Changes from LeadFormModal

**Files:**
- Modify: `app/(dashboard)/crm/LeadFormModal.tsx`

- [ ] **Step 1: Read LeadFormModal.tsx**

Locate the save/submit handler — the function that calls `supabase.from('leads').update(...)` or `.insert(...)`.

- [ ] **Step 2: Add activity insert after a successful update**

Inside the save handler, after a successful `update` call, add:
```tsx
// Auto-log status change if status changed
if (editingLead && values.status !== editingLead.status) {
  await supabase.from('lead_activities').insert({
    lead_id: editingLead.id,
    user_id: user?.id,
    type: 'status_change',
    body: `${editingLead.status} → ${values.status}`,
  });
}
```

`user` should come from `useAuth()` — add `const { user } = useAuth();` if not already present.

- [ ] **Step 3: TypeScript check + commit**

```bash
npx tsc --noEmit
git add "app/(dashboard)/crm/LeadFormModal.tsx"
git commit -m "feat: auto-log status_change activity when lead status is updated"
```

---

## Task 11: Daily Tasks Widget on Dashboard

**Files:**
- Modify: `app/(dashboard)/dashboard/page.tsx`

- [ ] **Step 1: Add types and state**

At the top of `DashboardPage`, add after existing state:
```tsx
const [todayTasks, setTodayTasks] = useState<{ id: string; name: string; next_follow_up: string }[]>([]);
const [selectedTaskLead, setSelectedTaskLead] = useState<Lead | null>(null);
const [taskDrawerOpen, setTaskDrawerOpen] = useState(false);
```

Add imports:
```tsx
import type { Lead } from '@/types';
import LeadDrawer from '../crm/LeadDrawer';
import { useAuth } from '@/context/AuthContext';
```

Add `const { user, isAdmin, isManager } = useAuth();` near the top of the component.

- [ ] **Step 2: Update the Promise.all block to add the tasks query**

Replace the entire `Promise.all` destructuring block:
```tsx
const [
  { count: totalLeads },
  { count: newLeads },
  { count: wonLeads },
  { data: wonBoqs },
  { count: sentBOQs },
  { data: leads },
  { data: profiles },
  { data: lowStock },
  { data: tasksData },
] = await Promise.all([
  supabase.from('leads').select('*', { count: 'exact', head: true }),
  supabase.from('leads').select('*', { count: 'exact', head: true }).eq('status', 'New'),
  supabase.from('leads').select('*', { count: 'exact', head: true }).eq('status', 'Won'),
  supabase.from('boqs').select('grand_total').eq('status', 'Paid'),
  supabase.from('boqs').select('*', { count: 'exact', head: true }).neq('status', 'Draft'),
  supabase.from('leads').select('id, name, source, status, created_at').order('created_at', { ascending: false }).limit(3),
  supabase.from('profiles').select('id, name, score, avatar_url, role').order('score', { ascending: false }).limit(5),
  supabase.from('products').select('id, name, stock_quantity').lt('stock_quantity', 5).limit(2),
  supabase
    .from('leads')
    .select('id, name, next_follow_up')
    .lte('next_follow_up', new Date().toISOString())
    .not('next_follow_up', 'is', null)
    .order('next_follow_up', { ascending: true })
    .limit(20),
]);
```

Then add after the existing `setLowStockProducts(lowStock || []);` line:
```tsx
setTodayTasks((tasksData || []) as { id: string; name: string; next_follow_up: string }[]);
```

- [ ] **Step 3: Add the widget JSX**

Add this card immediately after the existing stats cards row (after the `</Row>` that contains Total Leads, Active Deals, BOQs Sent, Top Performer):

```tsx
{/* Daily Tasks Widget */}
<div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
  <div className="flex items-center justify-between mb-4">
    <div>
      <h3 className="text-sm font-bold text-[#0D2137]">🔥 مهام اليوم</h3>
      <p className="text-xs text-slate-400">متابعات مستحقة اليوم أو متأخرة</p>
    </div>
    {todayTasks.length > 0 && (
      <span className="bg-[#D72B2B] text-white text-xs font-bold px-2.5 py-0.5 rounded-full">
        {todayTasks.length}
      </span>
    )}
  </div>
  {todayTasks.length === 0 ? (
    <p className="text-center text-sm text-slate-400 py-4">✓ لا توجد متابعات اليوم</p>
  ) : (
    <div className="space-y-2">
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
    </div>
  )}
</div>

{/* Lead Drawer for task clicks */}
<LeadDrawer
  lead={selectedTaskLead}
  open={taskDrawerOpen}
  onClose={() => setTaskDrawerOpen(false)}
  onEdit={() => setTaskDrawerOpen(false)}
/>
```

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/dashboard/page.tsx"
git commit -m "feat: daily tasks widget on dashboard with lead drawer integration"
```

---

## Task 12: Reports — Lead Maker + Assigned To Columns

**Files:**
- Modify: `app/(dashboard)/reports/page.tsx`

- [ ] **Step 1: Update the MetaLead interface**

Find:
```tsx
interface MetaLead {
  id: string;
  name: string;
  phone: string;
  source: string;
  status: string;
  form_id: string | null;
  created_at: string;
  assigned_to_user: string | null;
}
```

Replace with:
```tsx
interface MetaLead {
  id: string;
  name: string;
  phone: string;
  source: string;
  status: string;
  form_id: string | null;
  created_at: string;
  assigned_to_user: string | null;
  creator: { name: string } | null;
  assignee: { name: string } | null;
}
```

- [ ] **Step 2: Update the Supabase query to join profiles**

Find:
```tsx
.select('id, name, phone, source, status, form_id, created_at, assigned_to_user')
.eq('source', 'Meta')
```

Replace with:
```tsx
.select('id, name, phone, source, status, form_id, created_at, assigned_to_user, created_by, creator:created_by(name), assignee:assigned_to_user(name)')
.eq('source', 'Meta')
```

- [ ] **Step 3: Add the two new columns to the table**

Find where the meta leads are displayed in a table or list. Add two new column definitions (or data rows in the table):

```tsx
// Add to columns array or table rendering:
{
  title: 'صاحب الليد (Lead Maker)',
  key: 'creator',
  width: 130,
  render: (_: unknown, record: MetaLead) => record.creator?.name || '—',
},
{
  title: 'المعين له (Assigned To)',
  key: 'assignee',
  width: 130,
  render: (_: unknown, record: MetaLead) => record.assignee?.name || '—',
},
```

- [ ] **Step 4: Update the CSV export**

Find `handleExport`. Update the header row and data rows:
```tsx
rows.push(['الاسم', 'الهاتف', 'المصدر', 'الحالة', 'صاحب الليد', 'المعين له', 'معرف الحملة', 'تاريخ الإنشاء']);
metaLeads.forEach(l => {
  rows.push([
    l.name,
    l.phone,
    l.source,
    l.status,
    l.creator?.name || '',
    l.assignee?.name || '',
    l.form_id || '',
    l.created_at,
  ]);
});
```

- [ ] **Step 5: TypeScript check + commit**

```bash
npx tsc --noEmit
git add "app/(dashboard)/reports/page.tsx"
git commit -m "feat: add lead maker and assigned to columns to reports table and CSV"
```

---

## Task 13: Final Build Verification

- [ ] **Step 1: Run full TypeScript check**

```bash
cd "d:/Loomark/gchv-egypt-ai-co-pilot (3)/loomark"
npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 2: Run production build**

```bash
npm run build
```
Expected: Build completes with no errors. Warnings are acceptable.

- [ ] **Step 3: Smoke test in dev**

```bash
npm run dev
```

Verify each feature manually:
- [ ] `/login` — LOOMARK slides in, quotes rotate every 4s with dots
- [ ] Loading screen — dark background + Arabic quote (navigate between pages)
- [ ] `/dashboard` — "مهام اليوم" widget appears; clicking a row opens Lead Drawer
- [ ] `/crm` — non-admin/manager users see only their own leads; search debounces 300ms
- [ ] Lead Drawer Activity tab — sub-tabs, avatar feed, "+ إضافة نشاط" form works
- [ ] `/reports` — صاحب الليد and المعين له columns visible; CSV download includes them
- [ ] Sidebar logout button visible in both collapsed and expanded states
- [ ] App remains logged in during activity; auto-logs out after 30 min idle

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: final build verification — all CRM enhancements complete"
```
