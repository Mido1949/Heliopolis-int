# Feature Specification: Helio Command Center & Platform Hardening

**Feature Branch**: `004-helio-command-center`

**Created**: 2026-06-12

**Status**: Draft

**Input**: User description: "Fix all security vulnerabilities and errors; upgrade Helio into the autonomous team controller (Mido's main brain) with full autonomy and action reporting; weekly batch auto-scraping that schedules leads for the team and notifies Mido; reports automatically delivered Sat–Thu at 3:50 PM Cairo time; UI/UX visual refresh keeping the AI login untouched."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reliable & Secure Platform (Priority: P1)

As the admin (Mido), I need the platform's automated jobs to actually run and its data to be protected, so that the team can trust the system and no outsider can read company files, quotes, or trigger internal automation.

**Why this priority**: Everything else (autonomy, scraping, reports) depends on working scheduled jobs and a secure foundation. Today the daily report jobs silently never run, three data endpoints are open to anyone with a guessable ID, and the build pipeline hides errors.

**Independent Test**: Trigger each scheduled job manually and on schedule — each succeeds and produces output; attempt to access a file link, quote PDF, or quote details without logging in or as a non-owner — access is denied; introduce a deliberate code error — the build fails instead of deploying.

**Acceptance Scenarios**:

1. **Given** the platform is deployed, **When** a scheduled report job fires at its scheduled time, **Then** the job executes successfully (not rejected for wrong request type) and produces its report/notifications.
2. **Given** an unauthenticated visitor knows a file or quote ID, **When** they request the file's signed link, the quote PDF, or the quote's room details, **Then** the request is rejected.
3. **Given** an authenticated user who does not own a given quote and is not a team lead/admin, **When** they request that quote's details, **Then** the request is rejected.
4. **Given** any scheduled job fails at runtime, **When** the failure occurs, **Then** Mido receives an alert message (Telegram) describing which job failed and why.
5. **Given** a code change with a type error, **When** the project is built for deployment, **Then** the build fails and the error is reported.
6. **Given** the lead-intake webhook is called without the dedicated webhook secret, **When** the request arrives, **Then** it is rejected (the database master key is never accepted as a webhook password).
7. **Given** the external lead-form webhook receives a verification request, **When** it logs diagnostic output, **Then** no secret tokens or signatures appear in logs.
8. **Given** a user sends more than the allowed number of AI chat messages in a short window, **When** the limit is exceeded, **Then** further requests are politely refused until the window resets.

---

### User Story 2 - Helio as Autonomous Team Controller (Priority: P1)

As the admin, I want Helio to act as my operational brain: it monitors the pipeline on a schedule, takes routine corrective actions on its own (nudging assignees, creating missing first-call tasks, escalating stuck leads, rebalancing workload), answers my questions about team performance in chat, executes my commands (assign, task, follow-up, report now), and reports every action it took back to me — with the ability to review and undo its actions.

**Why this priority**: This is the core product transformation requested — moving Helio from a 120-token chat toy to the team controller. It directly multiplies team output.

**Independent Test**: In chat, ask Helio for pipeline stats and team performance — it answers with live data; tell it to assign a lead and create a task — both happen and are logged; run the autonomy engine against seeded data containing a stuck lead, an overdue task, and an unbalanced workload — Helio nudges, creates tasks, escalates, logs every action, and sends Mido a digest; open the Helio control page — all actions appear in a timeline and a reversible action can be undone.

**Acceptance Scenarios**:

1. **Given** Mido chats with Helio, **When** he asks "كام ليد واقف دلوقتي؟" or "show team performance this week", **Then** Helio answers with accurate live data from the system.
2. **Given** Mido tells Helio to assign a lead to a team/user or create a task, **When** Helio confirms execution, **Then** the assignment/task exists in the system and the action is recorded in the action log.
3. **Given** the autonomy engine runs on its schedule (twice daily, Sat–Thu), **When** it finds leads with no first-call task, overdue tasks, stuck leads, or workload imbalance, **Then** it takes the corresponding corrective actions autonomously, records each one with its reasoning, and sends Mido a digest (in-app + Telegram) listing every action taken.
4. **Given** a lead has been stuck for 7+ days, **When** the autonomy engine runs, **Then** the relevant team lead is escalated to (notified), not just the assignee.
5. **Given** Mido opens the Helio control page, **When** he views the action timeline, **Then** every autonomous and chat-commanded action is listed with time, target, and reasoning; reversible actions show an Undo control that restores the previous state.
6. **Given** Mido pauses autonomy from the control page, **When** the engine's next run fires, **Then** no autonomous actions are taken (and the digest says autonomy is paused).
7. **Given** a regular team member chats with Helio, **When** they ask for data or actions, **Then** Helio only accesses/acts on data that member is allowed to see (their own leads/tasks), never other members' data.
8. **Given** Mido asks Helio "what did you do today?", **Then** Helio summarizes its logged actions for the day.

