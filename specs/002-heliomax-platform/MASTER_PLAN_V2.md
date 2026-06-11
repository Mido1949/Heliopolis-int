# HelioMax Platform — Master Implementation Plan v2
_Generated from MASTER_PROMPT_v2.md — 2026-06-05_

---

## SCOPE SUMMARY

Three stages, strictly in order. Each stage must be confirmed before the next starts.
OpenCode executes all code. This document is the delegation contract.

| Stage | Name | What changes | Blocking dependency |
|---|---|---|---|
| 1 | Database Foundation | 3 migrations + real seed | None — do first |
| 2 | AI-First Shell | New role-based layout, AI lead entry | Stage 1 (price_list must exist) |
| 3 | BOQ Simplification | Remove load calc, new grid + PDF | Stage 1 (price_list rows must exist) |

---

## STAGE 1 — DATABASE FOUNDATION

### What it does
Applies three additive migrations (no rows deleted, no columns dropped) and seeds
the price_list table with 97 real GCHV models from `price_list_seed.json`.

### Migration SQL (show to user before applying)

**001_pipeline_stage.sql** — Already in repo. Adds 4 columns to `leads`:
`pipeline_stage`, `deal_value`, `stage_timestamps`, `last_contact_date`.
Backfills from old `status` column. Additive only. ✅ Safe.

**002_price_list.sql** — Already in repo. Creates `price_list` table with RLS.
Read: all authenticated users. Write: admin + Tech Team Leader. ✅ Safe.

**005_notifications.sql** — Already in repo. Creates `notifications` table with RLS.
Realtime subscription for in-app push. ✅ Safe.

> ⚠️ DO NOT apply 003_boq_rooms.sql — the load calculator is being removed in Stage 3.

### Seed fix required (critical)

`scripts/seed-price-list.ts` currently contains FAKE Daikin-style model codes (FXAQ25A etc).
The real data is in `price_list_seed.json` (97 GCHV models, official prices).

The fix:
1. Replace the `PRICE_LIST` array in the seed script with rows from `price_list_seed.json`
2. Map `capacity_kw: "/"` → `capacity_kw: 0` (HRV/ventilator units have no cooling kW)
3. The table has `capacity_kw NUMERIC NOT NULL` so "/" is invalid — must be 0

After seed, `price_list` has 97 rows: wall mounted, cassette, ducted, VRF outdoor, HRV.

### Acceptance test
```sql
SELECT COUNT(*) FROM price_list;                          -- must be 97
SELECT * FROM price_list WHERE model LIKE 'GCHV-D22G%';   -- must return 1 row, $462
SELECT * FROM notifications LIMIT 1;                      -- table exists
SELECT pipeline_stage FROM leads LIMIT 1;                 -- column exists, backfilled
```

---

## STAGE 2 — AI-FIRST SHELL

### What it changes
The shell layout is the biggest change. Currently: sidebar always visible, all pages for everyone.
New: layout depends on the user's role.

### Role matrix

| Role | Sees | Does NOT see |
|---|---|---|
| CS / Tech (normal) | AI chat (center, full height) + Daily Report panel + BOQ panel | Dashboard, Company Hub, Inventory, Email, KSA CRM, Scraper, Settings |
| Tech Team Leader | AI + CRM + BOQ + Scraper + Email + Inventory + Team Performance | Company admin pages |
| Admin (Mido) | Everything, unchanged | — |

### Normal user layout (new component: `NormalUserShell`)

```
┌─────────────┬────────────────────────────┬──────────────┐
│ Daily Report│                            │   BOQ panel  │
│  (panel)    │   AI Assistant (chat)      │  (recent     │
│             │   "أهلاً يا [name]!"       │   quotes)    │
│             │   + input box              │              │
│ 3:30 PM     │                            │              │
│ personal    │                            │  + New BOQ   │
│ report      │                            │  button      │
└─────────────┴────────────────────────────┴──────────────┘
```

### AI lead creation flow

When a normal user types "سجّل عميل جديد" or "register client X" in the AI:
1. AI asks questions one by one: name → phone → region → project type → source → budget
2. After each answer AI confirms before moving on
3. On completion: insert lead with `pipeline_stage = 'NEW'`, all fields populated
4. AI confirms: "تم تسجيل [name] — رقمه [phone]"

This replaces the manual lead form for normal users. Guarantees complete data.

### Normal user "my clients" view

A simple list (not the full CRM) accessible via AI or a button:
- Own leads only (RLS already enforces this)
- Shows: name, phone, stage, next follow-up
- Clicking a lead opens a mini detail sheet (call log, not the full LeadDrawer)

### Technical files to change

