# Data Model: CRM Productivity & Manual-System Completion

Builds on the unified 10-stage pipeline from `20260701_manual_crm_pipeline.sql`
(stages: `NEW, WELCOME_SENT, NO_RESPONSE, INTERESTED, PRICING, QUOTED, NEGOTIATION, WON, LOST, POSTPONED`).

## `leads` — new column (migration `20260703_leads_phone_normalized.sql`)

> REVISED 2026-07-03 after live schema check: next-step is modeled on the existing
> `tasks` table (see below), so the only new `leads` column is the dedupe key.

| Column | Type | Null | Purpose |
|---|---|---|---|
| `phone_normalized` | `text` | yes | E.164 match key for dedupe (backfilled from `phone`). |

- Index: `create index if not exists leads_phone_normalized_idx on leads (phone_normalized);`
- Backfill `phone_normalized` for existing rows via the same normalization the app uses (script or one-off SQL for the common EG/SA cases).

## `tasks` — reused for "next step" (NO migration needed)

Live columns: `id, title, description, assigned_to, created_by, lead_id, due_date,
status, priority, created_at, completed_at, org_id, auto_created`.

- A rep's **next step** = a `tasks` row with `auto_created = false`, `lead_id` set,
  `assigned_to` = owner, `due_date` = when, `status` open until `completed_at` set.
- The retired bot's tasks are `auto_created = true` — filter on this to keep the
  manual/auto line clean.
- My Day + reminders query: `status` open AND `due_date <= now()` (optionally
  `auto_created = false`).
- **Verify `tasks` RLS** allows an owner to insert their own task before US5.

## RLS policies (migration `20260703_crm_rls_visibility.sql`)

Reconcile against **live** `pg_policies` first (P0-c). Target end state on `leads`:

- **SELECT**: any authenticated member of the lead's org may read it (org-wide visibility). Replaces the owner-only SELECT that hides unassigned NEW leads.
- **UPDATE (claim)**: any org member may set `assigned_to_user` from `NULL` → `auth.uid()` (the atomic claim). Expressed so only the NULL→me transition is allowed for non-owners.
- **UPDATE (act)**: the current `assigned_to_user` OR a Team Leader/Manager may update stage/owner/other fields.
- **INSERT**: unchanged (org members may create leads).
- Leaders/Managers retain full override (by role check used elsewhere in the policies).

> Server route handlers additionally enforce these checks in code (defense in depth); RLS is the backstop, not the only guard.

## Activity log (`lead_activities`)

Live shape: `id, lead_id, user_id, type (TEXT — free text, not an enum), body,
duration_seconds, details (jsonb), created_at, org_id`. Because `type` is free
text, **no migration** is needed to add new activity kinds — just insert rows:

- `status_change` — stage moved (existing).
- `assignment` — claim / assign / bulk-assign / return-to-sender (existing; extend to bulk).
- `next_step_set` — owner set/edited a next step (**new `type` string**).
- `next_step_done` — owner completed a next step (**new `type` string**).

## Autonomy settings (existing table)

- `autonomy_paused boolean default false` — kept as a global kill switch (now silences even reminders when true).
- Thresholds (`stuck_threshold_days`, `nudge_suppression_hours`) — kept for reminder cadence.
- **Behavioral change (not schema):** the cycle no longer writes `rebalance` or autonomous `create_task` actions.

## Derived / computed (no storage)

- **SLA color**: `stageAgeDays(lead)` vs `{ amberDays, redDays }` constant → green/amber/red. Terminal stages → none.
- **Funnel metrics**: computed on read from `stage_timestamps` (per-stage entry timestamps) — entries/exits per stage, avg time-in-stage, win rate by `source` and `assigned_to_user`. No new tables.
