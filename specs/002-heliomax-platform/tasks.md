# Tasks: HelioMax Platform Transformation

**Input**: Design documents from `specs/002-heliomax-platform/`

**Prerequisites**: plan.md ✅ · spec.md ✅ · research.md ✅ · data-model.md ✅ · contracts/api-spec.md ✅ · quickstart.md ✅

**Tests**: Not requested — no test tasks generated.

**Organization**: Tasks grouped by user story. Each story is independently implementable and testable.

**[P]** = can run in parallel (different files, no shared state dependency)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and configuration changes that all phases depend on.

- [ ] T001 Verify `npm install --legacy-peer-deps` succeeds and `npm run build` passes on current codebase
- [ ] T002 Create `supabase/migrations/` directory at `d:\HelioMax\supabase\migrations\`
- [ ] T003 Add `vercel.json` at `d:\HelioMax\vercel.json` with empty cron array (to be populated in Phases 4/5)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Infrastructure that MUST be complete before ANY user story begins. These are cross-cutting changes that every story depends on.

**⚠️ CRITICAL**: No user story work begins until all foundational tasks complete and `npm run build` passes.

- [ ] T004 Read `d:\HelioMax\types\index.ts` — add `PipelineStage` union type and update `Lead` interface with `pipeline_stage`, `deal_value`, `stage_timestamps`, `last_contact_date` fields per `data-model.md`
- [ ] T005 [P] Read `d:\HelioMax\lib\constants.ts` — add `PIPELINE_STAGES` array with 9 stages (value, labelAr, color) matching the pipeline spec
- [ ] T006 [P] Create `d:\HelioMax\supabase\migrations\001_pipeline_stage.sql` with ALTER TABLE to add `pipeline_stage`, `deal_value`, `stage_timestamps`, `last_contact_date` to leads table, CHECK constraint, and backfill from old `status` column (per `data-model.md` Migration 1)
- [ ] T007 [P] Create `d:\HelioMax\supabase\migrations\004_rls_leads.sql` with the CS user isolation policy per `data-model.md` Migration 4
- [ ] T007b [P] Create `d:\HelioMax\supabase\migrations\005_notifications.sql` — CREATE TABLE notifications: `id UUID PK, user_id UUID FK→profiles, message TEXT, lead_id UUID FK→leads nullable, read BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT NOW()`; enable RLS: users can only read their own notifications; required by Phase 7 T064
- [ ] T008 Run all Phase 2 migrations (T006, T007, T007b) against the Supabase project via **Supabase CLI only** (`supabase db push`) — never use the dashboard SQL editor directly (constitution governance rule)

**Checkpoint**: `npm run build` passes with updated types. All three migrations applied. Foundation ready.

---

## Phase 3: User Story 1 — Rebrand: HelioMax Identity (P1) 🎯

**Goal**: Remove all "Loomark" and "Heliopolis INT" references from source. Package name updated. AI agent component renamed.

**Independent Test**: `grep -ri "loomark\|heliopolis int" app/ components/ lib/ context/ hooks/ types/ package.json` returns zero results. `npm run build` passes.

- [ ] T009 Read `d:\HelioMax\package.json` — change `name` from `"loomark"` to `"heliomax"`
- [ ] T010 [P] [US1] Read `d:\HelioMax\lib\constants.ts` — change `APP_NAME` to `'HelioMax'` and `COMPANY_NAME` to `'HelioMax'`; update file header comment from `LOOMARK` to `HELIOMAX`
- [ ] T011 [P] [US1] Read `d:\HelioMax\types\index.ts` — update file header comment from `LOOMARK` to `HELIOMAX`
- [ ] T012 [P] [US1] Read `d:\HelioMax\components\layout\Sidebar.tsx` — replace all "Loomark"/"Heliopolis INT" strings with "HelioMax"; update any logo text or app name references
- [ ] T013 [P] [US1] Read `d:\HelioMax\components\layout\Navbar.tsx` — replace all "Loomark"/"Heliopolis INT" strings with "HelioMax"
- [ ] T014 [P] [US1] Read `d:\HelioMax\components\shared\LoadingScreen.tsx` — replace all brand name strings with "HelioMax"
- [ ] T015 [P] [US1] Read `d:\HelioMax\context\AuthContext.tsx` — replace all "Loomark"/"Heliopolis INT" strings with "HelioMax"
- [ ] T016 [P] [US1] Read `d:\HelioMax\context\OrgContext.tsx` — replace all "Loomark"/"Heliopolis INT" strings with "HelioMax"
- [ ] T017 [P] [US1] Read `d:\HelioMax\context\LanguageContext.tsx` — replace all "Loomark"/"Heliopolis INT" strings with "HelioMax"
- [ ] T018 [P] [US1] Read `d:\HelioMax\app\(auth)\login\page.tsx` — replace all brand name strings
- [ ] T019 [P] [US1] Read `d:\HelioMax\app\(dashboard)\ai-assistant\page.tsx` — replace all brand name strings
- [ ] T020 [P] [US1] Read `d:\HelioMax\app\(dashboard)\crm\ImportModal.tsx` — replace all brand name strings
- [ ] T021 [P] [US1] Read `d:\HelioMax\app\(dashboard)\email\page.tsx` — replace all brand name strings
- [ ] T022 [P] [US1] Read `d:\HelioMax\app\(dashboard)\settings\page.tsx` — replace all brand name strings
- [ ] T023 [P] [US1] Read `d:\HelioMax\app\(dashboard)\time-tracker\page.tsx` — replace all brand name strings
- [ ] T024 [P] [US1] Read `d:\HelioMax\app\api\agent\chat\route.ts` — replace all brand name strings
- [ ] T025 [P] [US1] Read `d:\HelioMax\app\api\email\send\route.ts` — replace all brand name strings
- [ ] T026 [P] [US1] Read `d:\HelioMax\app\data-deletion\page.tsx` — replace all brand name strings
- [ ] T027 [P] [US1] Read `d:\HelioMax\app\privacy\page.tsx` — replace all brand name strings
- [ ] T028 [P] [US1] Read `d:\HelioMax\components\email\EmailEditor.tsx` — replace all brand name strings
- [ ] T029 [US1] Rename `d:\HelioMax\components\agent\LookAgent.tsx` → `HelioAgent.tsx`; update the component name inside the file; find all files importing `LookAgent` and update their import paths to `HelioAgent`
- [ ] T030 [US1] Run `grep -ri "loomark\|heliopolis int" app/ components/ lib/ context/ hooks/ types/ package.json` and fix any remaining hits

**Checkpoint**: grep returns zero. `npm run build` passes. Browser tab shows "HelioMax". Sidebar shows "HelioMax".

---

## Phase 4: User Story 2 — Stability: Full Workday Session (P2)

**Goal**: Fix auth session management so the app runs all day without hard-refresh or re-login.

**Independent Test**: Log in → navigate CRM/BOQ/Tasks/Dashboard for 30 minutes without refresh → no auth error, no blank screen, data stays current.

- [ ] T031 [US2] Read `d:\HelioMax\lib\supabase\client.ts` — ensure `createBrowserClient` is called with `auth: { persistSession: true, autoRefreshToken: true, storageKey: 'heliomax-auth' }`
- [ ] T032 [US2] Read `d:\HelioMax\lib\supabase\middleware.ts` — verify `createServerClient` in middleware properly refreshes the session on every request by calling `supabase.auth.getUser()` and returning the response with updated cookies
- [ ] T033 [US2] Read `d:\HelioMax\hooks\useSessionManager.ts` — add proactive token refresh: use `supabase.auth.getSession()` to check expiry, schedule a `setTimeout` 5 minutes before `expires_at`, call `supabase.auth.refreshSession()` in the handler
- [ ] T034 [US2] Read `d:\HelioMax\context\AuthContext.tsx` — wire `onAuthStateChange` listener; handle `TOKEN_REFRESHED` event (no-op, session updated automatically); handle `SIGNED_OUT` event (redirect to login); handle `USER_UPDATED` event (refresh user state)
- [ ] T035 [US2] Test: open DevTools → Application → Local Storage → confirm session key present with future expiry after 30-minute idle period

**Checkpoint**: App survives 30-minute idle simulation. No auth redirect. `npm run build` passes.

---

## Phase 5: User Story 3 — Sales Pipeline: 9-Stage Funnel (P3)

**Goal**: 9-stage kanban pipeline. CS user RLS isolation. Pipeline metrics dashboard. WON requires deal_value.

**Independent Test**: Per `quickstart.md` Phase 2 validation.

- [ ] T036 [US3] Create `d:\HelioMax\app\api\leads\[id]\stage\route.ts` — PATCH endpoint per `contracts/api-spec.md`: update `pipeline_stage`, write timestamp to `stage_timestamps[stage]`, update `last_contact_date` for CONTACTED/FOLLOW_UP stages, require `deal_value` when stage=WON
- [ ] T037 [P] [US3] Read `d:\HelioMax\app\(dashboard)\crm\KanbanView.tsx` — replace `LEAD_STATUSES` with `PIPELINE_STAGES` (9 columns); update drag-end handler to call the new stage PATCH endpoint; add deal_value prompt modal when dropping on WON column
- [ ] T038 [P] [US3] Read `d:\HelioMax\app\(dashboard)\crm\LeadDrawer.tsx` — add `pipeline_stage` display with stage history from `stage_timestamps`; add `last_contact_date` field; update stage change actions
- [ ] T039 [P] [US3] Read `d:\HelioMax\app\(dashboard)\crm\LeadFormModal.tsx` — add `pipeline_stage` select field (defaulting to 'NEW'); remove or keep old `status` field as hidden for backward compat
- [ ] T040 [US3] Create `d:\HelioMax\app\(dashboard)\crm\MyCRMPage.tsx` — CS-only lead list: fetch only `assigned_to_user = current_user.id` (RLS enforces this at DB level); include add-client button that opens `LeadFormModal`; read-only for other users' leads (none will appear)
- [ ] T041 [P] [US3] Read `d:\HelioMax\app\(dashboard)\crm\page.tsx` — add `pipeline_stage` filter to existing filter bar; update query to order by `pipeline_stage`; add link/tab to `MyCRMPage` for CS users
- [ ] T042 [P] [US3] Read `d:\HelioMax\app\(dashboard)\dashboard\page.tsx` — add pipeline KPI cards: active leads count (stages 2–5), pipeline value (SUM deal_value in active stages), conversion rate (WON count / NEW count)
- [ ] T043 [P] [US3] Read `d:\HelioMax\app\(dashboard)\dashboard\DashboardCharts.tsx` — add a pipeline funnel bar chart showing lead count per stage using `PIPELINE_STAGES` and Recharts `BarChart`
- [ ] T044 [US3] Verify RLS: log in as a CS user → open browser console → run `supabase.from('leads').select('*').neq('assigned_to_user', currentUserId)` → confirm response data is empty array

**Checkpoint**: 9-column kanban works. WON blocks without deal_value. CS user sees only own leads in all views. Dashboard shows pipeline metrics.

---

## Phase 6: User Story 4 — BOQ Engine: Beat Excel (P4)

**Goal**: Spreadsheet-like BOQ grid with keyboard nav, model autocomplete + live pricing, load calculator, Y-branch auto-calc, branded PDF.

**Independent Test**: Per `quickstart.md` Phase 3 validation — full VRF quote built faster than Excel.

- [ ] T045 [US4] Create `d:\HelioMax\supabase\migrations\002_price_list.sql` — CREATE TABLE price_list + RLS policies per `data-model.md` Migration 2; apply migration
- [ ] T046 [US4] Create `d:\HelioMax\supabase\migrations\003_boq_rooms.sql` — CREATE TABLE boq_rooms with generated columns per `data-model.md` Migration 3; apply migration
- [ ] T047 [P] [US4] Create `d:\HelioMax\app\api\price-list\route.ts` — GET (returns all items, accessible to all authenticated), POST (Admin/Tech Lead only, create new item)
- [ ] T048 [P] [US4] Create `d:\HelioMax\app\api\price-list\[id]\route.ts` — PUT (update price/description, Admin/Tech Lead only), DELETE (Admin only)
- [ ] T049 [P] [US4] Create `d:\HelioMax\app\api\boq\[id]\rooms\route.ts` — GET all rooms for a BOQ, POST add room, PATCH update room, DELETE room
- [ ] T050 [US4] Seed the `price_list` table with the 98-model HVAC price list (create a seed script at `d:\HelioMax\scripts\seed-price-list.ts` that reads from a CSV or hardcoded array and upserts into Supabase)
- [ ] T051 [US4] Create `d:\HelioMax\components\boq\LoadCalculator.tsx` — table with columns: Room Name, Length (m), Width (m), Area (computed L×W), Heat Factor (computed Area×0.3), Required kW (same as heat factor), Qty; editable cells for name/L/W/Qty; Tab/Enter navigation between cells; Add Row button; matches `data-model.md` BOQRoom entity
- [ ] T052 [US4] Rewrite `d:\HelioMax\components\boq\BOQEditor.tsx` as a spreadsheet grid: editable Ant Design Table; columns: Location, Model (AutoComplete from price_list), Qty, Unit Price (read-only, auto-filled), Total (computed); Tab key moves to next cell; Enter key adds new row; Duplicate Row action; bottom summary row shows: Y-branch count `(sum_qty - 2) × 2`, Grand Total, Discount %, Discounted Total; all values update live on every keystroke
- [ ] T053 [US4] Create `d:\HelioMax\components\boq\PriceListManager.tsx` — editable table of price_list items; only visible to Admin/Tech Lead roles; inline edit for `price_usd` and `description`; save via PUT /api/price-list/[id]
- [ ] T054 [US4] Read `d:\HelioMax\components\boq\BOQDocument.tsx` — update PDF template to match "Commercial Offer For VRF" format: header with Heliopolis/HelioMax branding, client details, date, PI No.; line items table; standard inclusions section; standard exclusions section; payment terms (10% down, 90% on delivery); 7-day validity; three signature blocks (Sales Engineer / Sales Manager / Financial Director)
- [ ] T055 [US4] Read `d:\HelioMax\app\(dashboard)\boq\page.tsx` — integrate `LoadCalculator` component above the BOQ grid; wire `LoadCalculator` room data to inform BOQ line item suggestions
- [ ] T056 [US4] Read `d:\HelioMax\app\(dashboard)\settings\page.tsx` — add a "قائمة الأسعار (Price List)" tab that renders `PriceListManager` (visible only to Admin/Tech Lead)
- [ ] T057 [US4] Time test: build a 5-room, 8-unit VRF quote using keyboard only — must complete under the Excel baseline time recorded before implementation

**Checkpoint**: Full VRF quote built faster than Excel. PDF exports correctly with all template sections. Price list editable by Admin/Tech Lead.

---

## Phase 7: User Story 5 — AI Login + Daily Tasks + 3:30 PM Report (P5)

**Goal**: Conversational login with secure password input. Daily task view. 3:30 PM personal report.

**Independent Test**: Per `quickstart.md` Phase 4 validation.

- [ ] T058 [US5] Create `d:\HelioMax\components\agent\PasswordStep.tsx` — React component that renders a masked `<input type="password">` inside a chat bubble; on submit calls `supabase.auth.signInWithPassword({ email, password })` directly; never passes password to parent or AI; shows error on failed auth; clears password field immediately after submission
- [ ] T059 [US5] Read `d:\HelioMax\components\agent\HelioAgent.tsx` — update the login conversation flow: (1) AI asks for name → (2) AI looks up user by name in profiles table → (3) AI says "enter your password below" and renders `<PasswordStep email={resolvedEmail} onSuccess={handleLogin} />` inside the chat response — the password input is NEVER a plain text chat message
- [ ] T060 [US5] Read `d:\HelioMax\app\(dashboard)\ai-assistant\page.tsx` — set this page as the post-login landing page; if user has an active session, redirect to `/tasks`; if no session, show the `HelioAgent` conversational login
- [ ] T061 [P] [US5] Read `d:\HelioMax\app\(dashboard)\tasks\page.tsx` — update to show pipeline-driven daily tasks: fetch `tasks` where `assigned_to = current_user.id` AND `due_date = today`; group by lead; show lead name, pipeline stage, task type, and a "Done" button
- [ ] T062 [P] [US5] Create `d:\HelioMax\lib\reports\personal-report.ts` — async function `getPersonalReportData(userId, date)` that queries: calls made today, leads entered today, leads assigned today, BOQs created today, WON leads with deal_value, LOST_PRICE count, FOLLOW_UP count — all scoped to `userId` on `date`
- [ ] T062b [P] [US5] Create `d:\HelioMax\components\reports\PersonalReport.tsx` — React component using `@react-pdf/renderer` that renders the personal report as a PDF: header with user name + date, activity section (calls/leads/BOQs as labeled rows), outcomes section (WON deals with values as a table, LOST_PRICE count, FOLLOW_UP count); export via `PDFDownloadButton` wrapper with label "تحميل تقريري (Download My Report)"
- [ ] T063 [P] [US5] Create `d:\HelioMax\app\api\reports\personal\route.ts` — GET endpoint returning JSON from `getPersonalReportData`; authenticated, scoped to current user
- [ ] T063b [US5] Read `d:\HelioMax\app\(dashboard)\tasks\page.tsx` — add a "تحميل تقريري" section at the bottom of the page that renders `<PersonalReport />` wrapped in a `<PDFDownloadButton>`; visible only when the current time is after 15:30 Cairo time OR when `?forceReport=1` query param is present (for testing)
- [ ] T064 [US5] Create `d:\HelioMax\app\api\reports\personal\cron\route.ts` — POST handler protected by `CRON_SECRET` env var; iterates all active profiles; for each user inserts a row into the `notifications` table (created in Phase 2 T007b) with message "تقريرك اليوم جاهز للتحميل — Download your report for today"; returns 200 with count of notifications created
- [ ] T065 [US5] Read `d:\HelioMax\vercel.json` — add cron job: `{ "path": "/api/reports/personal/cron", "schedule": "30 13 * * 1-5" }` (13:30 UTC = 3:30 PM Cairo, weekdays)

**Checkpoint**: Conversational login works. Password not visible in console/network/AI payload. Session persists after browser close. 3:30 PM cron triggers notification. PDF report downloads correctly with correct activity data.

---

## Phase 8: User Story 6 — AI Brain: 4:30 PM Company Report (P6)

**Goal**: Daily company intelligence report delivered to Admin at 4:30 PM via Email or Telegram.

**Independent Test**: Per `quickstart.md` Phase 5 validation.

- [ ] T066 [US6] Create `d:\HelioMax\lib\notifications\telegram.ts` — `sendTelegramMessage(text: string)` function using `fetch` to call the Telegram Bot API; reads `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` from `process.env`
- [ ] T067 [P] [US6] Create `d:\HelioMax\lib\reports\company-report.ts` — `generateCompanyReport(date)` function that: (1) queries pipeline stage counts, (2) queries deal_value sum for active stages, (3) queries per-user activity (calls, BOQs, leads), (4) queries WON/LOST/GHOSTED/POSTPONED counts and values for today, (5) identifies leads where `DATEDIFF(now, stage_timestamps[current_stage]) > 3 days`, (6) calls Claude API with all data to generate a 2-3 sentence AI insight paragraph
- [ ] T068 [US6] Create `d:\HelioMax\app\api\reports\company\cron\route.ts` — POST handler protected by `CRON_SECRET`; calls `generateCompanyReport(today)`; formats the report as a structured message; sends via `sendTelegramMessage` AND via Resend email to the admin email address; returns 200 with delivery status
- [ ] T069 [US6] Read `d:\HelioMax\vercel.json` — add cron job: `{ "path": "/api/reports/company/cron", "schedule": "30 14 * * 1-5" }` (14:30 UTC = 4:30 PM Cairo, weekdays)
- [ ] T070 [US6] Add environment variables to Vercel project: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `ADMIN_EMAIL`, `CRON_SECRET`

**Checkpoint**: Manual POST to `/api/reports/company/cron` with correct `CRON_SECRET` → Admin receives Telegram message and email with all required report sections.

---

## Phase 9: User Story 7 — Automation: Self-Running Pipeline (P7)

**Goal**: Auto lead intake from scraper. Auto task creation. AI re-assignment via chat command. In-app notifications.

**Independent Test**: Per `quickstart.md` Phase 6 validation.

- [ ] T071 [US7] Create `d:\HelioMax\lib\notifications\in-app.ts` — `createNotification(userId, message, leadId?)` function that inserts a row into a `notifications` table (create via migration if needed); notifies via Supabase Realtime broadcast on channel `user:${userId}`
- [ ] T072 [P] [US7] Create `d:\HelioMax\app\api\automation\intake\route.ts` — POST endpoint; accepts array of scraped business objects; for each: check for duplicate (by phone number), skip if exists, else insert into `leads` with `pipeline_stage='NEW'`; round-robin assign to CS users (`crm_team='cs'`); call `createNotification` for the assigned CS user; auto-create a call task via INSERT into `tasks`
- [ ] T073 [P] [US7] Create `d:\HelioMax\app\api\automation\assign\route.ts` — POST endpoint per `contracts/api-spec.md`; update lead `assigned_team`, advance `pipeline_stage` to ASSIGNED_TECH (if assigning to tech) or FOLLOW_UP (if assigning back to CS); call `createNotification` for the receiving user; return updated lead
- [ ] T074 [US7] Read `d:\HelioMax\app\api\agent\chat\route.ts` — add intent detection: if user message matches "assign to tech", "أرسل للتقني", "assign to cs", "أرسل للمبيعات" patterns, extract lead context from conversation history and call `/api/automation/assign` internally; respond with confirmation message
- [ ] T075 [US7] Read `d:\HelioMax\app\(dashboard)\scraper\page.tsx` — add an "Auto-intake" toggle; when enabled, scraper results are automatically POSTed to `/api/automation/intake` instead of just displaying in the UI

**Checkpoint**: Scraper auto-intake creates leads with stage=NEW and tasks for CS users. AI chat command re-assigns lead and notifies recipient. Notifications appear for receiving user.

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Final quality pass across all phases.

- [ ] T076 [P] Read `d:\HelioMax\app\layout.tsx` — update `<title>` metadata and `<meta name="description">` to reference "HelioMax"
- [ ] T077 [P] Read `d:\HelioMax\middleware.ts` — confirm session refresh pattern is applied and `force-dynamic` pages are not accidentally cached
- [ ] T078 [P] Verify `d:\HelioMax\vercel.json` has `"installCommand": "npm install --legacy-peer-deps"` and both cron jobs at correct UTC times
- [ ] T079 Run `npm run build` — fix any TypeScript errors introduced across all phases
- [ ] T080 Run full smoke test: visit every page (Dashboard, CRM, BOQ, Tasks, AI Assistant, Reports, Inventory, Scraper, Calls, Settings, Hub) and confirm no runtime errors in console
- [ ] T081 Run Phase 0 acceptance grep: `grep -ri "loomark\|heliopolis int" app/ components/ lib/ context/ hooks/ types/ package.json` — must return zero results

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — BLOCKS all user stories
- **Phase 3 (US1 — Rebrand)**: Depends on Phase 2 — No dependencies on other stories
- **Phase 4 (US2 — Stability)**: Depends on Phase 2 — No dependencies on other stories
- **Phase 5 (US3 — Pipeline)**: Depends on Phase 2 — No dependencies on US1/US2
- **Phase 6 (US4 — BOQ)**: Depends on Phase 2 — No dependencies on US1/US2/US3
- **Phase 7 (US5 — AI Login)**: Depends on Phase 5 (US3 pipeline) — needs pipeline_stage for task view
- **Phase 8 (US6 — Company Report)**: Depends on Phase 5 (US3 pipeline) — needs pipeline data
- **Phase 9 (US7 — Automation)**: Depends on Phases 5, 6, 7 — needs pipeline + BOQ + AI login
- **Phase 10 (Polish)**: Depends on all phases

### Parallel Opportunities After Phase 2 Completes

```
Wave A (run in parallel after Phase 2):
  Agent 1 → Phase 3: Rebrand (T009–T030)
  Agent 2 → Phase 4: Stability (T031–T035)
  Agent 3 → Phase 5: Pipeline (T036–T044)
  Agent 4 → Phase 6: BOQ Engine (T045–T057)