| File | Change |
|---|---|
| `components/layout/Shell.tsx` | Detect role; render `NormalUserShell` OR existing full Shell |
| `components/layout/NormalUserShell.tsx` | **NEW** — 3-column layout above |
| `components/layout/Sidebar.tsx` | Add role-based menu filtering |
| `app/api/agent/chat/route.ts` | Add `register_lead` intent handler |
| `app/(dashboard)/my-leads/page.tsx` | **NEW** — simple filtered list |

### Acceptance test
1. Login as a CS user → see AI center + 2 side panels only
2. Tell AI "سجّل عميل جديد اسمه محمد" → AI guides through all fields → lead appears in CRM
3. Login as Mido (admin) → full layout unchanged

---

## STAGE 3 — BOQ SIMPLIFICATION

### What changes
The current BOQ has a load calculator (removed), a product catalog panel (removed),
and a complex multi-tab layout (simplified). The new BOQ is TWO things only.

### Part A — Simple Entry Grid

Columns (in this order, matching the Excel sheet):

| # | Unit No | Type | Capacity KW | Qty | Model | Unit Price | Total Price $ |
|---|---------|------|-------------|-----|-------|-----------|----------------|

**Behavior:**
- Tech picks Model from dropdown/autocomplete (all 97 GCHV models from price_list)
- On model select → AUTO-FILL:
  - `Unit Price` ← `price_usd` from price_list
  - `Capacity KW` ← `capacity_kw` from price_list (0 = "—" for HRVs)
  - `Type` ← derived from `description`:
    - "Wall mounted" → "Wall"
    - "Cassette type" → "Cassette"
    - "Ducted type" → "Ducted"
    - "VRF" + "outdoor" → "VRF Outdoor"
    - "Heat Recovery Ventilator" → "HRV"
- Tech ONLY types Qty
- `Total Price = Qty × Unit Price` (live)
- Group rows visually: Indoor Units (wall/cassette/ducted) above, Outdoor Units (VRF outdoor) below

**Auto-computed rows (non-editable):**
- Y-Branch: `qty = MAX((sum of all unit qtys − 2) × 2, 0)`, unit price = $60 (editable)
- Total Price row
- Total Price after Discount X% (discount editable)

**Keyboard:** Tab/Enter between cells, Enter on last column adds a new row, duplicate-row button.

### Part B — Official Quote PDF

One button. PDF mirrors the Excel quote. Template fields (saved, never retyped):

```
Header:    "Commercial Offer For VRF"
Sub:       "please find the financial offer"
From:      Heliopolis For Investment
Date:      [auto today]
To:        [client name from BOQ]
PI No.:    [boq_number auto]
Supplier:  GUANGDONG CARRIER HEATING, VENTILATION AND AIR CONDITIONING

[Units table from grid]

Inclusions:
• Supply and installation of a complete central VRF system
• Commissioning and startup
• 3-year manufacturer warranty on compressor and main components
• Technical offer and design drawings included

Exclusions:
• Builder's work (walls, ceilings, false ceilings)
• Copper pipes, fittings, and insulation
• Power and water supply at site
• Electrical works and control panel
• Drain piping, fittings, and cable tray
• Separate power supply with dedicated circuit breaker
• Maintenance contract and spare parts after warranty period
• Any items not listed in this offer
• Taxes and customs clearance

Terms:
• 10% Down Payment
• 90% Upon Delivery

Validity: 7 days from date of issue

Signatures: Sales Engineer | Sales Manager | Financial Director
```

### Files to change

| File | Change |
|---|---|
| `app/(dashboard)/boq/[id]/page.tsx` | Remove `LoadCalculator`, `ProductCatalog`; new simplified layout |
| `components/boq/BOQEditor.tsx` | New grid columns (Unit No, Type, Capacity KW, Qty, Model, Unit Price, Total) |
| `components/boq/BOQDocument.tsx` | New PDF template matching Excel quote exactly |
| `components/boq/LoadCalculator.tsx` | DELETE |
| `components/boq/ProductCatalog.tsx` | DELETE |

### Acceptance test
1. Go to `/boq/new`
2. Pick model `GCHV-D22G/HR1-GSB` → Type="Wall", Capacity=2.2, Price=$462 auto-fill
3. Set Qty=3 → Total = $1,386
4. Add outdoor unit `CHV-DH080W/R1` → Type="VRF Outdoor", Capacity=8, Price=$1,771
5. Y-Branch auto-shows: qty = (3+1-2)×2 = 4, $60 each = $240
6. Set discount 5% → Total after discount computes live
7. Click PDF → downloads branded quote with all template text
8. Time the whole flow — must be faster than filling the Excel sheet

---

## OPENCODE DELEGATION

Three command files are created in `.opencode/commands/`:
- `stage1-foundation.md` → apply migrations + fix seed
- `stage2-ai-shell.md` → AI-first shell restructure  
- `stage3-boq.md` → BOQ simplification

Run them in order. Wait for confirmation after each stage.
