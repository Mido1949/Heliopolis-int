# Contract: /api/leads/[id]/next-step

**Story**: US5 — Rep-set "Next Step" + reminders (T061)

## Model

A "next step" reuses the existing `tasks` table (research D1 — no new columns
on `leads`). A next step is a `tasks` row with:

- `auto_created = false` (distinguishes it from the retired bot's tasks),
- `lead_id` = the lead,
- `assigned_to` = the lead owner (fallback: the caller, e.g. a leader acting on
  a still-unassigned lead),
- `due_date` = when it's due,
- `status = 'pending'` while open; `status = 'done'` + `completed_at` when done,
- `priority = 'medium'`, `title` (required; derived from the description when
  not supplied), `description` = the step text,
- `org_id` = the caller's `profiles.org_id`.

## Auth & RLS

Session-cookie auth (same `createServerClient` pattern as the claim route). The
route uses the **user's session client** (not service role), so the insert runs
under `tasks` RLS (`org_isolation_tasks FOR ALL` + manager-only `tasks_insert`,
permissively OR'd). A regular owner can insert only when the row's `org_id`
equals their org, so the route sets `org_id` = the caller's `profiles.org_id`.

Permission (enforced in code, defense-in-depth): the caller must be the lead's
current `assigned_to_user` **or** a leader/manager (`admin`, `Manager`,
`CS Team Leader`, `Tech Team Leader`). Otherwise `403 forbidden`.

Manual guard: nothing here changes a lead's owner or stage.

## POST — create or replace the open next step

```
POST /api/leads/:id/next-step
Body: { description: string, title?: string, due_date?: string | null }
```

- `description` (required) — the next-step text. `title` defaults to the first
  80 chars of the description (or "خطوة تالية").
- `due_date` — ISO datetime, optional.
- **Replace semantics**: if an open manual next step already exists for the lead
  (`auto_created=false`, `status='pending'`), it is edited in place so there is
  at most one open next step per lead; otherwise a new task is inserted.
- Logs a `next_step_set` row in `lead_activities`.

| Status | Body | Meaning |
|---|---|---|
| 200 | `{ ok: true, task_id, replaced }` | Created (`replaced:false`) or replaced (`replaced:true`). |
| 400 | `{ error: 'description is required' }` / db message | Bad input. |
| 401 | `{ error: 'Unauthorized' }` | No session. |
| 403 | `{ error: 'forbidden' }` | Not owner and not a leader/manager. |
| 404 | `{ error: 'not_found' }` | Lead id not found/visible. |

## PATCH — complete the open next step

```
PATCH /api/leads/:id/next-step
Body: { task_id?: string }
```

- Completes the given `task_id`, or (when omitted) the lead's newest open manual
  next step: sets `status='done'` + `completed_at=now()`.
- Logs a `next_step_done` row in `lead_activities`.

| Status | Body | Meaning |
|---|---|---|
| 200 | `{ ok: true, task_id }` | Completed. |
| 401 | `{ error: 'Unauthorized' }` | No session. |
| 403 | `{ error: 'forbidden' }` | Not owner and not a leader/manager. |
| 404 | `{ error: 'not_found' }` / `{ error: 'no_open_next_step' }` | Lead / open task missing. |

## Reminders (T063)

The stuck-leads cron additionally scans open manual next steps
(`auto_created=false`, `status='pending'`, `due_date <= now()`,
`completed_at is null`) and reminds `assigned_to` via `createNotification`
(`type: 'nudge'`), with a 24h per-task suppression window. Reminder only — never
changes the task/lead owner or stage.
