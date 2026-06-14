# HelioMax

Internal operations platform for HelioMax (HVAC — Egypt/KSA): CRM with a 9-stage lead pipeline, BOQ quoting engine (GCHV price list), Helio AI assistant, automated reports, and lead automation.

**Stack**: Next.js 14 App Router + TypeScript · Supabase (Postgres/RLS/Auth) · Ant Design 5 + Tailwind · Anthropic Claude · Vercel.

## Getting Started

```bash
npm install --legacy-peer-deps   # required — do not plain `npm install`
cp .env.local.example .env.local # fill in real values
npm run dev                      # http://localhost:3000
```

Spec-driven development: active implementation is declared in `AGENTS.md`; specs live under `specs/`; governing principles in `.specify/memory/constitution.md` (non-negotiable).

## Deployment (Vercel)

Install command must be `npm install --legacy-peer-deps` (set in `vercel.json`).

### Required environment variables

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client Supabase access |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side jobs (never client-side) |
| `CRON_SECRET` | **Required for all scheduled jobs.** Vercel sends it as `Authorization: Bearer …` on cron invocations; cron routes fail closed without it |
| `WEBHOOK_SECRET` | Dedicated bearer secret for `/api/automation/intake` (external scraper webhook) |
| `ANTHROPIC_API_KEY` | Helio AI (chat + autonomy engine) |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | Company report delivery + ops failure alerts |
| `RESEND_API_KEY` / `ADMIN_EMAIL` | Company report email |
| `META_WEBHOOK_VERIFY_TOKEN` / `META_APP_SECRET` | Meta Lead Ads webhook |
| `APIFY_API_TOKEN` | Lead scraper (optional — mock data without it) |

### Scheduled jobs

Crons are defined in `vercel.json` (UTC, HTTP GET). Handlers contain Cairo-time guards (Africa/Cairo, Sat–Thu working week) — see `specs/004-helio-command-center/contracts/cron-endpoints.md` for windows and exactly-once semantics.

| Job | Endpoint | Cairo window | Days |
|---|---|---|---|
| Personal daily report | `/api/reports/personal/cron` | 15:50 | Sat–Thu |
| Company daily report | `/api/reports/company/cron` | 15:50 | Sat–Thu |
| Stuck-lead nudges | `/api/reports/stuck-leads/cron` | 08:00 | Sat–Thu |
| Helio autonomy brain | `/api/agent/brain/cron` | 10:00 & 14:00 | Sat–Thu |
| Weekly lead scrape | `/api/scraper/cron` | 08:00 | Sat only |

Dual UTC hours per job cover Egypt DST (EET/EEST); the in-handler Cairo guard runs exactly one of each pair. Out-of-window hits return `200 {skipped}` (not an error). Server failures (5xx) fire a Telegram ops alert via `withCronAlert`; auth rejections (401) do **not** alert.

### Helio (the AI command brain)

Helio is an Anthropic tool-use agent (`claude-sonnet-4-6`, Haiku fallback) reachable from the chat. Tools are role-scoped (member / team-lead / admin):

| Tool | Scope | What it does |
|---|---|---|
| `query_leads` | member | Search leads (stage, assignee, stuck, text) |
| `pipeline_stats` | member | Stage distribution, conversion, pipeline value |
| `team_performance` | lead | Per-member calls / leads / tasks / won value |
| `assign_lead` | lead | Assign a lead to a team/person (records an undoable action) |
| `create_task` | member | Create a task (members → self only) |
| `nudge_user` | lead | Send a reminder notification to a teammate |
| `schedule_followup` | member | Create a "متابعة" task + set follow-up date |
| `generate_report_now` | lead | Run a personal/company report on demand |
| `queue_scrape_target` | admin | Add a target to the Saturday scrape queue |
| `list_my_actions` | lead | "what did you do today?" timeline |

**Autonomy engine** (brain cron) reviews stuck leads, overdue tasks, missing first-call tasks, and workload imbalance, then acts on its own — nudging, escalating (7+ days → team lead), creating call tasks, and lightly rebalancing. Every autonomous action is logged to `agent_actions` and a digest is sent to admins (in-app + Telegram).

### Mido control surface — `/helio`

- **Action timeline**: every Helio action (chat + autonomous) with reasoning.
- **Undo**: reversible actions (assign, rebalance, create-task, schedule-followup) have an Undo button; it 409s if the live state drifted from what Helio recorded.
- **Autonomy settings** (admin): pause/resume autonomy, stuck-threshold days, nudge suppression hours — stored in `agent_settings`.

### Weekly scrape queue

Add targets via Helio chat (`queue_scrape_target`) or the **Scraper page → "قائمة السبت"** form. Saturday 08:00 Cairo the cron runs queued targets through Apify (mock without `APIFY_API_TOKEN`), feeds results into round-robin intake, spreads first-call task due-dates across Sat–Thu, and sends Mido a summary (created / duplicates / errors / per-rep).
