# Stage 1 — Database Foundation

## Your role
You are the coder. Apply 3 database migrations and fix + run the price_list seed.
STOP and report after each step. Do NOT skip ahead.

## Rules
- Migrations touch a live production database. Show the full SQL before applying.
- NEVER delete or truncate existing data.
- NEVER apply migration 003_boq_rooms.sql (load calculator is being removed).
- The seed script must use GCHV models from price_list_seed.json, NOT the existing fake Daikin models.

---

## Step 1A — Apply migration 001_pipeline_stage.sql

File: `supabase/migrations/001_pipeline_stage.sql`

What it does: adds `pipeline_stage`, `deal_value`, `stage_timestamps`, `last_contact_date`
to the `leads` table. Backfills from `status` column. Additive only — no data loss.

**Action**: Show the SQL to the user, then apply it via `supabase db push` or Supabase MCP.

---

## Step 1B — Apply migration 002_price_list.sql

File: `supabase/migrations/002_price_list.sql`

What it does: creates the `price_list` table with RLS (read: all users, write: admin/Tech Lead).

**Action**: Show the SQL, then apply.

---

## Step 1C — Apply migration 005_notifications.sql

File: `supabase/migrations/005_notifications.sql`

What it does: creates `notifications` table for in-app push + Supabase Realtime.

**Action**: Show the SQL, then apply.

---

## Step 1D — Fix the seed script

**Problem**: `scripts/seed-price-list.ts` contains FAKE Daikin model codes (FXAQ25A etc).
**Real data**: `price_list_seed.json` has 97 real GCHV models with official prices.

**Task**: Replace the `PRICE_LIST` constant in `scripts/seed-price-list.ts` with rows
built from `price_list_seed.json`. Rules:
- `capacity_kw: "/"` in the JSON → use `capacity_kw: 0` (HRV units have no cooling kW)
- All other fields map directly: model, description, price_usd
- Keep the rest of the script (upsert logic, error handling) unchanged
- The table schema: `capacity_kw NUMERIC NOT NULL` — "/" is invalid, must be 0

After the replacement the script should produce exactly 97 rows.

---

## Step 1E — Run the seed script

```bash
npx tsx scripts/seed-price-list.ts
```

Requires `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.

---

## Acceptance checks (run these SQL queries to verify)

```sql
-- Should return 97
SELECT COUNT(*) FROM price_list;

-- Should return 1 row with price_usd = 462
SELECT model, capacity_kw, price_usd FROM price_list WHERE model = 'GCHV-D22G/HR1-GSB';

-- Should exist
SELECT COUNT(*) FROM notifications;

-- Should have the new column
SELECT pipeline_stage FROM leads LIMIT 5;
```

## Report when done
List:
- Which migrations were applied (or already existed)
- How many rows were seeded into price_list
- Any errors encountered
