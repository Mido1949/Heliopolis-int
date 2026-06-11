# API Contracts: HelioMax Platform

**Branch**: `002-heliomax-platform` | **Date**: 2026-06-04

All routes are Next.js App Router route handlers under `app/api/`.
Authentication: Supabase session cookie (handled by `@supabase/ssr` middleware).

---

## Phase 2: Pipeline

### PATCH /api/leads/[id]/stage

Move a lead to a new pipeline stage.

**Request body**:
```json
{
  "pipeline_stage": "CONTACTED",
  "deal_value": null
}
```
`deal_value` is required (non-null) when `pipeline_stage` is `"WON"`.

**Response 200**:
```json
{
  "id": "uuid",
  "pipeline_stage": "CONTACTED",
  "stage_timestamps": { "NEW": "2026-01-01T09:00:00Z", "CONTACTED": "2026-06-04T10:30:00Z" },
  "last_contact_date": "2026-06-04T10:30:00Z"
}
```

**Response 400** (WON without deal_value):
```json
{ "error": "deal_value is required when moving to WON" }
```

**Response 403**: CS user attempting to update another user's lead (RLS blocks at DB level).

---

## Phase 3: BOQ / Price List

### GET /api/price-list

Returns all price list items. Accessible to all authenticated users.

**Response 200**:
```json
[
  { "id": "uuid", "model": "FXAQ25A", "capacity_kw": 2.5, "description": "Wall-mounted indoor", "price_usd": 450.00 }
]
```

### PUT /api/price-list/[id]

Update a price list item. Admin and Tech Lead only (enforced by RLS + role check).

**Request body**:
```json
{ "price_usd": 480.00, "description": "Updated description" }
```

**Response 200**: Updated item. **Response 403**: Insufficient role.

### POST /api/boq/[id]/rooms

Add a room to the BOQ load calculator.

**Request body**:
```json
{ "room_name": "Living Room", "length": 5.0, "width": 4.0, "qty": 1 }
```

**Response 201**: Created `boq_rooms` row with computed `area`, `heat_factor`, `required_kw`.

---

## Phase 4: Reports

### GET /api/reports/personal

Returns today's activity and outcome data for the authenticated user.

**Query params**: `date` (ISO date, defaults to today)

**Response 200**:
```json
{
  "user_id": "uuid",
  "date": "2026-06-04",
  "activity": {
    "calls_made": 8,
    "leads_entered": 3,
    "leads_assigned": 2,
    "boqs_created": 1
  },
  "outcomes": {
    "won": [{ "lead_id": "uuid", "name": "Ahmed Ali", "deal_value": 15000 }],
    "lost_price": 1,
    "follow_up": 2
  }
}
```

### POST /api/reports/personal/cron

Vercel Cron trigger at 13:30 UTC (3:30 PM Cairo). Sends a notification to all active users.
Protected by `CRON_SECRET` header.

### POST /api/reports/company/cron

Vercel Cron trigger at 14:30 UTC (4:30 PM Cairo). Generates and sends the company report to Admin.
Protected by `CRON_SECRET` header.

**Report payload sent to email/Telegram** (summary):
```json
{
  "date": "2026-06-04",
  "pipeline": {
    "by_stage": { "NEW": 5, "CONTACTED": 12, "QUOTED": 8, "WON": 2 },
    "conversion_rate": "6.25%",
    "pipeline_value": 145000
  },
  "team": {
    "cs": [{ "user": "Sara", "calls": 10, "leads_assigned": 3 }],
    "tech": [{ "user": "Kareem", "boqs_sent": 4 }]
  },
  "won_today": [{ "name": "Ahmed Ali", "value": 15000 }],
  "flags": ["Lead 'Mohamed Hassan' stuck in QUOTED for 5 days"],
  "ai_insight": "4 leads moved to FOLLOW_UP today with 0 WON conversions..."
}
```

---

## Phase 6: Automation

### POST /api/automation/assign

Re-assign a lead to another team. Called by the AI assistant when user types a hand-off command.

**Request body**:
```json
{
  "lead_id": "uuid",
  "to_team": "tech",
  "message": "BOQ needed, client confirmed budget"
}
```

**Response 200**: Updated lead + notification record created.

### POST /api/automation/intake

Trigger auto-intake of scraped leads. Called by scraper completion webhook.

**Request body**: Array of scraped business records.

**Response 200**:
```json
{ "created": 5, "duplicates": 2, "errors": 0 }
```
