# Contract: POST /api/leads/[id]/claim

**Story**: US1 — Everyone can see and safely claim unassigned leads (T012)

## Purpose

Atomically claim an unassigned lead for the calling (authenticated) user. This
is a human-initiated action only — no automated/agent code path may call this
route (manual-philosophy guard).

## Request

```
POST /api/leads/:id/claim
```

- `:id` — lead UUID (path param).
- No request body required.
- Auth: Supabase session cookie (same `createServerClient` pattern as
  `app/api/leads/[id]/route.ts` and `app/api/leads/[id]/stage/route.ts`).
  RLS (`org_isolation_leads FOR ALL`, `leads_update`) already permits any org
  member to update any lead, so this route relies on the DB row-level lock +
  `WHERE assigned_to_user IS NULL` predicate for correctness, not RLS.

## Atomicity

The claim is implemented as a single conditional UPDATE:

```sql
UPDATE leads
SET assigned_to_user = :uid, updated_at = now()
WHERE id = :id AND assigned_to_user IS NULL
RETURNING id, name, pipeline_stage, assigned_to_user, assigned_to_team, assigned_by, org_id;
```

Postgres evaluates `WHERE` per row under the row's lock during the UPDATE, so
if two requests race to claim the same lead, exactly one UPDATE statement
matches the row (the other sees 0 rows affected once the first commits/the
predicate no longer holds). The route treats "0 rows returned" as
`already_taken` — there is no read-modify-write gap for a client-side race to
exploit, unlike the previous unguarded `supabase.from('leads').update(...)`
call the UI used to make directly.

A cheap pre-check (`SELECT ... WHERE id = :id`) runs first purely to produce a
clean `404 not_found` vs `409 already_taken` distinction; it does **not**
affect the atomicity guarantee, which comes entirely from the UPDATE's WHERE
clause.

## Responses

| Status | Body | Meaning |
|---|---|---|
| 200 | `{ id, name, pipeline_stage, assigned_to_user, assigned_to_team, assigned_by, org_id }` | Claim succeeded; caller is now `assigned_to_user`. |
| 401 | `{ error: "Unauthorized" }` | No authenticated session. |
| 404 | `{ error: "not_found" }` | Lead id does not exist (or is not visible under RLS). |
| 409 | `{ error: "already_taken" }` | Lead was already assigned (pre-check or lost the UPDATE race). |
| 400 | `{ error: <db message> }` | Unexpected Supabase error. |

## Side effects on success

- Inserts one `lead_activities` row: `{ lead_id, user_id: <claimer>, type: 'assignment', body: 'تم استلام الليد', org_id }` (matches the existing `assignment` activity shape used by `LeadDrawer.handleAssign`). Non-fatal if this insert fails — the claim itself is not rolled back.
- **No notification is created.** A claim is a self-action (claimer == new owner), so there is no other party to notify; this mirrors the pre-existing `claim()` implementations in `KanbanView.tsx`/`LeadDrawer.tsx`, which also did not notify anyone.
- Does **not** touch `assigned_to_team` or `assigned_by` — only `assigned_to_user` changes, matching the behavior of the previous unguarded claim implementations.

## Manual-philosophy guard

This route only ever runs in response to a direct user click ("استلام"). It
is never invoked by `lib/agent/**`, cron jobs, or webhooks.
