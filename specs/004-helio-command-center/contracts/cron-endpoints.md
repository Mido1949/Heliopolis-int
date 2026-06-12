# Contract: Cron Endpoints

Applies to: `app/api/reports/personal/cron`, `app/api/reports/company/cron`, `app/api/reports/stuck-leads/cron`, `app/api/agent/brain/cron` (new), `app/api/scraper/cron` (new).

## Shared requirements (lib/cron/guard.ts)

```ts
verifyCronAuth(request): boolean
// Bearer token === process.env.CRON_SECRET; fail-closed (no secret set ⇒ always 401/403).

cairoNow(): { weekday: 'Sat'|'Sun'|'Mon'|'Tue'|'Wed'|'Thu'|'Fri', hour: number, minute: number, dateISO: string }
// Intl.DateTimeFormat with timeZone 'Africa/Cairo'.

isCairoWindow(opts: { hour: number, minute: number, toleranceMin?: number, days: Weekday[] }): boolean
// true only when cairoNow() matches hour:minute ± tolerance (default 5) AND weekday ∈ days.

withCronAlert(jobName: string, handler: () => Promise<NextResponse>): Promise<NextResponse>
// try/catch wrapper; on throw or non-2xx: sendOpsAlert(`🚨 ${jobName} failed: ${error}`) then rethrow/return 500.
```

## HTTP contract (every cron route)

| Aspect | Requirement |
|---|---|
| Methods | `GET` (Vercel cron) and `POST` (manual trigger) — both call the same shared `handle()` |
| Auth | `Authorization: Bearer $CRON_SECRET`; 401/403 otherwise (fail-closed) |
| Out-of-window call | 200 with `{ ok: true, skipped: 'outside_window' }` (NOT an error — the dual-UTC schedule guarantees one in-window and one out-of-window hit daily) |
| Already-ran-today | 200 with `{ ok: true, skipped: 'already_sent' }` |
| Success | 200 with job-specific summary JSON |
| Failure | 500 `{ error }` AND Telegram ops alert fired |
| Runtime | `export const dynamic = 'force-dynamic'` retained |

## Schedules (vercel.json)

```json
{ "path": "/api/reports/personal/cron",   "schedule": "50 12,13 * * *" },
{ "path": "/api/reports/company/cron",    "schedule": "50 12,13 * * *" },
{ "path": "/api/reports/stuck-leads/cron","schedule": "0 5,6 * * *" },
{ "path": "/api/agent/brain/cron",        "schedule": "0 7,8,11,12 * * *" },
{ "path": "/api/scraper/cron",            "schedule": "0 5,6 * * 6" }
```

In-handler windows (Cairo local, days Sat–Thu unless noted):

| Job | Window |
|---|---|
| personal report | 15:50 |
| company report | 15:50 (delivery after personal is acceptable; they are independent) |
| stuck-leads | 08:00 |
| agent brain | 10:00 AND 14:00 (two valid windows/day) |
| scraper | Sat 08:00 only (cron already restricted to UTC Saturday; guard re-checks Cairo Saturday) |

Note: dual UTC hours cover EEST (UTC+3) and EET (UTC+2). For each pair, exactly one matches the Cairo window on any given date; the guard rejects the other. The agent brain lists four UTC hours = two Cairo windows × two offsets.

## Exactly-once semantics

- personal: per user, skip if a `notifications` row `type='personal_report'` exists for that user with `created_at::date = today` (Cairo date).
- company: skip if a `notifications` row `type='company_report_sent'` for admin exists today (insert this marker row on success).
- brain: suppression is per-action (24h window), runs themselves are not deduped — two runs/day is intended.
- scraper: targets transition `queued→running→done`; a second Saturday hit finds no `queued` targets ⇒ `{ ok: true, skipped: 'no_queued_targets' }`.