---

### User Story 3 - Reports at 3:50 PM Cairo, Sat–Thu (Priority: P2)

As the admin and team members, we receive our daily reports (personal report per member, company report to Mido) automatically every working day (Saturday through Thursday) at exactly 3:50 PM Cairo time, year-round, regardless of daylight-saving changes.

**Why this priority**: Direct, explicit owner requirement; small scope; depends only on Story 1's job revival.

**Independent Test**: Simulate the scheduler firing at both candidate UTC times — the report is generated exactly once and only when Cairo local time matches 3:50 PM on Sat–Thu; verify Friday runs produce nothing.

**Acceptance Scenarios**:

1. **Given** a working day (Sat–Thu), **When** Cairo local time reaches 3:50 PM, **Then** each team member receives their personal report and Mido receives the company report (Telegram + email).
2. **Given** Egypt switches daylight-saving time, **When** the schedule fires across both UTC offsets, **Then** the report is still delivered at 3:50 PM Cairo and never twice in one day.
3. **Given** it is Friday, **When** the scheduler fires, **Then** no reports are sent.
4. **Given** report generation fails, **Then** Mido receives a failure alert.

---

### User Story 4 - Weekly Auto-Scraping & Scheduled Outreach (Priority: P2)

As the admin, I queue scraping targets (business category + region) by telling Helio in chat or via the scraper page; every Saturday morning the system scrapes those targets, deduplicates the results, distributes new leads across the CS team round-robin, spreads their first-call tasks across the working days of that week (Sat–Thu), and sends me a summary of what was found and who got what.

**Why this priority**: Builds on Stories 1–2 (intake pipeline, Helio tools, alerting). Drives top-of-funnel growth automatically.

**Independent Test**: Queue two targets, trigger the weekly scrape manually in mock mode — leads are created without duplicates, assigned round-robin, first-call tasks dated across Sat–Thu, Mido receives a summary with created/duplicate/error counts and per-rep distribution.

**Acceptance Scenarios**:

1. **Given** Mido tells Helio "اسحب شركات مقاولات في التجمع الخامس", **When** Helio confirms, **Then** a scrape target is queued and visible on the scraper page.
2. **Given** queued targets exist, **When** Saturday morning arrives, **Then** the scrape runs automatically over the queued targets, new unique leads are created and assigned round-robin to CS members, and each lead gets a first-call task.
3. **Given** a batch of new leads is created on Saturday, **When** tasks are scheduled, **Then** the first-call task due dates are spread across Sat–Thu of that week rather than all on Saturday.
4. **Given** a scraped business's phone already exists in the system, **When** intake processes it, **Then** no duplicate lead is created and it is counted as a duplicate in the summary.
5. **Given** the weekly scrape completes (or fails), **Then** Mido receives a summary (or failure alert) via in-app notification and Telegram.

---

### User Story 5 - Refreshed, Consistent UI (Priority: P3)

As any team member, the application looks and feels professional and consistent: unified brand styling across all pages, clear loading and empty states, no blank screens on errors, and instant notification delivery — while the conversational AI login I already know remains exactly the same.

**Why this priority**: High visible value but no functional dependency; safest to apply after functional phases are stable.

**Independent Test**: Visual pass across dashboard, CRM, reports, and BOQ pages in Arabic (RTL) and English: consistent theme, skeletons during loading, designed empty states, an in-app error screen (not a crash) when a component fails; a new notification appears without page refresh; the AI login flow is unchanged.

**Acceptance Scenarios**:

1. **Given** any dashboard page is loading data, **When** the user views it, **Then** skeleton placeholders are shown (not blank areas or spinners only).
2. **Given** a list/table has no data, **Then** a designed empty state with guidance is shown.
3. **Given** a page component throws an error, **Then** the user sees a friendly in-app error screen with a retry option — the whole app does not crash.
4. **Given** Helio or a teammate triggers a notification for me, **When** I have the app open, **Then** the notification bell updates within seconds without refreshing.
5. **Given** the visual refresh is deployed, **When** a user logs in via the AI conversational login, **Then** that flow's behavior and appearance are unchanged.
6. **Given** Arabic (RTL) mode, **Then** all refreshed screens render correctly mirrored.

