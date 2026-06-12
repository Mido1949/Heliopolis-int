# Quickstart: Verification Scenarios

Prerequisites: `npm install --legacy-peer-deps`; `.env.local` with Supabase keys, `ANTHROPIC_API_KEY`, `CRON_SECRET`, `WEBHOOK_SECRET` (new), Telegram vars. Dev server: `npm run dev` (port 3000). Replace `$CRON` with the CRON_SECRET value.

## Gate for every phase

```powershell
npm run build       # must be green WITH checks enabled (after A5)
```
Smoke: log in, open dashboard / CRM / BOQ / reports / tasks / scraper — all load (constitution VII).

## Phase A — hardening

```powershell
# 1. Crons answer GET (in Cairo window they run; outside they skip — both are 200):
curl -X GET http://localhost:3000/api/reports/stuck-leads/cron -H "Authorization: Bearer $CRON"
# expect {"ok":true,...} or {"ok":true,"skipped":"outside_window"} — NEVER 405

# 2. No secret ⇒ fail closed:
curl -X GET http://localhost:3000/api/reports/stuck-leads/cron          # expect 401/403

# 3. Auth holes closed (logged out):
curl http://localhost:3000/api/files/SOME-UUID/signed-url               # expect 401
curl http://localhost:3000/api/boq/pdf?id=SOME-UUID                     # expect 401
curl http://localhost:3000/api/boq/SOME-UUID/rooms                      # expect 401
# Logged in as a CS member, request another member's BOQ rooms          # expect 403/404

# 4. Intake rejects service-role key as bearer, accepts WEBHOOK_SECRET:
curl -X POST http://localhost:3000/api/automation/intake -H "Authorization: Bearer <service-role-key>" -d "[]"   # expect 401
curl -X POST http://localhost:3000/api/automation/intake -H "Authorization: Bearer $env:WEBHOOK_SECRET" -H "Content-Type: application/json" -d "[]"  # expect 200

# 5. Meta webhook logs: grep the route file — zero matches:
#    grep -nE "console\.log.*(token|hex|signature|rawBody)" app/api/meta/webhook/route.ts

# 6. Build gate: introduce `const x: number = 'a'` in any file ⇒ npm run build FAILS; revert.

# 7. Rate limit: 31 rapid POSTs to /api/agent/chat as a member ⇒ 31st returns the friendly refusal.

# 8. Repo: build*.log/txt gone from git ls-files; 003_boq_rooms.sql deleted.
```

## Phase D — Cairo 15:50 reports

```powershell
# Temporarily set window tolerance high OR test at the right local time:
curl -X GET http://localhost:3000/api/reports/personal/cron -H "Authorization: Bearer $CRON"
# in-window ⇒ notifications type='personal_report' created for each profile, once;
# second call same day ⇒ {"skipped":"already_sent"}
# Friday (or out of window) ⇒ {"skipped":"outside_window"}
# Company cron in-window ⇒ Telegram message + email to ADMIN_EMAIL.
```
Production check after deploy: Vercel → Crons → both runs listed daily; exactly one delivers.

## Phase B — Helio command center

Chat as admin (Mido):
1. "كام ليد في كل مرحلة؟" ⇒ live stage counts (tool: pipeline_stats).
2. "اعمل تاسك متابعة لليد X بكرة وكلف بيها منى" ⇒ task exists; row in agent_actions (origin=chat).
3. "ابعت تذكير لرجاء عن الليدز المتأخرة" ⇒ نotification type='nudge' for رجاء + action row.
4. "انت عملت ايه النهاردة؟" ⇒ summarizes agent_actions for today.

Chat as a CS member: ask for another member's leads ⇒ Helio returns only own data / refuses.

Autonomy engine (seed: 1 lead stuck 4 days, 1 lead stuck 8 days, 1 lead with no first-call task, 1 overdue task):
```powershell
curl -X GET http://localhost:3000/api/agent/brain/cron -H "Authorization: Bearer $CRON"
# ⇒ nudge to stuck lead's assignee; escalation to team lead for the 8-day lead;
#   auto task (auto_created=true) for the taskless lead; nudge for overdue task;
#   one agent_actions row per action; admin gets digest notification + Telegram.
# Run again immediately ⇒ all suppressed (24h window) ⇒ digest says no actions.
```

Control page `/helio` (admin): timeline shows the actions above with reasoning; Undo on the assignment/task actions works once then shows undone; pause toggle ⇒ next brain run reports paused; member visiting /helio ⇒ no access.

## Phase C — weekly scraping

1. As admin in chat: "اسحب شركات مقاولات في مدينة نصر" ⇒ scrape_targets row status=queued; visible on scraper page.
2. Unset APIFY_API_TOKEN (mock mode), then:
```powershell
curl -X GET http://localhost:3000/api/scraper/cron -H "Authorization: Bearer $CRON"
# ⇒ target → done; mock leads created (no phone dupes), round-robin across CS (±1),
#   tasks auto_created=true with due dates spread Sat–Thu; assignees notified;
#   admin gets scrape_summary notification + Telegram with counts + per-rep table.
```
3. Re-run ⇒ {"skipped":"no_queued_targets"}; re-queue same target ⇒ all results counted duplicates, 0 created.

## Phase E — UI refresh

- Dashboard/CRM/reports/BOQ: theme applied (palette/typography consistent), skeletons while loading, designed empty state on an empty table, RTL correct in Arabic.
- Throw a test error in a dashboard component ⇒ friendly error screen with retry, app shell survives; revert.
- Two browser sessions: action in one creates a notification ⇒ bell updates in the other within 5s without refresh.
- `npm run build` bundle output: first-load JS for CRM and BOQ pages did not grow; xlsx/react-pdf appear only in lazy chunks.
- AI login: full conversational login regression — identical steps, identical visuals.
