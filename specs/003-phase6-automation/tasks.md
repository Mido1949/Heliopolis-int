---
description: "Task list for Phase 6 — HelioMax Automation"
---

# Tasks: Phase 6 — HelioMax Automation

**Input**: `specs/003-phase6-automation/`

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **API**: [contracts/api-spec.md](./contracts/api-spec.md)

**Branch**: `003-phase6-automation`

**Key insight**: US1 (Price List) is already implemented and wired. Phase 3 is smoke-test only — no new code.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no blocking dependencies)
- **[Story]**: User story label (US1–US4)
- All new API routes MUST include `export const dynamic = 'force-dynamic'` (Constitution §V)
- All UI MUST be RTL-first Arabic (Constitution §I)
- No destructive DB changes — all tables already exist (Constitution §II)

---

## Phase 1: Setup

**Purpose**: Confirm branch and validate existing helpers before implementing

- [ ] T001 Checkout or create branch `003-phase6-automation` from `002-heliomax-platform` — run `git checkout -b 003-phase6-automation` or `git checkout 003-phase6-automation` if it already exists

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Confirm shared dependencies before any user story implementation begins

**⚠️ CRITICAL**: Read these files before writing any callers — signatures must match exactly

- [ ] T002 [P] Read `lib/notifications/in-app.ts` to confirm the exact exported signature of `createNotification()` — specifically: parameter names, whether `leadId` is optional, and return type; note any discrepancies vs. plan.md
- [ ] T003 [P] Search `app/api/leads/` to inventory existing routes — confirm `app/api/leads/[id]/route.ts` does NOT yet exist (only `app/api/leads/[id]/stage/route.ts`) so a new file is safe to create

**Checkpoint**: Foundation confirmed — user story implementation can now begin

---

## Phase 3: User Story 1 — Price List In-App Editor (Priority: P1) 🎯 MVP

**Goal**: Verify the already-wired PriceListManager works end-to-end — no new code expected

**Independent Test**: Open Settings → "قائمة الأسعار" tab → edit a price → create a new BOQ → confirm new price appears

> **This phase is a smoke test.** All components and routes already exist. Tasks below are verification-only; fix only what is broken.

- [ ] T004 [US1] Read `app/(dashboard)/settings/page.tsx` around line 359 to confirm `PriceListManager` is imported and rendered inside the "قائمة الأسعار" tab with Admin/Tech Lead role guard — if tab or component is missing, add it following the existing tab pattern on that page
- [ ] T005 [US1] Read `components/boq/PriceListManager.tsx` to confirm it renders an editable table and calls `GET /api/price-list` (list) and `PATCH /api/price-list/[id]` (update) — document the component's role guard behavior
- [ ] T006 [US1] Read `app/api/price-list/route.ts` and `app/api/price-list/[id]/route.ts` to confirm GET returns all models and PATCH restricts writes to `admin` and `tech_lead` roles — fix any missing role guard

**Checkpoint**: Price List editor loads, edit + save works, role guard enforced — US1 done ✅

---

## Phase 4: User Story 2 — Auto Notifications (Priority: P2)

**Goal**: Bell in shell header, assignment notifications, and daily stuck-leads cron

**Independent Test**: Insert a notification row in Supabase → within 30s bell shows badge → click to read → badge clears

### Implementation for User Story 2