---

### Edge Cases

- Scheduler fires at both UTC offsets on the same day (DST overlap): the Cairo-time guard must ensure exactly-once delivery.
- Autonomy engine runs while autonomy is paused: no actions, digest notes the pause.
- Undo requested for an action whose target has since changed (e.g., lead manually reassigned after Helio's assignment): undo must refuse gracefully and explain.
- Weekly scrape returns zero results or the scraping provider is down: Mido is informed; no empty-batch side effects.
- All CS members are removed/inactive when intake runs: intake aborts with a clear error to Mido instead of assigning to nobody.
- Two scrape runs in the same week (manual + scheduled): phone-number dedup prevents duplicate leads.
- A team member asks Helio to act on a lead they don't own: Helio refuses, citing permissions.
- AI chat rate limit hit by Mido during a critical moment: limit is per-user and generous enough for heavy admin use; Mido's limit can be higher.
- Notification volume: autonomy nudges must not spam — repeated nudges for the same lead/task within 24h are suppressed.

## Requirements *(mandatory)*

### Functional Requirements

**Hardening (Story 1)**

- **FR-001**: All scheduled jobs MUST execute successfully when invoked by the platform scheduler (accept the scheduler's request method) and remain protected by a secret.
- **FR-002**: File signed-link generation MUST verify the requester is authenticated and authorized for that specific file before returning a link.
- **FR-003**: Quote (BOQ) PDF generation and quote room details MUST require authentication and verify the requester's access to that specific quote (owner, team lead, or admin).
- **FR-004**: Webhook diagnostic logging MUST NOT include secret tokens, signatures, or raw secrets; the external lead-form verification token MUST be rotated after cleanup.
- **FR-005**: The lead-intake webhook MUST authenticate via a dedicated webhook secret; the database master key MUST NOT be accepted as a webhook credential.
- **FR-006**: Production builds MUST fail on type or lint errors (checks re-enabled); all surfaced errors fixed.
- **FR-007**: Every scheduled job MUST send Mido a Telegram alert on failure, naming the job and the error.
- **FR-008**: Notifications MUST carry a machine-readable type and auto-created tasks a marker flag; duplicate-prevention MUST use these fields instead of message-text matching.
- **FR-009**: Stuck-lead detection MUST measure staleness from last contact date (falling back to last update only when no contact date exists).
- **FR-010**: AI chat MUST enforce a per-user rate limit (default 30 requests / 5 minutes) with a friendly refusal message.
- **FR-011**: Repository MUST be cleaned of committed build logs and the obsolete room-calculator migration; ignore rules updated.

**Helio Command Center (Story 2)**

- **FR-012**: Helio chat MUST be able to perform, on request: query leads, pipeline statistics, team performance, assign a lead, create a task, send a nudge to a user, schedule a follow-up, generate a report on demand, queue a scrape target, and list its own past actions.
- **FR-013**: Helio's data access and actions MUST respect the requesting user's permissions: admin/team-lead get full scope; members only their own data.
- **FR-014**: An autonomy engine MUST run twice daily on working days (Sat–Thu, ~10:00 and ~14:00 Cairo) and detect: leads missing a first-call task, overdue tasks, stuck leads (per FR-009), 7+ day stuck leads, and workload imbalance across CS members.
- **FR-015**: For each detection, the engine MUST act autonomously: create the missing task, nudge the assignee, escalate to the team lead (7+ days), or rebalance assignment — subject to a 24-hour suppression window per target to prevent nudge spam.
- **FR-016**: Every Helio action (chat-commanded or autonomous) MUST be recorded with type, target, reasoning, payload, and timestamp.
- **FR-017**: After each autonomy run, Mido MUST receive a digest (in-app + Telegram) listing every action taken (or stating none / paused).
- **FR-018**: A Helio control page MUST show the action timeline and allow: undoing reversible actions (assignment, task creation) with graceful refusal when state has changed, pausing/resuming autonomy, and adjusting the stuck-lead threshold.
- **FR-019**: The existing guided lead-registration chat flow and company knowledge enrichment MUST be preserved.

**Reports (Story 3)**

- **FR-020**: Personal and company reports MUST be delivered Sat–Thu at 3:50 PM Cairo time, exactly once per day, across DST changes; nothing on Friday.
- **FR-021**: The stuck-leads morning job MUST also follow the Sat–Thu working week.

**Auto-Scraping (Story 4)**

- **FR-022**: Scrape targets (query + region) MUST be queueable via Helio chat and via the scraper page, and visible with status (queued, done, failed, results count).
- **FR-023**: A weekly job (Saturday ~08:00 Cairo) MUST run all queued targets through the scraping provider (mock mode when no provider key) and feed results into intake.
- **FR-024**: Intake MUST deduplicate by phone, assign round-robin across active CS members, create a first-call task per new lead, and notify the assignee.
- **FR-025**: First-call task due dates for a weekly batch MUST be distributed across Sat–Thu of the current week.
- **FR-026**: On completion, Mido MUST receive a summary: created, duplicates, errors, and per-rep distribution; on failure, an alert.

**UI Refresh (Story 5)**

- **FR-027**: A single design theme (brand palette, typography, spacing, component styling) MUST apply across all dashboard pages, in both Arabic (RTL) and English.
- **FR-028**: All data views MUST show skeleton loading states and designed empty states.
- **FR-029**: Component failures MUST be contained by error screens with retry, at dashboard and root level.
- **FR-030**: Notifications MUST be delivered to the open app in real time (push, not 30-second polling).
- **FR-031**: Heavy export/PDF libraries MUST load only when their feature is used (no impact on initial page load).
- **FR-032**: The AI conversational login flow MUST remain functionally and visually unchanged.

### Key Entities

- **Agent Action**: A record of something Helio did — action type, target (lead/user/task), human-readable reasoning, payload snapshot for undo, created/undone timestamps, origin (chat command vs autonomous run).
- **Agent Settings**: Singleton configuration — autonomy paused flag, stuck-lead threshold days, nudge suppression window.
- **Scrape Target**: A queued scraping request — search query, region, status (queued/running/done/failed), requested by, last run, results count.
- **Notification (extended)**: Existing notification plus a machine-readable type for dedup and filtering.
- **Task (extended)**: Existing task plus an auto-created marker.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of scheduled jobs execute successfully on their schedule for 7 consecutive days (verifiable in scheduler logs), vs. 0% today.
- **SC-002**: 0 unauthenticated or cross-user requests succeed against file links, quote PDFs, or quote details (verified by attempting each).
- **SC-003**: Mido is alerted within 5 minutes of any scheduled-job failure.
- **SC-004**: Reports arrive at 3:50 PM Cairo ±2 minutes on every working day, including across a DST transition, never duplicated.
- **SC-005**: Helio answers pipeline/team questions with live data and executes assign/task/nudge/follow-up commands end-to-end in chat, with 100% of actions visible in the action log.
- **SC-006**: After one autonomy run on a seeded dataset, every stuck lead/overdue task/missing first-call task receives exactly one corrective action, and Mido's digest lists all of them.
- **SC-007**: A weekly scrape batch results in 0 duplicate leads, round-robin spread within ±1 lead per CS member, and task due dates spanning at least 4 distinct working days.
- **SC-008**: A new notification appears in the open app within 5 seconds of creation (vs. up to 30 seconds today).
- **SC-009**: Production build fails when a type error is introduced (verified by test commit), vs. silently passing today.
- **SC-010**: AI login flow passes regression: a user completes conversational login with identical steps and outcome as before the refresh.

## Assumptions

- The platform scheduler (Vercel cron) invokes jobs via HTTP GET in UTC; "working week" means Saturday–Thursday (Egypt), Friday off.
- Mido is the sole admin recipient of digests, summaries, and failure alerts (existing Telegram chat + admin email).
- "Full autonomy" applies to routine corrective actions (nudges, task creation, escalation, round-robin rebalancing); destructive operations (deleting leads, changing deal values) are NOT in Helio's autonomous scope.
- The existing scraping provider (Apify) and its cost model are acceptable; weekly batch size stays within current provider quota; mock mode is used for testing.
- Existing round-robin intake, notification, Telegram, report-generation, and assignment mechanisms are reused, not rebuilt.
- The current Ant Design component library remains the UI foundation (per constitution); the refresh is theming/polish, not a rebuild.
- Egypt observes DST (UTC+2/+3); the dual-schedule + local-time-guard approach covers both offsets.
- Rate limit default (30 req/5 min/user) is acceptable; admin may be configured higher.
- Database schema changes are additive only (per constitution II); the legacy assignment column cleanup is deferred to a future feature.
