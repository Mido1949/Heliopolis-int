# Quickstart Validation Guide: Phase 6

## Prerequisites

- App running: `npm run dev` (localhost:3000)
- Logged in as Admin or Tech Lead (e.g., test@heliomax.com)
- Supabase project: `wrmqrvqixtrasajjfbge`

---

## Test 1: Price List Editor (Smoke Test)

1. Login → Settings → tab "قائمة الأسعار"
2. Verify: table of 97 models loads
3. Click edit on any row → change price → save
4. Go to BOQ → new quote → select that model → verify new price appears
5. Login as normal user (CS) → verify Settings tab exists but price list edit is disabled

**Expected**: ✅ Already works — this is a smoke test only.

---

## Test 2: Notification Bell

1. Login as any user
2. Verify: bell icon appears in top-right of shell header
3. From Supabase dashboard, manually insert a notification row:
   ```sql
   INSERT INTO notifications (user_id, message, read)
   VALUES ('<your-user-id>', 'تجربة إشعار 🔔', false);
   ```
4. Wait up to 30 seconds (polling interval) or refresh
5. Verify: bell shows badge with count "1"
6. Click bell → panel opens → notification visible
7. Click "تعليم الكل كمقروء" → badge disappears

---

## Test 3: Assignment Notification

1. Login as Admin
2. Open CRM → pick any lead → change "Assigned To" field to another user
3. Login as that other user in another browser
4. Verify: bell badge appears within 30 seconds with "📋 تم تحويل [name] إليك"

---

## Test 4: Stuck Leads Cron

1. From Supabase dashboard, manually update a lead:
   ```sql
   UPDATE leads SET updated_at = NOW() - INTERVAL '4 days'
   WHERE pipeline_stage = 'CONTACTED' AND assigned_to_user IS NOT NULL
   LIMIT 1;
   ```
2. Trigger the cron manually (dev only):
   ```bash
   curl -X POST http://localhost:3000/api/reports/stuck-leads/cron \
     -H "Authorization: Bearer <CRON_SECRET>"
   ```
3. Login as the lead's assigned user
4. Verify: bell badge shows "⚠️ [name] واقف في CONTACTED منذ 4 أيام"
5. Run curl again — verify NO duplicate notification created

---

## Test 5: Auto Task Creation

1. Login as normal user (Sales Engineer)
2. Use AI shell to register a new lead: "سجل عميل جديد"
3. Complete the flow with all fields
4. Go to Tasks page
5. Verify: task "اتصل بـ [name]" appears, type "call", due today, assigned to current user

---

## Test 6: system-approval Knowledge Base

1. Create `system-approval/pricing.md`:
   ```markdown
   # سياسة التسعير
   وحدة الكاسيت 24 ألف BTU = 850 دولار
   ```
2. Restart dev server (or deploy — reads at request time)
3. Login → ask Helio: "كام سعر الكاسيت 24 ألف؟"
4. Verify: Helio answers "850 دولار" (not a generic AI answer)
5. Delete the file → ask again → Helio says it doesn't have pricing info

---

## Smoke Test (No Breakage)

After all tasks are complete, verify existing features still work:
- [ ] Login via AI (conversational login)
- [ ] BOQ: create a quote, export PDF
- [ ] CRM: add lead, move stage
- [ ] My Leads page loads
- [ ] Dashboard loads
- [ ] Personal report API: `GET /api/reports/personal`
- [ ] Build passes: `npm run build`
