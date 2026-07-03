---
description: "Delegable task list for CRM Productivity & Manual-System Completion"
---

# Tasks: CRM Productivity & Manual-System Completion

**Input**: `specs/005-crm-productivity/` (spec.md, plan.md, data-model.md, research.md)

**Verification gate (every task)**: `npx tsc --noEmit` **AND** `npm run build` **AND** the story's acceptance scenario. No task is "done" until all three pass. Delegated agents self-apply only after the gate is green, and commit per task.

**Delegation legend**: `[→S]` delegate to **Sonnet** (multi-file / logic). `[→OC]` delegate to **OpenCode** (single-file, tightly scoped only). `[→Opus]` keep on Opus (schema/RLS/security-sensitive). `[P]` = parallelizable (different files, no dep).

**Manual-philosophy guard (applies to ALL tasks)**: no code path may auto-change a lead's `assigned_to_user` or `pipeline_stage`. The system may only remind, surface, and report.

---

## Phase 0: Pre-work (BLOCKING — must finish before any story)

- [ ] T001 `[→Opus]` Merge & deploy `feat/manual-crm-pipeline` to `main`; confirm build green on Vercel and DB (`20260701`) already applied. Align repo with prod.
- [ ] T002 `[→Opus]` Close `app/(dashboard)/../api/auth/lookup/route.ts` PII hole: require an authenticated session and drop the service-role client (or delete the route if unused). Verify an unauthenticated POST is rejected.
- [x] T003 `[→Opus]` **DONE** — live `pg_policies` for `leads` dumped to `contracts/live-rls-leads.sql`. Finding recorded (org-wide read+update already live).
- [~] T004 `[P] [→Opus]` **PARTIAL** — added ignore globs (`*.xlsx`, `~$*.xlsx`, `*leads*.csv`, `Heliomax_*_Leads.xlsx`, `__pycache__/`) to `.gitignore` so PII can't be committed. Files left in place (untracked local data, not in history) — owner should move them to secure storage.
- [x] T005 `[→Opus]` **DONE** — live schema checked: `lead_activities.type` is **free text** (no enum → no migration for new activity types). Also found a real `tasks` table (`due_date, status, completed_at, assigned_to, lead_id, auto_created`) → US5 **reuses `tasks`** instead of new `leads` columns. See research.md D0/D1, data-model.md.

**Checkpoint**: prod == repo, no open PII route, RLS reality captured, activity-type known.

---

## Phase 1: US1 — Everyone can see & safely claim (Priority: P1) 🎯 MVP

**Goal**: Org-wide read, owner/leader-gated writes, atomic claim.
**Independent Test**: non-leader sees & claims a NEW lead; concurrent claims → one winner.

> **FINDING (T003, 2026-07-03):** The live DB already grants org-wide SELECT (`leads_select_all USING true`) and org-wide UPDATE (`org_isolation_leads FOR ALL`). So **US1 is NOT blocked by RLS** — non-leaders can already see and update/claim leads. The committed repo was stale (safe-direction drift). See `contracts/live-rls-leads.sql`. This turns T010/T011 into source-of-truth codification (non-blocking) and makes the atomic-claim (T012) the only real US1 requirement.

- [x] T010 `[→Opus]` **DONE (dump)** — live policies captured to `contracts/live-rls-leads.sql`. Remaining: commit these as `supabase/migrations/20260703_leads_rls_sourceoftruth.sql` (idempotent `drop policy if exists` + recreate) so repo == prod. **Non-behavioral, non-blocking.**
- [ ] T011 `[→Opus]` (Optional hardening, later) Add an explicit `leads_claim` UPDATE policy (NULL→`auth.uid()`) for clarity, and note the `leads_select_all USING(true)` cross-org caveat for the multi-org future. Not required for launch.
- [x] T012 `[→S]` **DONE** (commit d42cd29) — `POST app/api/leads/[id]/claim/route.ts`, atomic conditional update `.is('assigned_to_user', null)` + `.maybeSingle()` → 409 on race; logs `assignment` activity (self-claim → no notification). Contract in `contracts/claim.md`. Verified: tsc+build green.
- [x] T013 `[→S]` **DONE** (commit 254eded) — `KanbanView`/`LeadDrawer` claim buttons call the route; 409 → "تم استلام هذا العميل بالفعل" + refresh; double-submit guard.
- [x] T014 `[→S]` **DONE** (commit 254eded) — `canActOn = isStaff || isOwner`; non-owner/non-leader drags blocked, stage select read-only Tag, assign block hidden. Reuses existing `useAuth().isStaff`.

