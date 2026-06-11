# Data Model: HelioMax Platform Transformation

**Branch**: `002-heliomax-platform` | **Date**: 2026-06-04

---

## Existing Tables (DO NOT ALTER DESTRUCTIVELY)

All migrations are additive. Existing columns are preserved.

---

## Migration 1: leads table — Pipeline Stage Fields

```sql
-- Add pipeline_stage with valid values
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS pipeline_stage TEXT
    CHECK (pipeline_stage IN (
      'NEW','CONTACTED','ASSIGNED_TECH','QUOTED',
      'FOLLOW_UP','WON','LOST_PRICE','GHOSTED','POSTPONED'
    )),
  ADD COLUMN IF NOT EXISTS deal_value NUMERIC DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS stage_timestamps JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_contact_date TIMESTAMPTZ DEFAULT NULL;

-- Backfill from old status column
UPDATE leads SET pipeline_stage = CASE status
  WHEN 'New'        THEN 'NEW'
  WHEN 'Interested' THEN 'CONTACTED'
  WHEN 'Quote Sent' THEN 'QUOTED'
  WHEN 'Won'        THEN 'WON'
  WHEN 'Lost'       THEN 'LOST_PRICE'
  ELSE 'NEW'
END
WHERE pipeline_stage IS NULL;
```

### Lead Entity (updated)

| Column              | Type          | Notes                                          |
|---------------------|---------------|------------------------------------------------|
| id                  | UUID PK       | existing                                       |
| name                | TEXT          | existing                                       |
| phone               | TEXT          | existing                                       |
| company             | TEXT          | existing, nullable                             |
| email               | TEXT          | existing, nullable                             |
| source              | TEXT          | existing: WhatsApp/Meta/Direct/Phone           |
| status              | TEXT          | existing — kept, will deprecate after Phase 2  |
| pipeline_stage      | TEXT          | NEW — 9 valid values (CHECK constraint)        |
| deal_value          | NUMERIC       | NEW — filled only at WON stage                 |
| stage_timestamps    | JSONB         | NEW — `{"NEW":"2026-01-01T09:00:00Z", ...}`    |
| last_contact_date   | TIMESTAMPTZ   | NEW — updated on every CONTACTED/FOLLOW_UP     |
| assigned_to_user    | UUID FK       | existing → profiles.id                         |
| assigned_team       | TEXT          | existing: 'cs' / 'tech'                        |
| org_id              | UUID FK       | existing                                       |
| region              | TEXT          | existing                                       |
| client_type         | TEXT          | existing                                       |
| notes               | TEXT          | existing                                       |
| created_at          | TIMESTAMPTZ   | existing                                       |
| updated_at          | TIMESTAMPTZ   | existing                                       |

---

## Migration 2: price_list table (NEW)

```sql
CREATE TABLE IF NOT EXISTS price_list (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model        TEXT NOT NULL UNIQUE,
  capacity_kw  NUMERIC NOT NULL,
  description  TEXT,
  price_usd    NUMERIC NOT NULL,
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_by   UUID REFERENCES profiles(id)
);

-- RLS: anyone authenticated can read; only admin/tech_lead can write
ALTER TABLE price_list ENABLE ROW LEVEL SECURITY;

CREATE POLICY "price_list_read" ON price_list
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "price_list_write" ON price_list
  FOR ALL TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid())
    IN ('admin', 'Tech Team Leader')
  );
```

### PriceListItem Entity

| Column       | Type          | Notes                              |
|--------------|---------------|------------------------------------|
| id           | UUID PK       |                                    |
| model        | TEXT UNIQUE   | e.g. "FXAQ25A"                     |
| capacity_kw  | NUMERIC       | e.g. 2.5                           |
| description  | TEXT          | e.g. "Wall-mounted indoor unit"    |
| price_usd    | NUMERIC       | e.g. 450.00                        |
| updated_at   | TIMESTAMPTZ   | auto-updated on write              |
| updated_by   | UUID FK       | → profiles.id                      |

