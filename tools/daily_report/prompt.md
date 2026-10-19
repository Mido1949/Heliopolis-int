# Daily work report — run instructions

[[DAILY-REPORT-RUN]]

You are producing HelioMax's daily work report for Mido. It runs unattended every
day at 16:00 Cairo time. Nobody is watching, so do not ask questions: finish the
job, and if a data source fails, say so inside the report instead of stopping.

The reader is Mido (owner, marketing lead). He forwards this report to management,
so it must read as a finished document for someone who was not in the room.

## Steps

1. Run `python tools/daily_report/collect.py`. It prints the path of
   `reports/daily/<date>/context.json`. Read that file. It holds:
   - `crm`: today's CRM numbers for Egypt (already final, the PDF renders them itself)
   - `session_turns`: what Mido asked Claude today and what Claude answered
   - `git_commits_today`, `files_touched_today`, `worklog`
2. Pull today's Meta numbers (rules below).
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