Wave B (run in parallel after Wave A):
  Agent 5 → Phase 7: AI Login + Tasks + Report (T058–T065) [needs Phase 5 done]
  Agent 6 → Phase 8: Company Report (T066–T070) [needs Phase 5 done]

Wave C (after Wave B):
  Agent 7 → Phase 9: Automation (T071–T075)

Final:
  Phase 10: Polish (T076–T081)
```

### Within Each Story

- Models/migrations before services
- Services before route handlers
- Route handlers before UI components
- UI components before integration testing

---

## Parallel Example: Phase 3 (Rebrand)

```
# All brand-string replacements can run in parallel (different files):
Agent: "Replace Loomark/Heliopolis INT in components/layout/Sidebar.tsx → HelioMax"
Agent: "Replace Loomark/Heliopolis INT in components/layout/Navbar.tsx → HelioMax"
Agent: "Replace Loomark/Heliopolis INT in components/shared/LoadingScreen.tsx → HelioMax"
Agent: "Replace Loomark/Heliopolis INT in context/AuthContext.tsx → HelioMax"
...all T010–T028 can run simultaneously
Then sequentially: T029 (rename LookAgent.tsx → HelioAgent.tsx + update all imports)
Then: T030 (grep verification)
```

---

## Implementation Strategy

### MVP First (Phases 1–5 only)

1. Phase 1: Setup
2. Phase 2: Foundational (migrations + types)
3. Phase 3: Rebrand (quick win, builds confidence)
4. Phase 4: Stability (daily pain relief)
5. Phase 5: Pipeline (foundation metric)
6. **STOP and VALIDATE** — Mido can now answer "how many active leads?" and the team uses the app without refresh pain

### Full Delivery (all phases)

Following MVP, proceed with Phase 6 (BOQ) → Phase 7 (AI Login) → Phase 8 (Company Report) → Phase 9 (Automation).

### Parallel Agent Strategy

With multiple agents (one per phase):
1. All agents complete Phases 1+2 together (shared foundation)
2. Agents A1–A4 work Phases 3–6 simultaneously (different file domains)
3. Agents A5–A6 work Phases 7–8 after Phase 5 passes
4. Agent A7 works Phase 9 after Phases 5+6+7 pass
5. Final polish pass

---

## Notes

- `[P]` tasks = different files, no dependencies — safe to run in parallel within a phase
- `[US#]` label maps each task to its user story for traceability
- Each phase checkpoint must pass before the next phase begins (per constitution Principle VI)
- Apply migrations via Supabase CLI (`supabase db push`) or the Supabase dashboard SQL editor
- For the `notifications` table in Phase 9: add it as `005_notifications.sql` migration if not already present
- The `force-dynamic` directive must remain on all pages that read live data (do not remove)
- All new pages and components must be RTL-first (Arabic labels primary, English in parentheses)