---

## Migration 3: boq_rooms table (NEW — load calculator)

```sql
CREATE TABLE IF NOT EXISTS boq_rooms (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  boq_id        UUID NOT NULL REFERENCES boq(id) ON DELETE CASCADE,
  room_name     TEXT NOT NULL,
  length        NUMERIC NOT NULL,
  width         NUMERIC NOT NULL,
  area          NUMERIC GENERATED ALWAYS AS (length * width) STORED,
  heat_factor   NUMERIC GENERATED ALWAYS AS (length * width * 0.3) STORED,
  required_kw   NUMERIC GENERATED ALWAYS AS (length * width * 0.3) STORED,
  qty           INTEGER DEFAULT 1,
  sort_order    INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
```

### BOQRoom Entity

| Column       | Type        | Notes                            |
|--------------|-------------|----------------------------------|
| id           | UUID PK     |                                  |
| boq_id       | UUID FK     | → boq.id CASCADE DELETE          |
| room_name    | TEXT        | e.g. "Living Room"               |
| length       | NUMERIC     | meters                           |
| width        | NUMERIC     | meters                           |
| area         | NUMERIC     | computed: L × W                  |
| heat_factor  | NUMERIC     | computed: area × 0.3             |
| required_kw  | NUMERIC     | computed: same as heat_factor    |
| qty          | INTEGER     | number of units for this room    |
| sort_order   | INTEGER     | display order                    |

---

## RLS Policy: leads — CS User Isolation (Migration 4)

```sql
-- Drop any existing permissive policy first
DROP POLICY IF EXISTS "leads_select" ON leads;

-- New policy: CS users see only their own leads; other roles see all
CREATE POLICY "leads_access" ON leads
FOR ALL TO authenticated
USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'Manager', 'Tech Team Leader')
  OR assigned_to_user = auth.uid()
);
```

> **Note**: This is an additive change. The existing application-layer filter in `crm/page.tsx` can remain as a belt-and-suspenders measure, but the DB-level policy is the authoritative enforcement.

---

## TypeScript Types (updates to types/index.ts)

```typescript
// New pipeline stage type (replaces old LeadStatus for new pipeline)
export type PipelineStage =
  | 'NEW' | 'CONTACTED' | 'ASSIGNED_TECH' | 'QUOTED' | 'FOLLOW_UP'
  | 'WON' | 'LOST_PRICE' | 'GHOSTED' | 'POSTPONED';

// Updates to Lead interface
export interface Lead {
  // ... existing fields ...
  pipeline_stage: PipelineStage;
  deal_value?: number;
  stage_timestamps: Record<PipelineStage, string>; // ISO timestamps
  last_contact_date?: string;
}

// New entities
export interface PriceListItem {
  id: string;
  model: string;
  capacity_kw: number;
  description?: string;
  price_usd: number;
  updated_at: string;
  updated_by?: string;
}

export interface BOQRoom {
  id: string;
  boq_id: string;
  room_name: string;
  length: number;
  width: number;
  area: number;        // computed
  heat_factor: number; // computed
  required_kw: number; // computed
  qty: number;
  sort_order: number;
}
```

---

## State Transitions: Pipeline Stage

```
NEW → CONTACTED (CS makes first call)
CONTACTED → ASSIGNED_TECH (CS assigns to Tech)
ASSIGNED_TECH → QUOTED (Tech sends BOQ)
QUOTED → FOLLOW_UP (Tech assigns back to CS)
FOLLOW_UP → WON (requires deal_value)
FOLLOW_UP → LOST_PRICE
FOLLOW_UP → GHOSTED
FOLLOW_UP → POSTPONED
POSTPONED → FOLLOW_UP (revived)
GHOSTED → FOLLOW_UP (revived)
```

Every transition writes the current timestamp into `stage_timestamps[new_stage]` and updates `updated_at`. Transitions to CONTACTED or FOLLOW_UP also update `last_contact_date`.
