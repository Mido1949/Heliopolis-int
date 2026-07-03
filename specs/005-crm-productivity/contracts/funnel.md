# Contract: GET /api/reports/funnel

**Story**: US8 — Funnel / conversion report (T081)

## Purpose

Read-only funnel/conversion metrics computed on the fly from each lead's
`stage_timestamps`. No new tables.

## Request

```
GET /api/reports/funnel?from=<ISO>&to=<ISO>&source=<src>&rep=<userId>
```

- `from` / `to` (optional) — inclusive range on `leads.created_at`. **Documented
  choice**: a lead is included when it was *created* in the range;
  `stage_timestamps` entry times drive velocity only, not the range filter.
- `source` (optional) — exact `leads.source`.
- `rep` (optional) — `leads.assigned_to_user`.
- Auth: session cookie (same `createServerClient` pattern as the personal report
  route). **Leaders/managers only** (`admin`, `Manager`, `CS Team Leader`,
  `Tech Team Leader`), else `403`. Scoped to the caller's `profiles.org_id`.

## Response 200

```jsonc
{
  "range": { "from": "…|null", "to": "…|null" },
  "totalLeads": 890,
  "funnel": [
    { "stage": "NEW", "labelAr": "جديد", "count": 890,
      "conversionFromPrev": null, "avgDaysInStage": 1.2 },
    { "stage": "WELCOME_SENT", "labelAr": "تم الترحيب", "count": 640,
      "conversionFromPrev": 71.9, "avgDaysInStage": 0.8 }
    // … NO_RESPONSE, INTERESTED, PRICING, QUOTED, NEGOTIATION, WON
  ],
  "overallWinRate": { "key": "all", "label": "الإجمالي", "won": 120, "lost": 80, "winRate": 60.0 },
  "bySource": [ { "key": "Meta", "label": "Meta", "won": 60, "lost": 30, "winRate": 66.7 } ],
  "byRep":    [ { "key": "<uuid>", "label": "أحمد", "won": 40, "lost": 10, "winRate": 80.0 } ]
}
```

## Computation

- **Per-stage count** = number of leads whose `stage_timestamps` contains that
  stage key (ever entered).
- **Conversion %** along `NEW→WELCOME_SENT→NO_RESPONSE→INTERESTED→PRICING→QUOTED→NEGOTIATION→WON`
  = `count[i] / count[i-1] * 100` (null when the previous stage is 0).
- **Avg time-in-stage** = mean of consecutive chronological gaps in each lead's
  own `stage_timestamps` (so leads missing early stages don't skew earlier-stage
  averages), reported in days.
- **Win rate** = `WON / (WON + LOST) * 100` from current `pipeline_stage`,
  overall and grouped by `source` and by `assigned_to_user` (joined to
  `profiles` for the name).

| Status | Meaning |
|---|---|
| 200 | Report body above. |
| 401 | No session. |
| 403 | Not a leader/manager. |
| 500 | Query failed. |