- [ ] T007 [P] [US2] Create `app/api/notifications/route.ts` — GET handler: authenticate via session cookie, query `notifications` table for `user_id = current_user` and `read = false`, return max 20 ordered by `created_at DESC` as JSON array; include `export const dynamic = 'force-dynamic'` and Supabase server client with cookies
- [ ] T008 [P] [US2] Create `app/api/notifications/read/route.ts` — POST handler: authenticate via session cookie, accept body `{all: true}` OR `{id: uuid}`, update matching `notifications` rows to `read = true` scoped to `user_id = current_user`, return `{ok: true, updated: N}`; include `export const dynamic = 'force-dynamic'`
- [ ] T009 [P] [US2] Create `app/api/reports/stuck-leads/cron/route.ts` — POST handler: (1) verify `Authorization: Bearer` header equals `process.env.CRON_SECRET`, return 401 if mismatch; (2) use `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)` (no cookies — cron has no session); (3) query leads where `pipeline_stage NOT IN ('WON','LOST_PRICE','GHOSTED','POSTPONED')` AND `updated_at < NOW() - INTERVAL '3 days'` AND `assigned_to_user IS NOT NULL`; (4) for each lead, check if a notification exists with same `lead_id` created in last 24h and message containing "واقف"; (5) if no recent notification, call `createNotification(lead.assigned_to_user, "⚠️ {lead.name} واقف في {lead.pipeline_stage} منذ {days} أيام", lead.id)`; (6) return `{ok: true, date: today, checked: N, notified: M}`
- [ ] T010 [P] [US2] Create `components/layout/NotificationBell.tsx` — 'use client' component: (a) state: `notifications[]`, `unreadCount`, `open: bool`; (b) `useEffect` on mount + `setInterval(30000)` to fetch `GET /api/notifications`; (c) render Ant Design `Badge` wrapping `BellOutlined` icon with `count={unreadCount}`; (d) on click, open Ant Design `Popover` (RTL, `placement="bottomLeft"`) listing notifications newest-first with Arabic message and relative timestamp; (e) footer button "تعليم الكل كمقروءة" that calls `POST /api/notifications/read` with `{all: true}` then re-fetches; clear interval on component unmount
- [ ] T011 [US2] Create `app/api/leads/[id]/route.ts` — PATCH handler: (1) authenticate via session cookie; (2) accept body `{assigned_to_user: uuid | null}`; (3) read current `leads.assigned_to_user` for this lead; (4) update `leads` row; (5) if new `assigned_to_user` differs from old and is not null, fetch lead name then call `createNotification(newUserId, "📋 تم تحويل {lead.name} إليك", leadId)`; (6) return updated lead row; include `export const dynamic = 'force-dynamic'`
- [ ] T012 [US2] Modify `components/layout/NormalUserShell.tsx` — import `NotificationBell` from `@/components/layout/NotificationBell`; add it to the shell header in the top-right area (RTL: use `flex flex-row-reverse` or equivalent Ant Design layout so bell appears at the left visually in RTL); confirm it does not break existing header elements (search bar, user avatar, etc.)
- [ ] T013 [US2] Modify `vercel.json` — add a new entry to the `crons` array: `{"path": "/api/reports/stuck-leads/cron", "schedule": "0 6 * * 1-5"}` (6:00 AM UTC = 8:00 AM Cairo, Mon–Fri)

**Checkpoint**: Bell visible in shell, badge updates within 30s of notification insert, mark-read clears badge, stuck-leads cron returns `{ok: true}` — US2 done ✅

---

## Phase 5: User Story 3 — Auto Task Creation (Priority: P3)

**Goal**: New lead with assigned user → "اتصل بـ [name]" task auto-created today

**Independent Test**: Save a new lead via AI shell with `assigned_to_user` set → go to Tasks page → task "اتصل بـ [lead name]" appears with type=call and due=today

### Implementation for User Story 3