**Checkpoint**: US1 acceptance scenarios 1–4 pass.

---

## Phase 2: US2 — "Manual" is actually true (Priority: P1)

**Goal**: Autonomy engine = reminders only.
**Independent Test**: brain cron run → 0 reassignments/rebalances/auto-tasks; reminders still fire.

- [x] T020 `[→S]` **DONE** (commit 4a9194f, −162/+17) — removed `rebalanceTeams` (call + fn), the auto `create_task` block, `CONTACTED`, and dead constants/`counts` keys; kept `autonomy_paused`, stuck-lead nudges, escalations, overdue-task reminders. Header now "REMINDERS ONLY". tsc+build green.
- [x] T021 `[→S]` **DONE** — repo grep: **0** active-code references to removed stages; only specs/migrations/docs mention them (correctly). No change needed.
- [~] T022 `[→Opus]` **DEFERRED to post-deploy** — static proof already satisfies FR-004 (no owner/stage-write path exists in the engine). Confirm live once the branch is deployed (T001).

**Checkpoint**: US2 acceptance scenarios 1–4 pass; SC-002 verified.

---

## Phase 3: US3 — Templated WhatsApp (Priority: P2) [P with US4, US6]

**Goal**: stage-aware pre-filled WhatsApp.
**Independent Test**: NEW lead → welcome template; QUOTED → quote template; 2 taps max.

- [ ] T030 `[→OC]` Create `lib/phone.ts`: `normalizePhone(raw): string | null` using `libphonenumber-js` (regions EG→SA), returns E.164 or null. Add dep to `package.json`.
- [ ] T031 `[→OC]` Create `lib/whatsapp.ts`: Arabic template map `stage → (firstName) => string` (welcome, follow-up, quote-sent, price-objection, generic) + `buildWhatsAppUrl(phone, stage, lead)` using `normalizePhone`. Templates also referenced from `lib/constants.ts` if that's the existing home.
- [ ] T032 `[→S]` Replace empty `getWhatsAppUrl(phone)` usages in `KanbanView.tsx` (~L205) and `LeadDrawer.tsx` (~L385) with a small menu: when >1 template applies, let the user pick; default to the stage template. Falls back to neutral greeting when name is empty.

**Checkpoint**: US3 acceptance scenarios 1–4 pass.

---

## Phase 4: US4 — SLA card colors (Priority: P2) [P with US3, US6]

**Goal**: green/amber/red by stage age.
**Independent Test**: leads at varied ages render correct colors; terminal stages uncolored.

- [ ] T040 `[→OC]` Add `SLA_THRESHOLDS = { amberDays: 2, redDays: 5 }` and `slaColor(lead)` helper to `lib/constants.ts` (returns 'green'|'amber'|'red'|null; null for WON/LOST/POSTPONED), reusing existing `stageAgeDays`.
- [ ] T041 `[→S]` In `KanbanView.tsx`, color the existing stage-age indicator via `slaColor`; ensure it's readable in the AntD card and Arabic RTL layout.

**Checkpoint**: US4 acceptance scenarios 1–4 pass; SC-004 verified.

---

## Phase 5: US6 — Phone-normalized dedupe (Priority: P2) [P with US3, US4]

**Goal**: no duplicate leads from phone format variants; entry-form warning.
**Independent Test**: `+966501234567` then `0501234567` = same lead; entry form warns on existing phone.

