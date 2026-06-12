# Tasks: Helio Command Center & Platform Hardening

**Input**: Design documents from `specs/004-helio-command-center/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Not requested — no automated test framework in this project (constitution VIII). Verification = `npm run build` gate + quickstart.md scenarios per story.

**Organization**: Phases follow the approved execution order **US1 → US3 → US2 → US4 → US5** (US3/reports is a small rider on US1's cron infrastructure; US2/Helio builds on both). Each story phase is independently testable via its quickstart.md section.

**⚠ Execution rules for the implementer**:
- Work on branch `004-helio-command-center`. Commit after each phase checkpoint with a `feat(004):`/`fix(004):` prefix.
- `npm install` always with `--legacy-peer-deps`.
- Migrations: show full SQL before applying; apply via Supabase MCP or `supabase db push`. NEVER destructive (constitution II).
- After every phase: `npm run build` green + smoke test (all dashboard pages load) before starting the next phase.
- Never touch `components/agent/*Step*` or the login page visuals (FR-032).

---

## Phase 1: Setup

**Purpose**: Shared infrastructure used by every subsequent phase

- [x] T001 Create `lib/cron/guard.ts` with `verifyCronAuth`, `cairoNow`, `isCairoWindow`, `withCronAlert` exactly per contracts/cron-endpoints.md (Intl-based Africa/Cairo, fail-closed Bearer check)
- [x] T002 [P] Create `lib/notifications/alert.ts` exporting `sendOpsAlert(message: string)` — wraps existing `sendTelegramMessage` from `lib/notifications/telegram.ts`, prefixes `🚨 HelioMax Ops:`, falls back to `console.error` when Telegram unconfigured; never throws
- [x] T003 [P] Add `WEBHOOK_SECRET` to `.env.local.example` with comment; document `CRON_SECRET` + `WEBHOOK_SECRET` as required Vercel env vars in `README.md` deployment section

**Checkpoint**: `npm run build` green (existing flags still on — flipped in Phase 3)

---

## Phase 2: Foundational

**Purpose**: Database changes that user stories depend on (additive only)

- [x] T004 Create migration `supabase/migrations/20260612_idempotency_hardening.sql` per data-model.md Migration 1: `notifications.type` column + index, `tasks.auto_created` column + index, new `agent_requests` table with RLS enabled (service-role only)
- [x] T005 Apply migration 20260612_idempotency_hardening.sql to the Supabase project (show SQL first; verify with a SELECT on the new columns) — applied via Supabase MCP; note: live notifications table is the multi-tenant shape (see data-model.md "Live-schema ground truth"), index is on `reference_id` not `lead_id`
- [x] T006 Update `lib/notifications/in-app.ts` `createNotification` to persist `meta.type` into the new `notifications.type` column (keep broadcast payload unchanged)

**Checkpoint**: migration applied; notifications created with type; build green

---

## Phase 3: User Story 1 — Reliable & Secure Platform (P1) 🎯 MVP

**Goal**: Scheduled jobs actually run; data endpoints protected; failures alert Mido; build catches errors

**Independent Test**: quickstart.md "Phase A" — curls for GET crons (no 405), fail-closed auth, 401s on the three endpoints, webhook secret swap, build-failure probe, rate-limit probe

- [x] T007 [US1] Refactor `app/api/reports/stuck-leads/cron/route.ts`: extract shared `handle()`; export `GET` and `POST`; wrap in `withCronAlert('stuck-leads')`; replace `ilike('%واقف%')` dedup with `type='stuck_lead' AND reference_id=<lead.id>` lookup (live notifications schema has reference_id, NOT lead_id — see data-model.md); staleness from `COALESCE(last_contact_date, updated_at)`; create notifications via `createNotification(..., { type: 'stuck_lead' })`; add Cairo window guard (08:00, Sat–Thu) per contracts/cron-endpoints.md
- [x] T008 [P] [US1] Refactor `app/api/reports/personal/cron/route.ts`: shared `handle()`, GET+POST, `withCronAlert('personal-report')`, Cairo guard (15:50, Sat–Thu), exactly-once via existing `type='personal_report'` notification check for today
- [x] T009 [P] [US1] Refactor `app/api/reports/company/cron/route.ts`: shared `handle()`, GET+POST, `withCronAlert('company-report')`, Cairo guard (15:50, Sat–Thu), exactly-once via `type='company_report_sent'` marker notification inserted on success
- [x] T010 [P] [US1] Fix `app/api/files/[id]/signed-url/route.ts`: require `supabase.auth.getUser()`; fetch the file row with the caller's RLS-scoped client first (404 if not visible) before generating the signed URL with service role
- [x] T011 [P] [US1] Fix `app/api/boq/pdf/route.ts`: require authenticated user; load the BOQ via caller's RLS-scoped client (404/403 when not accessible) before rendering
- [x] T012 [P] [US1] Fix `app/api/boq/[id]/rooms/route.ts`: all methods verify BOQ access via caller's RLS-scoped client before reading/writing rooms
- [x] T013 [P] [US1] Clean `app/api/meta/webhook/route.ts`: delete every console.log containing tokens, hex dumps, raw bodies, or signature headers (lines ~19–25, 40–42); keep only non-sensitive logs (mode, match boolean, lead counts)
- [x] T014 [P] [US1] Fix `app/api/automation/intake/route.ts` auth: webhook path accepts ONLY `Bearer ${process.env.WEBHOOK_SECRET}` (fail-closed when unset); session auth path unchanged; service-role key never compared
- [x] T015 [P] [US1] Update `lib/tasks/auto-create.ts`: insert with `auto_created: true`; replace `ilike('%اتصل%')` idempotency with `lead_id + auto_created=true + status != 'cancelled'` lookup
- [x] T016 [US1] Add rate limiting to `app/api/agent/chat/route.ts`: insert `agent_requests` row per call; count last-5-min rows for caller; >30 (members) / >120 (admin role) ⇒ 200 with friendly Arabic refusal content; opportunistic delete of rows older than 1h
- [x] T017 [US1] Repo cleanup: `git rm` `build.log`, `build_log.txt`, `build_output.txt`, `build_stage2.log`, `supabase/migrations/003_boq_rooms.sql`; add `build*.log`, `build*.txt`, `*.zip` patterns to `.gitignore`; remove the 003 migration reference warning from AGENTS.md key constraints (it no longer exists)
- [x] T018 [US1] Flip `next.config.mjs` to `ignoreBuildErrors: false` and `ignoreDuringBuilds: false`; run `npm run build`; fix EVERY surfaced TypeScript/ESLint error across the codebase (expect the bulk of effort here; do not weaken types to `any` — fix properly; `eslint-disable` only with a justification comment)
- [x] T019 [US1] Update `vercel.json` cron schedules per contracts/cron-endpoints.md: personal `50 12,13 * * *`, company `50 12,13 * * *`, stuck-leads `0 5,6 * * *`

**Checkpoint**: ALL quickstart Phase A probes pass; build green WITH checks on — US1 deliverable complete

---

## Phase 4: User Story 3 — Reports at 3:50 PM Cairo, Sat–Thu (P2)

**Goal**: Reports delivered exactly once, 15:50 Cairo, Sat–Thu, DST-proof

**Independent Test**: quickstart.md "Phase D" — in-window/out-of-window/duplicate-call probes; Vercel cron log check post-deploy

- [x] T020 [US3] Verify the Cairo guards from T007–T009 against contracts/cron-endpoints.md windows table (15:50 reports, 08:00 stuck-leads, Sat–Thu only); fix any drift; confirm Friday produces `skipped: 'outside_window'`
- [x] T021 [US3] Local probes done (Friday → outside_window confirmed on GET, fail-closed auth confirmed). REMAINING: post-deploy check that both UTC firings appear in Vercel cron logs and exactly one delivers (needs CRON_SECRET set in Vercel first)

**Checkpoint**: US3 deliverable complete (mostly verification — implementation rode on US1)

---

## Phase 5: User Story 2 — Helio as Autonomous Team Controller (P1)

**Goal**: Helio answers with live data, executes commands, acts autonomously twice daily, logs everything, Mido can review/undo/pause

**Independent Test**: quickstart.md "Phase B" — chat scenarios (admin + member), seeded autonomy run, suppression re-run, control page undo/pause

- [x] T022 [US2] Create migration `supabase/migrations/20260612_agent_command_center.sql` per data-model.md Migration 2: `agent_actions` + `agent_settings` tables, indexes, RLS (admin/team-lead SELECT; admin UPDATE on settings), singleton seed row
- [ ] T023 [US2] Apply migration 20260612_agent_command_center.sql (show SQL first; verify tables exist)
- [x] T024 [US2] Create `lib/agent/tools.ts`: Anthropic tool definitions + executors for all 10 tools exactly per contracts/helio-tools.md (input schemas, scope filtering by role, RLS-scoped execution, name disambiguation, agent_actions recording with prior-state payload, compact ≤2KB tool results)
- [ ] T025 [US2] Rewrite `app/api/agent/chat/route.ts` per contracts/helio-tools.md: keep regex fast-paths + register-lead flow + rate limiting (T016); add tool-use loop (`claude-sonnet-4-6`, max_tokens 2048, max 6 iterations, role-filtered tools, system = persona + loadSystemApprovalContext() + role context); Haiku fallback then FALLBACKS on errors; response gains optional `actions` array
- [ ] T026 [US2] Create `lib/agent/autonomy.ts` per research D4: detection queries (missing first-call task via `auto_created`, overdue tasks, stuck per `COALESCE(last_contact_date, updated_at)` vs `agent_settings.stuck_threshold_days`, 7+ day escalation, workload imbalance max−min>2), corrective actions with service role, 24h suppression via `agent_actions` lookup, every action recorded with templated Arabic reasoning
- [ ] T027 [US2] Create `app/api/agent/brain/cron/route.ts`: GET+POST, CRON_SECRET, Cairo windows 10:00 & 14:00 Sat–Thu, `withCronAlert('agent-brain')`; honors `agent_settings.autonomy_paused`; runs `lib/agent/autonomy.ts`; sends Mido digest (notification `type='agent_digest'` + Telegram) listing each action or none/paused message
- [ ] T028 [US2] Create `app/api/agent/actions/[id]/undo/route.ts` per contracts/helio-tools.md: admin/team-lead session required; state-match validation (409 with reason on drift or double-undo); reverts assign_lead via payload snapshot / cancels created tasks; sets `undone_at`, `undone_by`
- [ ] T029 [US2] Create `app/(dashboard)/helio/page.tsx` (RTL-first, antd): action timeline from `agent_actions` (time, type icon, target, reasoning, origin badge, Undo button where reversible and not undone), autonomy pause/resume toggle + stuck-threshold input writing `agent_settings` (admin only), access limited to admin/team-lead (others redirected); add nav entry in the dashboard sidebar
- [ ] T030 [US2] Add brain cron to `vercel.json`: `{ "path": "/api/agent/brain/cron", "schedule": "0 7,8,11,12 * * *" }`

**Checkpoint**: quickstart Phase B scenarios pass end-to-end — US2 deliverable complete

---

## Phase 6: User Story 4 — Weekly Auto-Scraping & Scheduled Outreach (P2)

**Goal**: Queued targets scraped every Saturday, leads distributed round-robin with week-spread first-call tasks, Mido summarized

**Independent Test**: quickstart.md "Phase C" — queue via chat, mock-mode cron run, dedup re-run

- [ ] T031 [US4] Create migration `supabase/migrations/20260612_scrape_targets.sql` per data-model.md Migration 3 (table, status check, indexes, RLS)
- [ ] T032 [US4] Apply migration 20260612_scrape_targets.sql (show SQL first)
- [ ] T033 [P] [US4] Extract `lib/leads/intake.ts` from `app/api/automation/intake/route.ts` per contracts/scrape-pipeline.md: `intakeLeads(businesses, opts?)` with dueDates rotation, per-rep counts, `auto_created: true` tasks, `NoCsMembersError`; route becomes thin wrapper with identical external contract
- [ ] T034 [P] [US4] Extract `lib/scraper/run.ts` from `app/api/scraper/route.ts`: `runScrape(target)` with existing Apify actor + mock fallback; route becomes thin authenticated wrapper (manual scraper page unchanged)
- [ ] T035 [US4] Create `app/api/scraper/cron/route.ts` per contracts/scrape-pipeline.md: GET+POST, CRON_SECRET, Sat 08:00 Cairo guard, `withCronAlert('weekly-scrape')`; processes ≤10 queued targets with status transitions; `weekSpread()` due dates Sat–Thu; admin summary notification `type='scrape_summary'` + Telegram with created/dups/errors/per-rep
- [ ] T036 [US4] Wire `queue_scrape_target` Helio tool (defined in T024) to insert into `scrape_targets` and record the action; verify chat round-trip
- [ ] T037 [US4] Update `app/(dashboard)/scraper/page.tsx`: add "queue for Saturday" form + `scrape_targets` status table (query, region, status, last run, results) alongside the existing immediate-scrape UI
- [ ] T038 [US4] Add scraper cron to `vercel.json`: `{ "path": "/api/scraper/cron", "schedule": "0 5,6 * * 6" }`

**Checkpoint**: quickstart Phase C scenarios pass in mock mode — US4 deliverable complete

---

## Phase 7: User Story 5 — Refreshed, Consistent UI (P3)

**Goal**: Unified theme, skeletons/empty states, error containment, realtime notifications, lean initial bundle — AI login untouched

**Independent Test**: quickstart.md "Phase E" — visual pass AR/EN, error-boundary probe, two-session realtime test, bundle comparison, login regression

- [ ] T039 [US5] Create `components/theme/heliomaxTheme.ts`: antd v5 theme token object (brand palette, borderRadius, fontFamily incl. Arabic font, component density for Table/Card/Button/Input); apply via `ConfigProvider` in the dashboard layout keeping `direction` per language
- [ ] T040 [P] [US5] Create `components/ui/EmptyState.tsx` + `components/ui/PageHeader.tsx` (RTL-aware, themed); apply skeleton loading (antd Skeleton) + EmptyState + PageHeader to `app/(dashboard)/dashboard/page.tsx`, `app/(dashboard)/crm/page.tsx`, `app/(dashboard)/reports/page.tsx`, and the BOQ list page
- [ ] T041 [P] [US5] Add `app/(dashboard)/error.tsx` and `app/error.tsx`: friendly Arabic/English error screens with retry button (calls `reset()`); log error to console
- [ ] T042 [P] [US5] Switch the NotificationBell component (in `components/layout/`) from 30s polling to Supabase Realtime subscription on channel `user:{id}` event `new_notification` (matching `createNotification`'s broadcast); keep a 5-min polling fallback when channel errors; unsubscribe on unmount
- [ ] T043 [P] [US5] Dynamic imports: `xlsx` in `app/(dashboard)/crm/ImportModal.tsx` via lazy `import()` at use-time; `@react-pdf/renderer` usages in BOQ components via `next/dynamic`/lazy import (LeadDrawer's PDFDownloadButton pattern already correct — replicate it); memoize CRM table column definitions with `useMemo`
- [ ] T044 [US5] Record `npm run build` first-load JS sizes before/after T043 in the phase commit message; verify CRM + BOQ pages did not grow and xlsx/react-pdf live in lazy chunks

**Checkpoint**: quickstart Phase E passes incl. AI-login regression — US5 deliverable complete

---

## Phase 8: Polish & Cross-Cutting

- [ ] T045 Run full quickstart.md verification top to bottom; fix anything that regressed; confirm constitution VII smoke (every dashboard page loads, AR + EN)
- [ ] T046 Set Vercel env vars `CRON_SECRET`, `WEBHOOK_SECRET` (generate strong values); rotate `META_WEBHOOK_VERIFY_TOKEN` in Meta dashboard + Vercel; redeploy; verify webhook re-verification succeeds
- [ ] T047 Update `README.md` ops section: cron schedule table (Cairo times), Helio tools list, scrape queue usage, undo/pause instructions for Mido
- [ ] T048 Merge `004-helio-command-center` → `main` after final build + smoke; confirm next-day Vercel cron logs show successful in-window runs (SC-001 7-day watch begins)

---

## Dependencies & Execution Order

```text
Phase 1 (Setup) ──► Phase 2 (Foundational) ──► Phase 3 (US1) ──► Phase 4 (US3)
                                                      │
                                                      ▼
                                               Phase 5 (US2) ──► Phase 6 (US4) ──► Phase 7 (US5) ──► Phase 8
```

- US3 depends on US1 (cron guards built there). US2 depends on US1 (rate limit, alert lib, idempotency columns). US4 depends on US2 (queue tool) + US1 (intake auth). US5 is independent of US2–US4 but runs last (lowest priority, highest visual risk).
- Within phases, [P] tasks touch disjoint files and may run in parallel.

## Parallel Examples

- Phase 3: T008–T015 are all [P] after T007 establishes the cron refactor pattern (T007 first as the reference implementation).
- Phase 6: T033 and T034 (two independent extractions) in parallel, then T035.
- Phase 7: T040–T043 in parallel after T039 lands the theme.

## Implementation Strategy

**MVP = Phase 1 + 2 + 3 (US1)**: the platform becomes secure and reliable — deployable on its own.
Each subsequent phase is an independently deliverable increment gated by its quickstart section. Stop-and-verify at every checkpoint; never start a phase with a red build.

## Task Summary

| Story | Tasks | Count |
|---|---|---|
| Setup | T001–T003 | 3 |
| Foundational | T004–T006 | 3 |
| US1 (hardening) | T007–T019 | 13 |
| US3 (reports) | T020–T021 | 2 |
| US2 (Helio) | T022–T030 | 9 |
| US4 (scraping) | T031–T038 | 8 |
| US5 (UI) | T039–T044 | 6 |
| Polish | T045–T048 | 4 |
| **Total** | | **48** |
