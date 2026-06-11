# Quickstart & Validation Guide: HelioMax Platform

**Branch**: `002-heliomax-platform` | **Date**: 2026-06-04

This guide validates each phase end-to-end. Run these checks after implementing each phase.

---

## Prerequisites

- Node.js 20.x
- `npm install --legacy-peer-deps`
- Supabase project URL and anon key in `.env.local`
- Vercel CLI (for cron testing): `npm i -g vercel`

---

## Phase 0: Rebrand Validation

```bash
# Must return zero results
grep -ri "loomark\|heliopolis int" \
  app/ components/ lib/ context/ hooks/ types/ package.json \
  --include="*.ts" --include="*.tsx" --include="*.json"

# App must build cleanly
npm run build
```

**Expected**: Grep returns nothing. Build succeeds with no TS errors.

---

## Phase 1: Session Stability Validation

1. Log in to the app
2. Open DevTools → Application → Local Storage → verify Supabase session key present
3. Navigate between CRM, BOQ, Tasks, Dashboard 10 times rapidly
4. Wait 30 minutes (or mock token expiry by manipulating localStorage expiry)
5. Perform any action (add a lead, open BOQ)

**Expected**: No auth redirect, no blank screen, no "unauthorized" toast. Data operations succeed.

---

## Phase 2: Pipeline Validation

```sql
-- Run in Supabase SQL editor after migration
SELECT pipeline_stage, COUNT(*) FROM leads GROUP BY pipeline_stage;
-- Should show all existing leads mapped to the 9-stage pipeline
```

**UI checks**:
1. Open CRM → Kanban view → should show 9 columns (NEW through POSTPONED)
2. Drag a lead to WON → system prompts for deal_value → enter value → lead moves
3. Drag a lead to WON without deal_value → save should be blocked
4. Log in as a CS user → open CRM → confirm only their own leads visible
5. Log in as Admin → open Pipeline dashboard → see conversion rate, active count, pipeline value

**RLS check**:
```bash
# From a CS user's Supabase session, run:
# SELECT * FROM leads WHERE assigned_to_user != '<cs_user_id>';
# Must return zero rows
```

---

## Phase 3: BOQ Engine Validation

**Speed test** (timed):
1. Create a new BOQ linked to a test lead
2. Add 5 rooms in the load calculator using Tab navigation only
3. Add 8 line items in the BOQ grid using Tab navigation only (type model → autocomplete → select → Tab to qty)
4. Set 25% discount
5. Click Export PDF

**Expected**:
- Each model selection auto-fills price from price_list
- All totals (line, Y-branch, grand, discounted) update live
- PDF generates and downloads with "Commercial Offer For VRF" header
- Entire flow completes faster than equivalent Excel workflow

**Price list admin check**:
1. Log in as Admin → Settings → Price List
2. Update one model price
3. Create a new BOQ with that model → price should reflect the update

---

## Phase 4: AI Login + Reports Validation

**Login flow**:
1. Clear localStorage (or use incognito)
2. Open app → AI should greet with name question
3. Type your name → AI asks for password → a masked input field appears in the chat
4. Inspect browser console → confirm no password string in logs
5. Inspect network tab → confirm password not in any AI API call payload
6. Enter password → app loads daily tasks view

**Session persistence**:
1. Log in successfully
2. Close browser tab
3. Reopen app → should skip login and go directly to tasks view

**Personal report** (manual trigger):
```bash
curl -X POST http://localhost:3000/api/reports/personal/cron \
  -H "Authorization: Bearer $CRON_SECRET"
```
**Expected**: All active users receive a notification to download their report. PDF contains correct activity data.

---

## Phase 5: Company Report Validation

```bash
curl -X POST http://localhost:3000/api/reports/company/cron \
  -H "Authorization: Bearer $CRON_SECRET"
```

**Expected**:
- Admin (Mido) receives an email or Telegram message within 2 minutes
- Message contains: pipeline snapshot, team performance, won/lost today, stuck-lead flags, AI insight paragraph
- Stuck leads flagged are those with `stage_timestamps` showing > 3 days in the same stage

---

## Phase 6: Automation Validation

**Auto intake**:
1. Run scraper (or POST mock data to `/api/automation/intake`)
2. Open CRM as Admin → new leads appear with `pipeline_stage=NEW`
3. Verify a call task was auto-created for the assigned CS user

**AI re-assignment**:
1. Log in as a CS user
2. Type "assign to tech" in AI assistant for a specific lead
3. Log in as the Tech Team Lead
4. Verify: lead now shows `assigned_team=tech`, `pipeline_stage=ASSIGNED_TECH`, notification received
