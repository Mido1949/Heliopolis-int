# Feature Specification: CRM Productivity & Manual-System Completion

**Feature Branch**: `005-crm-productivity`

**Created**: 2026-07-03

**Status**: Draft

**Input**: Owner decision (Mido) after a full-application advisory review. Goal: keep all teams working 100% inside one app, keep the CRM **manual** (Zoho-like clarity), and add the primitives + quick wins that make it feel like a real CRM instead of a Kanban board — without re-introducing automation that moves leads on people's behalf.

## Guiding Principles

- **One app, all teams.** Every team (Call Center, Telesales, Sales Engineers, CS, Tech, Team Leaders, Manager) works inside this application; the lead and its whole history never leave the system.
- **Manual is a decision, not a bug.** The system may *remind, surface, and report* — it must never *move a lead, change a stage, or reassign an owner on its own*. Every state change is a human action.
- **Visibility is broad; authority is scoped.** Everyone can see the whole pipeline (needed to claim and to "complete each other"). Only the assigned owner or a Team Leader/Manager can act on a lead.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Everyone can see and safely claim unassigned leads (Priority: P1)

Any team member can open the CRM, see the full pipeline including the `NEW` column of **unassigned** leads, and claim a lead. Two people cannot end up owning the same lead.

**Why this priority**: The collaborative manual model is dead on arrival if a non-leader cannot even see unassigned leads to claim them. Current committed RLS restricts non-leaders to leads already assigned to them, and `claim()` performs an unguarded update, so a race lets two reps claim the same lead — the exact trust-erosion that killed round-robin.

**Independent Test**: Log in as a **non-leader** (e.g. Telesales). Confirm the `NEW` column shows unassigned leads. Claim one → it becomes owned by that user and shows in "my leads." Simulate two simultaneous claims on the same lead → exactly one succeeds, the other sees "already taken."

**Acceptance Scenarios**:

1. **Given** a non-leader user and unassigned `NEW` leads exist, **When** they open the CRM, **Then** they can see those unassigned leads.
2. **Given** an unassigned lead, **When** two users claim it at the same moment, **Then** exactly one becomes the owner and the other is told it was already taken.
3. **Given** a lead owned by user A, **When** non-owner user B (not a leader) tries to change its stage or owner directly, **Then** the action is blocked or routed through an explicit claim/assign, not a silent edit.
4. **Given** a Team Leader or Manager, **When** they act on any lead in their org, **Then** the action succeeds (leaders retain override authority).

---

### User Story 2 - "Manual" is actually true (Priority: P1)

The nightly autonomy engine no longer moves or reassigns leads or auto-creates tasks. It keeps only the non-moving behaviors: reminders/nudges and escalation notifications. All references to removed pipeline stages are gone.

**Why this priority**: Today the system is accidentally *hybrid* — the `/api/agent/brain/cron` job runs daily at 08:00 with `autonomy_paused` defaulting to `false`. It rebalances already-claimed leads between teammates and auto-creates first-call tasks, and it still queries the deleted `CONTACTED` stage. A bot silently reassigning leads overnight directly contradicts the manual philosophy and confuses the team.

**Independent Test**: With the change deployed, run the brain cron manually. Confirm: no lead's `assigned_to_user` changes, no `rebalance` action is recorded, and no autonomous task is created. Confirm reminder/nudge notifications for stale/overdue leads still fire. Confirm no query references `CONTACTED`.

**Acceptance Scenarios**:

1. **Given** the brain cron runs, **When** it evaluates leads, **Then** it performs **zero** reassignments and **zero** rebalances.
2. **Given** a stale/overdue lead, **When** the cron runs, **Then** the owner still receives a reminder notification.
3. **Given** the codebase, **When** searched, **Then** no active query filters on the `CONTACTED` stage (or any other removed stage).
4. **Given** an admin wants to fully silence even reminders, **When** they set the autonomy pause flag, **Then** the cron produces no actions at all.

---

### User Story 3 - Stage-aware templated WhatsApp (Priority: P2)

From a lead card or the lead drawer, a user opens WhatsApp with a pre-filled message chosen for the lead's current stage (welcome, follow-up, quote-sent, price-objection, etc.), in Arabic, with the lead's name merged in.