- [ ] T014 [P] [US3] Create `lib/tasks/auto-create.ts` — export `async function createAutoCallTask(params: {leadId: string; leadName: string; assignedTo: string; orgId: string; createdBy: string}): Promise<void>`; use `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)` (service role for server-side insert); (1) check `SELECT 1 FROM tasks WHERE lead_id = params.leadId AND title ILIKE '%اتصل%' LIMIT 1`; (2) if no existing row, insert: `{title: "اتصل بـ {leadName}", type: "call", assigned_to: assignedTo, due_date: new Date().toISOString().slice(0,10), lead_id: leadId, org_id: orgId, created_by: createdBy, completed: false}`; swallow errors silently (non-critical path — never block lead save)
- [ ] T015 [US3] Modify `components/layout/NormalUserShell.tsx` — in the `saveLead()` success handler (after the Supabase insert/upsert returns), if the saved lead has `assigned_to_user` set and the operation was a new insert (not an update to existing lead), call `createAutoCallTask({leadId: lead.id, leadName: lead.name, assignedTo: lead.assigned_to_user, orgId: currentOrgId, createdBy: currentUser.id})`; wrap the call in `try/catch` — a task creation failure must never surface to the user or block the lead save
- [ ] T016 [US3] Verify idempotency of `lib/tasks/auto-create.ts`: read the implementation and confirm the `SELECT 1 ... ILIKE '%اتصل%'` guard prevents duplicate tasks if `saveLead` fires twice for the same `leadId` — add the guard if missing

**Checkpoint**: New lead saves → task appears in Tasks page → saving same lead again does NOT create duplicate — US3 done ✅

---

## Phase 6: User Story 4 — System-Approval Knowledge Base (Priority: P4)

**Goal**: `.md` files in `system-approval/` are injected into Helio AI system prompt at request time

**Independent Test**: Create `system-approval/pricing.md` with a unique price → ask Helio that price → answer matches file, not generic AI

### Implementation for User Story 4

- [ ] T017 [P] [US4] Create `lib/system-approval/loader.ts` — export `function loadSystemApprovalContext(): string`; use Node.js `fs` and `path` modules (available in Next.js API routes); (1) resolve `dir = path.join(process.cwd(), 'system-approval')`; (2) if dir does not exist, return `''`; (3) read all `.md` files excluding `README.md`; (4) if none, return `''`; (5) for each file, if content exceeds 50 000 characters, truncate to 50 000 with a `\n[... truncated]` suffix; (6) concatenate as `"\n\n---\n## معلومات الشركة (Company Knowledge Base)\n" + files.map(f => "### " + filename + "\n" + content).join("\n\n---\n")`; return the concatenated string
- [ ] T018 [US4] Modify `app/api/agent/chat/route.ts` — import `loadSystemApprovalContext` from `@/lib/system-approval/loader`; inside the POST handler, before calling `client.messages.create(...)`, call `const kb = loadSystemApprovalContext()`; prepend `kb` to the existing system prompt string: `const enrichedSystem = (existingSystemPrompt || '') + kb`; pass `enrichedSystem` instead of the original system prompt; if `kb` is empty string, behavior is unchanged
- [ ] T019 [US4] Create `system-approval/products.md` — placeholder file so the pipeline can be smoke-tested immediately; content should be a simple markdown table or list with 2–3 example product entries (e.g., "كاسيت 24k BTU = $850") clearly marked as SAMPLE DATA; add a comment at the top: `<!-- Replace this file with real product data -->`

**Checkpoint**: Ask Helio the sample price from products.md → answer matches file → delete file → ask again → Helio says it has no info — US4 done ✅

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Verify constitution compliance, no regressions, and deployment readiness

- [ ] T020 Run `npm run build` in `d:\HelioMax` and confirm build exits with code 0 — fix any TypeScript/import errors introduced by Phase 6 changes before proceeding
- [ ] T021 Execute all 6 test scenarios from `specs/003-phase6-automation/quickstart.md` against the running dev server (`npm run dev`) — document pass/fail for each scenario
- [ ] T022 [P] Audit all new API routes (`app/api/notifications/route.ts`, `app/api/notifications/read/route.ts`, `app/api/leads/[id]/route.ts`) for `export const dynamic = 'force-dynamic'` (Constitution §V) — add if missing
- [ ] T023 [P] Audit `NotificationBell.tsx` and any modified shell component for RTL layout correctness (Constitution §I) — bell icon must be positioned correctly in RTL context, Arabic text must render right-to-left, no LTR-only flex patterns

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: After Phase 1 — blocks all user story phases
- **US1 (Phase 3)**: After Phase 2 — smoke test, no new code dependencies
- **US2 (Phase 4)**: After Phase 2 (needs `createNotification` signature confirmed by T002, and lead route map from T003)
- **US3 (Phase 5)**: After Phase 2 (T002 needed) — can run in parallel with US2 and US4 if staffed
- **US4 (Phase 6)**: After Phase 2 — fully independent of US2 and US3
- **Polish (Phase 7)**: After all desired user stories are complete

