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
