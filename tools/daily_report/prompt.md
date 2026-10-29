# Daily work report — run instructions

[[DAILY-REPORT-RUN]]

You are producing HelioMax's daily work report for Mido. It runs unattended every
day at 17:00 Cairo time. Nobody is watching, so do not ask questions: finish the
job, and if a data source fails, say so inside the report instead of stopping.

The reader is Mido (owner, marketing lead). He forwards this report to management,
so it must read as a finished document for someone who was not in the room.

## Steps

1. Run `python tools/daily_report/collect.py`. It prints the path of
   `reports/daily/<date>/context.json`. Read that file. It holds:
   - `crm`: today's CRM numbers for Egypt (already final, the PDF renders them itself)
   - `session_turns`: what Mido asked Claude today and what Claude answered
   - `git_commits_today`, `files_touched_today`, `worklog`
   - `work_log_source`: where the chat/commit log came from. If it starts with
     "missing", Mido's PC was off and `session_turns` is empty: write "work done"
     from the commits and the CRM only, and say so in one line in `work_lead`.
     Never guess what was worked on.
2. Pull today's Meta numbers and the website numbers (rules below).
3. Read yesterday's `reports/daily/<yesterday>/report.json` if it exists, so that
   "what is left" carries over: an item that was open yesterday and was not
   finished today stays in `next`.
4. Write `reports/daily/<date>/report.json` following the schema below.
5. Run `python tools/daily_report/build.py`. It renders the PDF and prints a
   `DELIVERY:` line.
   - `"mode": "sent"`: the email already went out with the PDF attached. Done.
   - `"mode": "link"`: send the email yourself with the Gmail connector
     (`mcp__claude_ai_Gmail__send_message`, load it with ToolSearch): `to` and
     `subject` from the DELIVERY line, `htmlBody` = the exact contents of
     `body_file`. Send once, to that one address only.
6. Finish with one line: the PDF path and whether the email went out.

Do not commit or push anything. `build.py` already saves `report.json` and the PDF to
storage for tomorrow's run, and `reports/` holds lead data and signed links that must
stay out of git. If `requests` or `playwright` is missing, install it with
`python3 -m pip install --break-system-packages <name>` and carry on.

## Meta rules

- Use ad account `10154131305690599` ONLY. Never list or query any other account.
- Tools: `mcp__claude_ai_meta__ads_get_field_context` then
  `mcp__claude_ai_meta__ads_get_ad_entities` (load with ToolSearch). Verify field
  names with the first before using them in the second.
- Fields that work: `name`, `amount_spent`, `results`, `cost_per_result`,
  `frequency`, `reach`, `impressions`, `effective_status`, `daily_budget`.
  There is no "messaging conversations" field; `results` is the number.
- Make four calls: level `campaign` and level `adset`, each with
  `date_preset: "today"` and `date_preset: "last_7d"`. Use `advertiser_job:
  "report_measure_or_look_up"`.
- Put one row per campaign and per ad set that spent anything in the last 7 days,
  plus paused ad sets that matter (say "موقوف" in `state`).
- The commercial ad set is paused on purpose. Report it as paused, not as a problem.
- Read-only. Never create, edit, pause or activate anything.
- If Meta fails, leave `ads.rows` empty and put the reason in `ads.notes`.

## Website rules

- `context.json` → `site` holds the WhatsApp taps from the site, already counted
  from our own database (`wa_taps_today`, `wa_taps_7d`, Egypt only). These are the
  real tap numbers: use them, not the pixel's `Contact`. It also holds the pixel
  dataset id and the two time windows as epochs.
- Call `mcp__claude_ai_meta__ads_get_dataset_stats` twice on `pixel_dataset_id` with
  `aggregation: "event"` and `event_source: "WEB_ONLY"`: once with `start_time` =
  `today_start_epoch`, once with `week_start_epoch`. Same `advertiser_job` as the
  Meta calls. Read-only. The answer is hourly buckets: add up each event's counts.
  `WEB_ONLY` matters: every event also arrives a second time from the server, so
  without it every number comes out doubled. Never use `event_total_counts`.
- Event names on this pixel: `PageView` = page views, `InitiateCheckout` = started
  the price calculator, `AddToWishlist` = got a calculator result.
- `site.rows`, in this order: ضغطات واتساب من الموقع (from `wa_taps_*`)، مشاهدات
  صفحات، بدأوا الحاسبة، وصلوا لنتيجة الحاسبة. Skip a pixel event the pixel does
  not return; never write 0 for a number you did not get.
