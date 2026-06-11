# Data Model: Phase 6 — HelioMax Automation

## Existing Tables (no changes needed)

### `notifications` (migration 005)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | auto-generated |
| user_id | uuid FK → profiles | recipient |
| message | text | Arabic notification text |
| lead_id | uuid FK → leads (nullable) | context link |
| read | boolean | default false |
| created_at | timestamptz | default now() |

### `tasks` (existing)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| title | text | "اتصل بـ [name]" for auto-tasks |
| type | text | 'call' for auto-tasks |
| assigned_to | uuid FK → profiles | |
| due_date | date | today for auto-tasks |
| lead_id | uuid FK → leads (nullable) | |
| org_id | uuid FK → organizations | |
| created_by | uuid FK → profiles | use system user or assigning user |
| completed | boolean | default false |
| created_at | timestamptz | |

### `price_list` (existing, seeded)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| model | text UNIQUE | e.g. "CHV-V120W/DPN1" |
| capacity_kw | numeric | |
| description | text | |
| price_usd | numeric | editable by Admin/Tech Lead |

### `leads` (existing — relevant columns)
| Column | Type | Notes |
|--------|------|-------|
| assigned_to_user | uuid FK → profiles nullable | triggers notification on change |
| pipeline_stage | text | stuck-lead check: not in terminal stages |
| updated_at | timestamptz | stuck-lead check: < NOW()-3days |

## No New Migrations Required

All tables already exist. Phase 6 is purely application-layer logic wired to existing schema.
