# Implementation Plan: Phase 6 — HelioMax Automation

**Branch**: `003-phase6-automation` | **Date**: 2026-06-05 | **Spec**: [spec.md](./spec.md)

## Summary

Wire up 4 automation features on top of the existing HelioMax platform: price list in-app editor (component already exists and is already wired — smoke test only), auto notifications via a bell UI + stuck-leads cron + assignment triggers, auto task creation when a lead is saved, and system-approval knowledge files injected into Helio's system prompt at request time.

## Technical Context

**Language/Version**: TypeScript / Next.js 14.2 App Router

**Primary Dependencies**: Supabase (Postgres + RLS + Realtime), Anthropic Claude SDK, Ant Design 5, Tailwind CSS, Node.js `fs` module (for system-approval file reading)

**Storage**: Supabase Postgres. `notifications (id, user_id, message, lead_id, read, created_at)` — already created by migration 005. `tasks` table already exists. `price_list` table already seeded.

**Target Platform**: Vercel (production), localhost:3000 (dev)

**Constraints**: RTL-first Arabic UI. No destructive migrations. Passwords never touch AI. `force-dynamic` on all live-data routes. `npm install --legacy-peer-deps`.

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. RTL-First UI | ✅ | Notification bell + panel must be Arabic RTL |
| II. Database Safety | ✅ | No destructive migrations. Notifications table already created by migration 005. |
| III. Security — Passwords Never Touch AI | ✅ | system-approval content loaded server-side, no user credentials in scope |
| V. Next.js Runtime Rules | ✅ | Cron routes use `createClient` (service role, no cookies). Live routes use `force-dynamic`. |
| VI. Phase Order | ✅ | Phase 6 follows completed Phase 5 |
| VII. No Breakage | ✅ | All changes are additive |
| VIII. Simplicity | ✅ | Re-use `createNotification()`, existing `PriceListManager`, existing agent route |

## Project Structure

### Documentation

```text
specs/003-phase6-automation/
├── plan.md              ← this file
├── spec.md
├── research.md
├── data-model.md
├── contracts/api-spec.md
├── quickstart.md
└── tasks.md             ← /speckit-tasks output
```

### Source Code — Files to Create / Modify

```text
NEW FILES:
  app/api/notifications/route.ts               GET — list notifications for current user
  app/api/notifications/read/route.ts          POST — mark notification(s) as read
  app/api/reports/stuck-leads/cron/route.ts    POST — detect stuck leads, create notifications
  components/layout/NotificationBell.tsx       Bell icon + badge + popover panel
  lib/tasks/auto-create.ts                     createAutoCallTask() helper
  lib/system-approval/loader.ts               loadSystemApprovalContext() reads .md files

MODIFIED FILES:
  app/api/agent/chat/route.ts                  Prepend system-approval content to system prompt
  app/api/leads/[id]/stage/route.ts            Add PATCH handler for assigned_to_user change + notification
  components/layout/NormalUserShell.tsx        Add NotificationBell + call createAutoCallTask after saveLead
  vercel.json                                  Add stuck-leads cron: "0 6 * * 1-5"

ALREADY DONE (smoke test only):
  components/boq/PriceListManager.tsx          ✅ exists, full CRUD
  app/(dashboard)/settings/page.tsx            ✅ PriceListManager already rendered in tab
  app/api/price-list/route.ts                  ✅ exists
  app/api/price-list/[id]/route.ts             ✅ exists
  lib/notifications/in-app.ts                  ✅ createNotification() exists
  supabase/migrations/005_notifications.sql    ✅ notifications table exists
```

---

## Phase 0: Research (Resolved Inline)

**Decision 1: Assignment notification trigger location**
- **Decision**: In the Next.js PATCH route for lead updates — NOT a Supabase DB trigger.
- **Rationale**: All business logic stays in Next.js. Easier to test, no SQL trigger maintenance.

**Decision 2: Auto-task creation location**
- **Decision**: In `NormalUserShell.saveLead()` (primary path) + shared helper `lib/tasks/auto-create.ts`.
- **Rationale**: DRY helper means any future lead-creation route can reuse it.

**Decision 3: system-approval loading**
- **Decision**: `fs.readFileSync` at request time in `/api/agent/chat`.
- **Rationale**: Content updates take effect instantly without redeploy.

