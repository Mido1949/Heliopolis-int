# Stage 3 — BOQ Simplification

## Prerequisites
Stage 1 must be complete: `price_list` table populated with 97 GCHV models.

## Your role
You are the coder. Replace the current BOQ with a simple entry grid + branded PDF.
The Tech team abandoned the in-app BOQ for Excel because it was too complex.
This stage makes it SIMPLER than Excel, not more complex.

## Critical rules
- NO load calculator. The `LoadCalculator` component must be DELETED.
- NO product catalog panel. The `ProductCatalog` component must be DELETED.
- The ONLY input a tech makes is: (1) select a model, (2) type a qty.
- Everything else auto-fills or auto-computes.
- Keyboard-first: Tab/Enter navigation, Enter adds row.
- The PDF must mirror the Excel quote — a client who receives it should not notice
  a difference from the Excel version.

---

## Task A — Clean up BOQ page

In `app/(dashboard)/boq/[id]/page.tsx`:
1. Remove all `LoadCalculator` imports and usage
2. Remove all `ProductCatalog` imports and usage
3. The page layout becomes: Summary panel (left) + BOQ grid (center/right)
4. Keep: save draft, load existing BOQ, customer selector, WhatsApp button

Delete files:
- `components/boq/LoadCalculator.tsx`
- `components/boq/ProductCatalog.tsx`

---

## Task B — New BOQ grid

Rewrite `components/boq/BOQEditor.tsx` with this exact column order:

| Column | Width | Behavior |
|--------|-------|----------|
| # | 40px | Row number, auto |
| Unit No | 80px | Editable text (e.g. "IDU-1") |
| Type | 100px | Read-only, auto-filled from model description |
| Capacity KW | 100px | Read-only, auto-filled from price_list.capacity_kw; show "—" if 0 |
| Qty | 80px | InputNumber, editable |
| Model | 220px | AutoComplete from price_list; selecting triggers auto-fill |
| Unit Price | 120px | Read-only, auto-filled from price_list.price_usd |
| Total Price $ | 130px | Read-only, Qty × Unit Price, live |
| (actions) | 80px | Duplicate row, delete row |

**Type derivation from description** (case-insensitive):
```typescript
function deriveType(description: string): string {
  const d = description.toLowerCase();
  if (d.includes('heat recovery ventilator') || d.includes('hrv')) return 'HRV';
  if (d.includes('wall mounted') || d.includes('wall-mounted')) return 'Wall';
  if (d.includes('cassette')) return 'Cassette';
  if (d.includes('vrf') && d.includes('outdoor')) return 'VRF Outdoor';
  if (d.includes('mini vrf') && d.includes('outdoor')) return 'Mini VRF Outdoor';
  if (d.includes('ducted') || d.includes('duct')) return 'Ducted';
  return 'Unit';
}
```

**Visual grouping**: Add a non-editable section header row:
- "Indoor Units" before first wall/cassette/ducted row
- "Outdoor Units" before first VRF/Mini VRF outdoor row
- "Accessories / HRV" before first HRV or non-unit row

Grouping is visual only — it does NOT affect data storage or totals.

**Auto-computed rows at bottom** (styled differently, not editable except where noted):

1. Y-Branch row:
   - Model: "KHRP26A22C" (fixed)
   - Type: "Y-Branch"
   - Qty: `MAX((sum of all unit Qty values) − 2) × 2, 0)` — computed live
   - Unit Price: $60 (editable — admin may override)
   - Total: Qty × Unit Price

2. Grand Total row: sum of all line totals including Y-Branch

3. Discount row: "Total after discount [___]%"
   - Discount % is editable (default 0)
   - Shows: Grand Total × (1 - discount/100)

**Keyboard behavior**:
- Tab moves to next cell
- Enter on last column (Total) adds a new empty row
- Escape cancels a cell edit
- Ctrl+D duplicates current row

---

## Task C — Rewrite BOQ PDF template

Rewrite `components/boq/BOQDocument.tsx` to match the Excel quote layout exactly.

### PDF content (in order):

```
[Logo: "HELIOMAX" text, large, color #0D2137]
[Subheading: "GCHV EGYPT" in #D72B2B]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Commercial Offer For VRF

please find the financial offer

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

From: Heliopolis For Investment
Date: [today's date]
To: [customer name]
PI No.: [boq_number]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Supplier: GUANGDONG CARRIER HEATING, VENTILATION AND AIR CONDITIONING

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[TABLE: all rows from the grid]
Columns: Type | Capacity KW | Qty | Model | Unit Price | Total Price $
Include section headers: Indoor Units / Outdoor Units (as table sub-headers)
Include Y-Branch row
Include Total row
Include "Total after discount X%" row

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Scope of Supply includes:
• Supply and installation of a complete central VRF air-conditioning system
• Commissioning and startup of all equipment
• 3-year manufacturer warranty on compressor and main components
• Technical offer and design drawings included

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Exclusions:
• Builder's work (walls, ceilings, false ceilings)
• Copper pipes, fittings, and insulation
• Power supply and water supply at site
• Electrical works and control panel
• Drain piping, fittings, and cable tray
• Separate power supply with dedicated circuit breaker for each outdoor unit
• Maintenance contract and spare parts after warranty period
• Any items not listed in this offer
• Taxes and customs clearance (as per local regulations)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Payment Terms:
• 10% Down Payment upon contract signing
• 90% Upon Delivery of equipment

Validity: This offer is valid for 7 days from the date of issue.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Signatures:

Sales Engineer          Sales Manager          Financial Director
_______________         _______________        _______________
```

Use `@react-pdf/renderer` (already installed). All template text is hardcoded in the component
(never re-entered by the tech — this is the whole point).

The "Export PDF" button is already on the BOQ page — just wire it to the updated `BOQDocument`.

---

## Acceptance test (do this manually after implementing)

1. Go to `/boq/new`
2. Type "GCHV-D" in the Model field → should show autocomplete with GCHV wall models
3. Select `GCHV-D22G/HR1-GSB`:
   - Type shows: "Wall"
   - Capacity KW shows: 2.2
   - Unit Price shows: $462.00
4. Set Qty = 3 → Total shows $1,386.00
5. Add row: select `CHV-DH080W/R1` → Type="VRF Outdoor", Cap=8kW, Price=$1,771
6. Y-Branch auto-shows: qty = (3+1-2)×2 = 4, $60 each = $240
7. Grand Total = $1,386 + $1,771 + $240 = $3,397
8. Set discount 5% → shows $3,227.15
9. Click Export PDF → PDF downloads, opens, has:
   - "Commercial Offer For VRF" at top
   - Both model rows in the table
   - Y-branch row
   - All inclusions / exclusions text
   - Signatures area
10. Time it: picking 2 models + PDF export should be under 3 minutes total

## Report when done
List every file created, modified, or deleted.
State whether the acceptance test passed or failed, step by step.
