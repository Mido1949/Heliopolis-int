# API Contracts: Phase 6 — HelioMax Automation

## New API Routes

### GET /api/notifications
Returns unread notifications for the authenticated user.

**Auth**: Session cookie (Supabase Auth)

**Response 200**:
```json
[
  {
    "id": "uuid",
    "message": "⚠️ أحمد سيد واقف في CONTACTED منذ 4 أيام",
    "lead_id": "uuid | null",
    "read": false,
    "created_at": "2026-06-05T08:00:00Z"
  }
]
```
Returns max 20, ordered by `created_at DESC`.

---

### POST /api/notifications/read
Marks one or all notifications as read.

**Auth**: Session cookie

**Request body**:
```json
{ "all": true }
// OR
{ "id": "uuid" }
```

**Response 200**: `{ "ok": true, "updated": N }`

---

### PATCH /api/leads/[id]
Updates lead fields — specifically `assigned_to_user`. Triggers assignment notification.

**Auth**: Session cookie

**Request body**:
```json
{ "assigned_to_user": "uuid | null" }
```

**Response 200**:
```json
{ "id": "uuid", "assigned_to_user": "uuid", "name": "string" }
```

**Side effect**: If `assigned_to_user` changes to a non-null value, calls `createNotification(new_user_id, "📋 تم تحويل [name] إليك", lead_id)`.

---

### POST /api/reports/stuck-leads/cron
Detects leads stuck for 3+ days and creates per-user notifications.

**Auth**: `Authorization: Bearer {CRON_SECRET}` header

**Response 200**:
```json
{ "ok": true, "date": "2026-06-05", "checked": 12, "notified": 3 }
```

**Vercel cron schedule** (in `vercel.json`): `"0 6 * * 1-5"` (8:00 AM Cairo, Mon–Fri)

---

## Modified API Routes

### POST /api/agent/chat (modified)
Unchanged interface. Behavior change: system prompt is prepended with content from `system-approval/*.md` files.

**No API contract changes** — same request/response shape.

---

## No New Migrations

All database tables already exist. No SQL migration files needed for Phase 6.