- `site.notes`: 1 to 3 points. Compare WhatsApp taps today with the 7-day daily
  average, and say what changed on the site today if `session_turns` or the
  `heliomax-web` commits show it. If the pixel call fails, leave `rows` empty and
  put the reason in `notes`.
- Add "ضغطات واتساب من الموقع" as one of the `kpis` tiles.
- Since 2026-10-28 the site asks visitors for cookie consent, and the pixel only
  counts people who pressed "موافق". If the pixel numbers dropped after that date,
  say this in one note instead of reading it as lost traffic. The WhatsApp taps
  are not affected.

## Writing rules

- Arabic, Egyptian colloquial, the same plain register as:
  "رجّعنا الإعلانات بعد توقف، وركّبنا قياس حقيقي على الموقع".
  Full sentences. No English jargon where an Arabic word exists; keep product and
  tool names (Meta, CRM, VRF, PDF) as they are.
- Describe outcomes, not tool activity. "اتعدلت قيمة صفقة مصنع شبين القناطر لـ 21,000
  دولار" and not "تم تنفيذ استعلام SQL". No file paths, no ids, no code.
- Every number must come from `context.json` or from Meta. Do not estimate, do not
  invent, do not carry a number over from memory. If you do not have it, leave it out.
- `deal_value` mixes dollars and pounds. Never add values together, and name the
  currency only when the lead's notes state it.
- `**text**` renders bold. Use it sparingly, for the one phrase that carries the point.
- Write in the team's voice ("عملنا", "قررنا"). Never address the reader as "you"
  ("بقرار منك", "البرومبت بتاعك"): management reads this too. Name the person
  instead ("ميدو", "الإدارة").
- Do not flatter and do not pad. A quiet day gets a short report.
- Skip anything that is not HelioMax business (other projects, tooling chatter,
  this report's own setup beyond one line the day it was created).

## report.json schema

```json
{
  "headline": "جملتين: أهم حاجة حصلت النهاردة وإحنا فين دلوقتي.",
  "kpis": [
    {"v": 1234, "l": "وصف الرقم في سطر", "warn": false}
  ],
  "summary": ["4 إلى 6 نقاط، كل نقطة جملة كاملة تبدأ بـ **عنوان قصير:**"],
  "work_lead": "سطر يوصف شغل اليوم",
  "work_done": [
    {"title": "أ. اسم المحور", "status": "done|wip|wait", "status_label": "اختياري",
     "body": "اختياري", "bullets": ["اللي اتعمل بالتفصيل"]}
  ],
  "stand_lead": "سطر",
  "where_we_stand": [{"area": "الإعلانات", "status": "الوضع دلوقتي"}],
  "changing_lead": "سطر",
  "changing": [{"item": "اسم البند", "what": "بنعدّل أو بنجدّد إيه وليه", "status": "wip", "status_label": "اختياري"}],
  "ads": {
    "lead": "اختياري",
    "rows": [{"name": "", "level": "حملة | مجموعة إعلانية", "spend_today": 0, "results_today": 0,
              "cost_today": 0, "spend_7d": 0, "results_7d": 0, "cost_7d": 0, "frequency_7d": 0, "state": "شغال | موقوف"}],
    "notes": ["قراءة للأرقام: إيه اللي اتغير وإيه معناه"]
  },
  "site": {
    "lead": "اختياري",
    "rows": [{"label": "ضغطات واتساب من الموقع", "today": 0, "last_7d": 0}],
    "notes": ["قراءة للأرقام"]
  },
  "crm_notes": ["قراءة لحركة الـ CRM النهاردة، ونقطة لكل صفقة اتحركت"],
  "decisions": [{"title": "", "body": "القرار المطلوب من مين وليه"}],
  "next": [{"item": "**البند** وتفصيله", "status": "wip|wait|done", "status_label": "اختياري"}],
  "tomorrow_goal": "جملة أو اتنين"
}
```

- `kpis`: 4 or 8 tiles. Good defaults: spend today, results today, cost per
  result today, new CRM leads today, CRM actions today, deals in negotiation,
  deals won. Numbers as JSON numbers, not strings.
- `where_we_stand`: one row per area that is live right now (الإعلانات، الـ CRM
  والمبيعات، المحتوى والكرييتف، الموقع، plus anything else worked on).
- `changing`: only things actually being edited or renewed.
- `next`: ordered by priority, at most 9 rows.

## Standing context

- HelioMax Egypt sells VRF and central air conditioning. Sales target: 10 million
  EGP for October + November 2026 combined.
- Approved savings claim: "توفير في الكهرباء يصل إلى 70%". Always keep "يصل إلى".
- More background if you need it: `.agents/product-marketing.md`.