### User Story Dependencies

- **US1 (P1)**: Independent — no runtime dependency on US2/US3/US4
- **US2 (P2)**: Independent — notification bell and cron add new UI/infra, don't require US1/US3/US4
- **US3 (P3)**: Independent — auto-task creation is additive to existing lead-save flow
- **US4 (P4)**: Independent — knowledge base injection is additive to existing agent chat route

### Within Each User Story

- US2: T007/T008/T009/T010 can all start in parallel (different files) → T011 depends on T002 (notification signature) → T012 depends on T010 (component must exist before wiring to shell) → T013 is independent
- US3: T014 first → T015 depends on T014 → T016 is a read-only verification after T014

---

## Parallel Execution Examples

### Phase 2 (run together)
```
T002: Read lib/notifications/in-app.ts — confirm createNotification() signature
T003: Search app/api/leads/ — confirm no existing [id]/route.ts
```

### Phase 4 US2 — first wave (all different files, no dependencies)
```
T007: Create app/api/notifications/route.ts
T008: Create app/api/notifications/read/route.ts
T009: Create app/api/reports/stuck-leads/cron/route.ts
T010: Create components/layout/NotificationBell.tsx
```

### Phase 7 (run together)
```
T022: Audit API routes for force-dynamic
T023: Audit NotificationBell for RTL compliance
```

---

## Implementation Strategy

### MVP First (US1 + US2 only)

1. Phase 1: Setup → Phase 2: Foundational
2. Phase 3: US1 smoke test (fast — just read/verify existing code)
3. Phase 4: US2 full implementation (notifications + cron)
4. **STOP and VALIDATE**: Build passes, bell works, stuck-leads cron returns `{ok: true}`
5. Deploy to `loomark.vercel.app` if ready

### Incremental Delivery

1. Setup + Foundational → branch ready
2. US1 smoke test → confirms existing price list works (no code risk)
3. US2 (notifications) → visible business value: bell + stuck-lead alerts
4. US3 (auto tasks) → removes manual step after lead creation
5. US4 (knowledge base) → Helio becomes company-specific
6. Each story independently testable at each checkpoint

### Single Developer Sequence

```
T001 → T002+T003 (parallel) → T004+T005+T006 (US1 verify)
→ T007+T008+T009+T010 (US2 parallel) → T011 → T012 → T013
→ T014 → T015 → T016
→ T017 → T018 → T019
→ T020 → T021 → T022+T023 (parallel)
```

---

## Constitution Reference

| Principle | Tasks |
|-----------|-------|
| §I RTL-First | T010, T012, T023 |
| §II Database Safety | T009 (additive only), T011 (update not delete) |
| §III Passwords Never Touch AI | T018 (KB content is product data, never credentials) |
| §V force-dynamic | T007, T008, T009, T011, T022 |
| §VII No Breakage | T020 (build), T021 (smoke test) |
| §VIII Simplicity | T014 (swallows errors silently, never blocks lead save) |

---

## Notes

- Tasks marked [P] touch different files and have no cross-task dependencies at that point — safe to run in parallel
- All cron routes use `createClient(url, service_role_key)` directly — never `supabase.auth.getUser()` (no session cookie in cron context)
- `createAutoCallTask` errors must be swallowed — a task creation failure must NEVER block or surface to the user during lead save
- The `system-approval/` folder is NOT in `.vercelignore` — its contents are deployed with the app and readable at runtime via `fs.readFileSync`
- Rotating the Anthropic API key is a pending action (key was exposed in a previous session) — do this before deploying US4