**Decision 4: Stuck leads cron timing**
- **Decision**: `0 6 * * 1-5` UTC = 8:00 AM Cairo weekdays.
- **Rationale**: Users arrive ~9 AM, need alerts before starting work.

**Decision 5: Price list**
- **Discovery**: `PriceListManager` is already imported and rendered in settings page (line 359). No code changes needed — smoke test only.

**Decision 6: Duplicate notification prevention**
- **Decision**: Before inserting a stuck-lead notification, query `notifications` for a row with same `lead_id` created in the last 24 hours.
- **Rationale**: Prevents notification spam if cron runs multiple times.

---

## Phase 1: Design Artifacts

See [data-model.md](./data-model.md) | [contracts/api-spec.md](./contracts/api-spec.md) | [quickstart.md](./quickstart.md)

### Notification Bell Component Design

```
NotificationBell (client component)
  - State: notifications[], unreadCount, open (bool)
  - useEffect: fetch /api/notifications on mount + poll every 30s
  - Render: Bell icon (Ant Design BellOutlined) with Badge count
  - On click: Popover with notification list (newest first, max 20)
  - Each row: message + timestamp (relative, e.g. "منذ 5 دقائق")
  - Footer: "تعليم الكل كمقروء" button → POST /api/notifications/read {all:true}
  - After mark-read: re-fetch, badge clears
```

### Stuck Leads Cron Logic

```
POST /api/reports/stuck-leads/cron
  1. Verify Authorization: Bearer = CRON_SECRET
  2. Query leads:
       pipeline_stage NOT IN ('WON','LOST_PRICE','GHOSTED','POSTPONED')
       AND updated_at < NOW() - INTERVAL '3 days'
       AND assigned_to_user IS NOT NULL
  3. For each lead:
       a. Check: SELECT 1 FROM notifications
                 WHERE lead_id = lead.id
                   AND created_at > NOW() - INTERVAL '24 hours'
                   AND message LIKE '%واقف%'
                 LIMIT 1
       b. If no row found → createNotification(lead.assigned_to_user,
            "⚠️ {lead.name} واقف في {stage} منذ {days} يوم", lead.id)
  4. Return { ok: true, checked: N, notified: M }
```

### Auto Task Creation

```typescript
// lib/tasks/auto-create.ts
export async function createAutoCallTask(params: {
  leadId: string;
  leadName: string;
  assignedTo: string;
  orgId: string;
  createdBy: string;
}): Promise<void>
  // 1. Check for existing system task for this lead
  //    SELECT 1 FROM tasks WHERE lead_id = leadId AND title LIKE '%اتصل%' LIMIT 1
  // 2. If none → INSERT tasks (title, type, assigned_to, due_date, lead_id, org_id, created_by)
  //    title: `اتصل بـ ${leadName}`
  //    type: 'call'
  //    due_date: today (ISO date)
  //    completed: false
```

### System-Approval Loader

```typescript
// lib/system-approval/loader.ts
import fs from 'fs';
import path from 'path';

export function loadSystemApprovalContext(): string {
  const dir = path.join(process.cwd(), 'system-approval');
  if (!fs.existsSync(dir)) return '';
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md') && f !== 'README.md');
  if (files.length === 0) return '';
  const parts = files.map(f => {
    const content = fs.readFileSync(path.join(dir, f), 'utf-8');
    return `### ${f}\n${content}`;
  });
  return `\n\n---\n## Company Knowledge Base\n${parts.join('\n\n---\n')}`;
}
```

Then in `/api/agent/chat/route.ts`:
```typescript
import { loadSystemApprovalContext } from '@/lib/system-approval/loader';
// inside POST, before client.messages.create:
const knowledgeBase = loadSystemApprovalContext();
const enrichedSystem = (system || '') + knowledgeBase;
// pass enrichedSystem instead of system to client.messages.create
```

### Lead Assignment Route — New PATCH

The existing `PATCH /api/leads/[id]/stage` only handles pipeline stage changes. Need a new route or extend the existing one to handle `assigned_to_user` updates and trigger notifications.

**Decision**: Add `PATCH /api/leads/[id]/route.ts` that accepts `{ assigned_to_user }` and:
1. Updates `leads.assigned_to_user`
2. Calls `createNotification(new_user_id, "📋 تم تحويل [name] إليك", lead_id)`
