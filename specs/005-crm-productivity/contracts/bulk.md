# Contract: POST /api/leads/bulk

**Story**: US9 — Bulk actions for backlog triage (T090)

## Purpose

Human-initiated bulk claim / assign / advance over a selection of leads. Manual
guard: the caller explicitly chooses the action — nothing autonomous.

## Request

```
POST /api/leads/bulk
Body: {
  ids: string[],                       // 1..200 lead ids (deduped)
  action: 'claim' | 'assign' | 'advance',
  assigned_to_user?: string,           // required for 'assign'
  pipeline_stage?: PipelineStage        // required for 'advance'
}
```

Auth: session cookie (same `createServerClient` pattern as the single claim
route).

- **claim** — any authenticated org member. Each lead is claimed **atomically**:
  `UPDATE … SET assigned_to_user = auth.uid() WHERE id = :id AND assigned_to_user IS NULL`.
  A lead already owned by someone yields `already_taken` (never stolen).
- **assign** — **leader/manager only** (`admin`, `Manager`, `CS Team Leader`,
  `Tech Team Leader`), else `403`. Sets `assigned_to_user` (+ `assigned_by`) and
  notifies the assignee.
- **advance** — **leader/manager only**, else `403`. Sets `pipeline_stage`
  (validated) and merges `stage_timestamps`.

Per lead, a `lead_activities` row is written (`assignment` for claim/assign,
`status_change` for advance), mirroring the single-action paths (FR-016).

## Resilience

Each id is processed independently; one failure never aborts the batch. The
response returns a per-id status so the UI can report partial success.

## Response 200

```jsonc
{
  "ok": true,
  "action": "claim",
  "counts": { "ok": 8, "already_taken": 2 },
  "results": [
    { "id": "…", "status": "ok" },
    { "id": "…", "status": "already_taken" },
    { "id": "…", "status": "not_found" },
    { "id": "…", "status": "error", "error": "…" }
  ]
}
```

| Status code | Meaning |
|---|---|
| 200 | Batch processed (see per-id `results`). |
| 400 | Missing/invalid `ids`, `action`, or required param; >200 ids. |
| 401 | No session. |
| 403 | `assign`/`advance` attempted by a non-leader. |

Per-id `status`: `ok` (applied), `already_taken` (claim lost the race / already
owned), `not_found` (id not visible), `error` (db error, `error` field set).