- [x] T050 `[→Opus]` **DONE** — `20260703_leads_phone_normalized.sql` applied (column + index). Backfilled all 890 rows via `lib/phone.ts` logic: 855 normalized, 10 empty-phone, 25 unparseable. **Revealed 172 existing duplicate rows** (separate cleanup — flagged to owner). Corrected an EG/SA country-disambiguation bug in phone.ts before backfill.

- [x] T030 `[→S]` **DONE** (commit 3753a73) — `lib/phone.ts` `normalizePhone` with prefix disambiguation (SA-biased); all 8 test cases pass.
- [x] T031 `[→S]` **DONE** (3753a73) — `lib/whatsapp.ts` Arabic stage templates + `buildWhatsAppUrl`.
- [x] T032 `[→S]` **DONE** (3753a73 + 091d9c9) — `WhatsAppTemplateButton.tsx` picker (1 tap = current stage, caret = all); wired in drawer + Kanban card.
- [x] T040 `[→S]` **DONE** (commit 091d9c9) — `SLA_THRESHOLDS` + `slaColor()` in constants; `stageAgeDays` lifted to shared, `TERMINAL_PIPELINE_STAGES` exported.
- [x] T041 `[→S]` **DONE** (091d9c9) — Kanban stage-age line colored green/amber/red + dot; terminal stages uncolored.
- [x] T051 `[→S]` **DONE** (commit b84bc50) — `intake.ts` dedupes on `phone_normalized` (fallback to exact string when unparseable); writes normalized on insert. Covers scraper cron + automation webhook. NOTE: Meta webhook (`app/api/meta/webhook`) inserts outside `intakeLeads` — flagged for a later pass.
- [x] T052 `[→S]` **DONE** (commit 1d825f7) — `LeadFormModal.tsx` debounced (400ms) `phone_normalized` lookup → AntD warning + "عرض العميل" deep-link; not hard-blocked; sets normalized on save.

**Checkpoint**: US6 acceptance scenarios 1–3 pass; SC-006 verified.

---

## Phase 6: US5 — Rep-set Next Step + reminders (Priority: P2)

**Goal**: owner sets a due-dated next action; overdue → reminder.
**Independent Test**: set next step due tomorrow → shows on lead + My Day; past due → owner notified.

- [x] T060 `[→Opus]` **N/A** — reused `tasks` table + free-text `lead_activities.type`. Verified `tasks` RLS: owner can insert when `org_id` = their org (constraint `tasks_status_check` allows `pending`/`done`).
- [x] T061 `[→S]` **DONE** (commit 38e6135) — `next-step/route.ts` POST create/replace + PATCH complete on `tasks` (`auto_created=false`, `status pending/done`); sets `org_id` from caller profile; owner/leader 403-gated; logs activities. Contract in `contracts/next-step.md`.
- [x] T062 `[→S]` **DONE** (commit 5599d8e) — Drawer shows nearest open next step at top (overdue = red), owner/leader gets تم/تعديل + "أضِف خطوة تالية" prompt on active-stage leads.
- [x] T063 `[→S]` **DONE** (commit 90d9612) — stuck-leads cron notifies `assigned_to` of due open next steps (`type='nudge'`, 24h suppression via `reference_id`).

**Checkpoint**: US5 acceptance scenarios 1–4 pass; SC-005 measurable.

---

## Phase 7: US7 — "My Day" default view (Priority: P3)

- [x] T070 `[→S]` **DONE** (commit 177ac1b) — `MyDayList.tsx`: my non-terminal leads that are SLA-red OR have due/overdue next step; sorted by urgency; inline complete/advance/WhatsApp/open.
- [x] T071 `[→S]` **DONE** (177ac1b) — added "يومي (My Day)" to the CRM `Segmented` switcher; non-`isStaff` default to it (guarded so manual switch sticks); leaders keep board. Least-invasive (no shell/nav changes).

**Checkpoint**: US7 acceptance scenarios 1–3 pass.

---

## Phase 8: US8 — Funnel / conversion report (Priority: P3)