**Why this priority**: Meta→WhatsApp is the primary channel and reps retype the same messages all day. Today `getWhatsAppUrl(phone)` opens an empty chat. Highest impact-to-effort win. Still fully manual — the human chooses to send.

**Independent Test**: Open a `NEW` lead → WhatsApp button opens `wa.me/<phone>?text=<welcome template with name>`. Open a `QUOTED` lead → the quote-sent template is offered. Templates are editable in one place.

**Acceptance Scenarios**:

1. **Given** a lead in `NEW`/`WELCOME_SENT`, **When** the user taps WhatsApp, **Then** the welcome template (with the lead's first name) is pre-filled.
2. **Given** a lead in `QUOTED`/`NEGOTIATION`, **When** the user taps WhatsApp, **Then** a quote/objection-appropriate template is offered.
3. **Given** more than one template applies, **When** the user taps WhatsApp, **Then** they can pick which template to use before it opens.
4. **Given** a phone in local (`05…`) or international (`+9665…`) format, **When** the link is built, **Then** it produces a valid `wa.me` number.

---

### User Story 4 - Self-triaging board: SLA colors (Priority: P2)

Each lead card shows its stage age with a color: green (fresh), amber (aging), red (overdue) based on how long it has sat in its current stage.

**Why this priority**: The board becomes self-triaging with zero new data — `stageAgeDays()` already computes the number; it's currently rendered as grey text. Cheap, high daily impact.

**Independent Test**: Place leads at different stage ages → cards render green/amber/red per thresholds. Thresholds configurable in one constant.

**Acceptance Scenarios**:

1. **Given** a lead in its stage < 2 days, **When** shown on the board, **Then** its age indicator is green.
2. **Given** a lead aged between the amber and red thresholds, **When** shown, **Then** it is amber.
3. **Given** a lead older than the red threshold, **When** shown, **Then** it is red.
4. **Given** terminal stages (`WON`/`LOST`/`POSTPONED`), **When** shown, **Then** no SLA urgency color is applied.

---

### User Story 5 - Rep-set "Next Step" task + due-date reminders (Priority: P2)

From the lead drawer, the owner sets a next step: a short description + a due date/time. The lead surfaces this next action. When a next step is due/overdue, the (already existing) reminder cron notifies the owner.

**Why this priority**: This is the single biggest "feels like Zoho" lever and the largest gap — today only the *bot* created tasks and the drawer has no human "add follow-up." Converts the board into a real pipeline.

**Independent Test**: Set a next step "call to confirm site visit" due tomorrow 10:00 on a lead. It shows on the lead and in "my day"/tasks. Advance the clock past due → owner gets a reminder notification.

**Acceptance Scenarios**:

1. **Given** an open lead, **When** the owner sets a next step with a due date, **Then** it is saved and visible on the lead.
2. **Given** a lead with a due/overdue next step, **When** the reminder cron runs, **Then** the owner receives a reminder.
3. **Given** a completed next step, **When** the owner marks it done, **Then** it stops generating reminders and is logged as an activity.
4. **Given** a lead with no next step, **When** viewed by its owner in an active stage, **Then** the UI gently prompts to add one.

---

### User Story 6 - No duplicate leads: phone normalization + dedupe (Priority: P2)

Incoming leads (scraper, Meta, manual entry) are matched on a **normalized** phone number so `+9665…` and `05…` don't create duplicates. The manual entry form warns the moment a matching phone already exists.

**Why this priority**: Intake matches the exact phone string today; the scraper now pulls 50 places/search for Riyadh, so format variants will flood the `NEW` column with duplicates.

**Independent Test**: Insert a lead as `+966501234567`, then intake `0501234567` → treated as the same lead, no duplicate. Type an existing phone into the entry form → a "this lead already exists" warning with a link appears before saving.

**Acceptance Scenarios**:

1. **Given** an existing lead with a phone, **When** a new lead with the same number in a different format arrives, **Then** no duplicate is created.
2. **Given** the manual entry form, **When** the user enters a phone that already exists, **Then** they see a duplicate warning (with a link to the existing lead) before saving.
3. **Given** a malformed/empty phone, **When** normalization runs, **Then** it degrades gracefully (no crash; treated as non-matching).

---

### User Story 7 - "My Day" default landing view (Priority: P3)

Non-leader users land on a focused personal view: their leads needing action today (SLA-red + next steps due), instead of the full 10-column board.

**Why this priority**: A 10-column wall doesn't drive daily behavior; a personal action list does. Builds on the existing `my-leads` page.

**Independent Test**: Log in as a rep with some red/overdue leads and due tasks → the default view lists exactly those, actionable inline (open, WhatsApp, advance stage).

**Acceptance Scenarios**:

1. **Given** a non-leader with overdue leads/tasks, **When** they log in, **Then** the default CRM view is their prioritized personal action list.
2. **Given** a leader/manager, **When** they log in, **Then** they still get the full board/oversight view by default.
3. **Given** an item in My Day, **When** the user acts on it (WhatsApp/advance/complete), **Then** it updates and leaves the list when no longer due.

---

### User Story 8 - Funnel / conversion report (Priority: P3)

A report shows stage-to-stage conversion, average time-in-stage (velocity), and win rate by source and by rep, computed from `stage_timestamps`.

**Why this priority**: The data already exists on 890 leads; only the query/report is missing. Gives the Manager real decisions instead of activity counts.

**Independent Test**: Open the funnel report → see counts entering/leaving each stage, conversion %, avg days in stage, and win rate split by source and rep for a date range.

**Acceptance Scenarios**:

1. **Given** historical leads with `stage_timestamps`, **When** the report is opened, **Then** it shows per-stage conversion and average time-in-stage.
2. **Given** a date range and a source/rep filter, **When** applied, **Then** the metrics recompute for that slice.

---

### User Story 9 - Bulk actions for backlog triage (Priority: P3)

A Team Leader can multi-select leads (e.g. in the `NEW` backlog) and claim/assign/advance them in one action.

**Why this priority**: Leaders triage backlogs one-by-one today; bulk assign clears a morning backlog in seconds.

**Independent Test**: Select 10 `NEW` leads → assign all to a rep in one action → all update and are logged.

**Acceptance Scenarios**:

1. **Given** multiple selected leads, **When** a leader bulk-assigns them, **Then** all are assigned and each records an assignment activity + notification.
2. **Given** a non-leader, **When** they attempt a bulk assign of others' leads, **Then** it is not permitted.

---

### User Story 10 - Mobile & keyboard fast paths (Priority: P3)

On touch devices, a lead can be claimed with a tap and its stage changed via a dropdown (no horizontal drag). The manual entry form supports phone-first, autofocus, enter-to-save for live call-center entry.

**Why this priority**: Call Center and field Sales are phone-first; 10-column horizontal drag is unusable on mobile, and live entry during calls needs to be keyboard-fast.

**Independent Test**: On a narrow viewport, claim via tap and change stage via dropdown without drag. In the entry form, type phone → name → Enter saves.

**Acceptance Scenarios**:

1. **Given** a touch/narrow viewport, **When** the user claims and advances a lead, **Then** they can do so without drag-and-drop.
2. **Given** the entry form, **When** the user presses Enter after the required fields, **Then** the lead saves.

---

### Edge Cases

- A rep claims a lead at the same instant a leader bulk-assigns it → one authoritative outcome, the other is informed.
- A lead is claimed, then the owner is deactivated → leader can reassign; lead never becomes invisible/orphaned.
- WhatsApp template references a name that is empty/null → falls back to a neutral greeting.
- Phone normalization for non-KSA/EG numbers → must not corrupt or wrongly merge distinct leads.
- Funnel report over a period where a stage was renamed by the recent migration → old codes already remapped; report should only see the current 10 stages.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: All authenticated org members MUST be able to view every lead in their org, including unassigned `NEW` leads (broad read).
- **FR-002**: Only the assigned owner or a Team Leader/Manager MUST be able to change a lead's stage or owner (scoped write); non-owners act via explicit claim/assign.
- **FR-003**: Claiming an unassigned lead MUST be atomic — succeed only if still unassigned; concurrent claimants MUST get a clear "already taken" result.
- **FR-004**: The autonomy engine MUST NOT reassign, rebalance, or change any lead's owner or stage, and MUST NOT auto-create tasks.
- **FR-005**: The autonomy engine MAY still send reminder/escalation notifications for stale or overdue leads/next-steps.
- **FR-006**: No active query MUST reference removed pipeline stages (`CONTACTED`, `ASSIGNED_TECH`, `FOLLOW_UP`, `LOST_PRICE`, `GHOSTED`).
- **FR-007**: The WhatsApp action MUST pre-fill a stage-appropriate Arabic template with the lead's name; templates MUST live in one editable location.
- **FR-008**: Lead cards MUST show a stage-age SLA color (green/amber/red) driven by configurable thresholds; terminal stages show no urgency color.
- **FR-009**: An owner MUST be able to set/edit/complete a "next step" (description + due datetime) on a lead from the drawer.
- **FR-010**: Due/overdue next steps MUST generate a reminder to the owner via the existing reminder cron.
- **FR-011**: Lead intake and manual entry MUST match on a normalized phone number to prevent duplicates; the entry form MUST warn on an existing match before save.
- **FR-012**: Non-leader users MUST land on a personal "My Day" action list by default; leaders/managers keep the full board.
- **FR-013**: A funnel report MUST present per-stage conversion, average time-in-stage, and win rate by source and by rep, filterable by date range.
- **FR-014**: Team Leaders MUST be able to bulk claim/assign/advance multiple selected leads in one action, with per-lead activity + notification.
- **FR-015**: Core lead actions (claim, stage change) MUST be usable on touch without drag-and-drop; the entry form MUST support keyboard-fast submission.
- **FR-016**: Every stage change, claim, assignment, and completed next step MUST be recorded in the lead activity log (auditability of the manual system).

### Key Entities

- **Lead**: existing `leads` row. Adds/uses: `next_step` (text), `next_step_due` (timestamptz), `next_step_done` (bool/timestamp), normalized-phone match key. Continues to use `pipeline_stage`, `stage_timestamps`, `assigned_to_user`, `assigned_to_team`, `assigned_by`, `lost_reason`.
- **Lead Activity**: existing `lead_activities` — extended usage for next-step set/complete.
- **Task / Next Step**: the rep-set next action (may reuse the existing `tasks` table or `leads.next_step_*` columns — decided in plan).
- **WhatsApp Template**: static, per-stage message templates (constant, not a table for v1).
- **Autonomy Settings**: existing flags (`autonomy_paused`, thresholds) — semantics narrowed to reminders-only.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A non-leader can see and claim an unassigned `NEW` lead within the first session, with zero double-claims observed under concurrent attempts.
- **SC-002**: After deploy, a manual run of the brain cron performs 0 reassignments, 0 rebalances, 0 auto-created tasks, while still emitting reminders.
- **SC-003**: Sending a stage-appropriate WhatsApp message takes ≤ 2 taps from a lead and requires no retyping.
- **SC-004**: 100% of active-stage leads on the board display an SLA color; overdue leads are visually distinguishable at a glance.
- **SC-005**: ≥ 90% of active leads owned by a rep have a next step set (once adopted), and overdue next steps reliably trigger reminders.
- **SC-006**: Duplicate lead creation from phone-format variants drops to ~0 in new intake.
- **SC-007**: The Manager can read stage conversion and win-rate-by-source from the funnel report without exporting data elsewhere.

## Assumptions

- The feature branch `feat/manual-crm-pipeline` and the applied `20260701` migration are merged/deployed first; this feature builds on the unified 10-stage pipeline.
- The RLS SELECT-vs-claim contradiction will be resolved by loosening SELECT to org-wide and gating writes to owner/leader (confirmed against live `pg_policies` before writing the migration).
- WhatsApp remains manual (no WhatsApp Business API in this feature).
- Arabic is the primary UI language; templates and prompts are Arabic-first.
- The existing reminder infrastructure (`stuck-leads` / brain cron notifications) is reused for next-step reminders rather than building a new scheduler.
- No automated test runner exists; verification is `npx tsc --noEmit` + `npm run build` + manual acceptance per story.
