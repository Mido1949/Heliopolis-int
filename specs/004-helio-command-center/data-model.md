# Data Model: Helio Command Center & Platform Hardening

All changes are **additive** (constitution II). Three migrations, applied in order. Naming follows the existing `YYYYMMDD_name.sql` convention in `supabase/migrations/`.

## Migration 1 — `20260612_idempotency_hardening.sql` (Phase A)

### notifications (extend)

| Column | Type | Notes |
|---|---|---|
| `type` | TEXT NULL | Machine-readable category: `stuck_lead`, `lead_intake`, `personal_report`, `nudge`, `escalation`, `agent_digest`, `scrape_summary`, `assignment`. NULL for legacy rows. |

Index: `idx_notifications_type_lead (type, lead_id, created_at)` — serves the 24h dedup lookup.

### tasks (extend)

| Column | Type | Notes |
|---|---|---|
| `auto_created` | BOOLEAN NOT NULL DEFAULT false | Marks tasks created by automation (intake, autonomy engine, scraper). |

Index: `idx_tasks_auto_lead (lead_id, auto_created, status)` — serves the first-call-task existence check.

### agent_requests (new — rate limiting)

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT GENERATED ALWAYS AS IDENTITY PK | |
| `user_id` | UUID NOT NULL REFERENCES profiles(id) | |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |

Index: `idx_agent_requests_user_time (user_id, created_at)`.
RLS: enabled; no policies for `authenticated` (service-role only — rows are an internal counter).

## Migration 2 — `20260612_agent_command_center.sql` (Phase B)

### agent_actions (new — audit log)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK DEFAULT gen_random_uuid() | |
| `action_type` | TEXT NOT NULL CHECK IN (`assign_lead`, `create_task`, `nudge`, `escalate`, `rebalance`, `schedule_followup`, `queue_scrape`, `generate_report`) | |
| `origin` | TEXT NOT NULL CHECK IN (`chat`, `autonomous`) | |
| `target_lead_id` | UUID NULL REFERENCES leads(id) | |
| `target_user_id` | UUID NULL REFERENCES profiles(id) | the user affected (assignee/nudged) |
| `task_id` | UUID NULL | task created by the action, when applicable |
| `reasoning` | TEXT NOT NULL | human-readable Arabic/English explanation |
| `payload` | JSONB NOT NULL DEFAULT '{}' | prior-state snapshot for undo (e.g., `{ "previous_assigned_to_user": "...", "previous_assigned_to_team": "..." }`) |
| `created_by` | UUID NULL REFERENCES profiles(id) | the chat caller; NULL for autonomous runs |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |
| `undone_at` | TIMESTAMPTZ NULL | |
| `undone_by` | UUID NULL REFERENCES profiles(id) | |

Indexes: `idx_agent_actions_created (created_at DESC)`, `idx_agent_actions_target (action_type, target_lead_id, created_at)` (suppression window lookup), `idx_agent_actions_task (task_id)`.

RLS: enabled.
- SELECT: admin and team leads (reuse the existing role/team-lead predicate pattern from `20260428_team_leaders_and_daily_report.sql`).
- INSERT/UPDATE: none for `authenticated` (service-role writes; undo goes through the API route which validates then updates via service role).

### agent_settings (new — singleton config)

| Column | Type | Notes |
|---|---|---|
| `id` | SMALLINT PK DEFAULT 1 CHECK (id = 1) | enforced singleton |
| `autonomy_paused` | BOOLEAN NOT NULL DEFAULT false | |
| `stuck_threshold_days` | INT NOT NULL DEFAULT 3 CHECK (1..30) | |
| `nudge_suppression_hours` | INT NOT NULL DEFAULT 24 CHECK (1..168) | |
| `updated_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |
| `updated_by` | UUID NULL REFERENCES profiles(id) | |

Seed: `INSERT ... VALUES (1) ON CONFLICT DO NOTHING`.
RLS: SELECT admin/team-lead; UPDATE admin only.

## Migration 3 — `20260612_scrape_targets.sql` (Phase C)

### scrape_targets (new — scraping queue)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK DEFAULT gen_random_uuid() | |
| `query` | TEXT NOT NULL | e.g. "شركات مقاولات" |
| `region` | TEXT NOT NULL | e.g. "التجمع الخامس, القاهرة" |
| `status` | TEXT NOT NULL DEFAULT 'queued' CHECK IN (`queued`, `running`, `done`, `failed`) | |
| `requested_by` | UUID NULL REFERENCES profiles(id) | |
| `last_run_at` | TIMESTAMPTZ NULL | |
| `results_count` | INT NULL | leads created on last run |
| `error` | TEXT NULL | failure detail |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |

Index: `idx_scrape_targets_status (status, created_at)`.
RLS: SELECT all authenticated; INSERT authenticated (admin/team-lead via policy predicate); UPDATE service-role only (status transitions owned by the cron).

State machine: `queued → running → done | failed`; `failed` targets may be re-queued by setting status back to `queued` (admin UI action, deferred — manual SQL acceptable for now).

## Entity relationships

```text
profiles 1─n agent_actions (created_by / target_user_id / undone_by)
leads    1─n agent_actions (target_lead_id)
tasks    1─1 agent_actions (task_id, for create_task actions)
profiles 1─n agent_requests
profiles 1─n scrape_targets (requested_by)
scrape run ⇒ leads (via lib/leads/intake.ts: insert + assigned_to_user round-robin)
           ⇒ tasks (auto_created = true, due_date spread Sat–Thu)
           ⇒ notifications (type = 'lead_intake' per assignee, 'scrape_summary' to admin)
```

## Validation rules (enforced in application layer)

- Undo allowed only when `undone_at IS NULL` AND current DB state equals the action's recorded after-state; else 409.
- Suppression: before nudge/escalate, look up `agent_actions` where same `action_type` + `target_lead_id` (or `target_user_id`) within `nudge_suppression_hours` → skip.
- Exactly-once daily reports: before sending, check today's `notifications` `type = 'personal_report'` (per user) / a company-report sent marker (`notifications` row `type = 'agent_digest'`-style marker for admin, or Telegram send recorded) — implementer detail in contracts/cron-endpoints.md.
- Intake aborts with ops alert when zero active CS members exist.