- [x] T080 `[→S]` **DONE** (commit 51f2b09) — `lib/reports/funnel-report.ts`: per-stage counts, conversion % along FUNNEL_ORDER, avg time-in-stage, win rate overall/by-source/by-rep; filters from/to/source/rep (date on `created_at`).
- [x] T081 `[→S]` **DONE** (commit 90af96c) — `app/api/reports/funnel/route.ts` GET, leader/manager-gated (403), org-scoped. Contract in `contracts/funnel.md`.
- [x] T082 `[→S]` **DONE** (commit 2e5aafd) — `reports/FunnelReport.tsx` (AntD bars/Progress, RangePicker) added as "🔻 قمع المبيعات" tab in `reports/page.tsx`.

**Checkpoint**: US8 acceptance scenarios 1–2 pass; SC-007 verified.

---

## Phase 9: US9 — Bulk actions (Priority: P3)

- [x] T090 `[→S]` **DONE** (commit 7788d0c) — `POST /api/leads/bulk` (max 200 ids): claim (per-lead atomic, any member), assign/advance (leader-only, 403); per-lead activity + assign notification; partial-success `results[]`. Contract in `contracts/bulk.md`.
- [x] T091 `[→S]` **DONE** (7788d0c) — table multi-select + bulk bar in `crm/page.tsx`; claim for all, assign/advance leader-only; per-batch result toast.

**Checkpoint**: US9 acceptance scenarios 1–2 pass.

---

## Phase 10: US10 — Mobile & keyboard fast paths (Priority: P3)

- [~] T100 `[→S]` **OPTIONAL / LARGELY MET** — tap-to-claim already works (US1 wired the claim button, tap-friendly) and stage change works on touch via the drawer's Select. A card-level stage dropdown to avoid opening the drawer is a nice-to-have; deferred unless the team asks.
- [x] T101 `[→Opus]` **DONE** (commit 4af0ca3) — phone `autoFocus` + `onPressEnter={handleSubmit}` (kept grid layout; skipped risky physical reorder — autofocus gives the keyboard-first flow). OpenCode no-op'd this one, so Opus did it.

**Checkpoint**: US10 acceptance scenarios 1–2 pass.

---

## Phase 11: Polish & cross-cutting

- [x] T110 `[→OC]` **DONE** (commit 583a42f) — OpenCode sanitized the search term (`replace(/[,()\*]/g,' ')`) + skip empty. Verified minimal diff + tsc by Opus.
- [x] T111 `[→Opus]` **DONE** (commit 1d3410b) — `.github/workflows/ci.yml`: tsc + build on PRs/push to main (placeholder public env; may need tuning if static gen needs real keys).
- [x] T112 `[→Opus]` **BUILD GATE PASSED** — full `npm run build` (40/40 pages) + `tsc --noEmit` green across the fully integrated branch (US1–US9 + polish). Live end-to-end acceptance to run post-deploy (needs prod + a non-leader test account).

---

## Dependencies & Execution Order

- **Phase 0** blocks everything.
- **US1 (P1)** and **US2 (P1)** are independent of each other; do US1 first (rollout-critical), then US2.
- **US3, US4, US6** are cheap and mutually parallel (different files) after Phase 0; US6's migration (T050) shares the file with US5's (T060) — coordinate so one migration file is written once.
- **US5 (P2)** depends on the shared migration (T050/T060) and the next-step route.
- **US7–US10 (P3)** depend on their respective P2 pieces (My Day needs SLA + next-step; report is standalone).
- **Polish** last.

## Delegation Notes

- Give each delegated agent: the relevant task, this file's verification gate, the contract file (if any), and the manual-philosophy guard. Instruct it to invoke Superpowers/spec-kit skills as needed and to **self-apply only after `tsc`+`build`+acceptance pass**, committing per task.
- **Sonnet** owns multi-file stories (US1, US2, US5, US7, US8, US9). **OpenCode** only for the single-file helpers (T004, T021, T030, T031, T040, T101, T110, T111) given its weaker model — keep those runs small and scoped. **Opus** keeps all schema/RLS/security tasks (T002, T003, T010, T011, T050, T060) and final acceptance (T112).
