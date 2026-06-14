# Research & Decisions: Helio Command Center & Platform Hardening

All decisions below were resolved during the pre-spec code review (2026-06-12, full-codebase audit by three parallel review agents + manual verification) and an interactive owner Q&A. No NEEDS CLARIFICATION items remain.

## D1. Cron invocation method

- **Decision**: Add `GET` handlers to all cron routes via a shared `handle()` function per route; keep `POST` for manual triggering. Keep `CRON_SECRET` Bearer check (fail-closed pattern already correct).
- **Rationale**: Verified that Vercel cron invokes paths with HTTP GET (also stated in AGENTS.md Vercel best practices: "cron runs in UTC and triggers your production URL via HTTP GET"). All three existing cron routes export only POST → silent 405s. Vercel automatically sends `Authorization: Bearer $CRON_SECRET` when the env var is defined.
- **Alternatives considered**: `export { POST as GET }` — works since both read the same Request, chosen where bodies are unused; switching crons to Vercel signature header (`x-vercel-cron`) — rejected, CRON_SECRET is the documented supported pattern and already half-implemented.

## D2. Cairo-time scheduling across DST

- **Decision**: Schedule each report cron at BOTH candidate UTC times (`50 12,13 * * *` daily in vercel.json), and gate inside the handler: proceed only when `Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', ... })` shows local 15:50±5 min AND weekday ∈ {Sat,Sun,Mon,Tue,Wed,Thu}. Track exactly-once per day via a lightweight check (notification/report row for today already exists → skip).
- **Rationale**: Egypt re-adopted DST in 2023 (UTC+3 late Apr–late Oct, UTC+2 otherwise). A single UTC schedule is wrong half the year. Vercel cron has no timezone support. `Intl` with IANA zone handles DST transitions with zero dependencies.
- **Alternatives considered**: external scheduler (n8n) — adds an availability dependency for the company's most important output; editing vercel.json twice a year — guaranteed to be forgotten.

## D3. Helio agent architecture

- **Decision**: Single endpoint `app/api/agent/chat/route.ts` runs an Anthropic **tool-use loop** (max 6 iterations): `claude-sonnet-4-6`, `max_tokens: 2048`, tools defined in `lib/agent/tools.ts` with a `scope` field (`admin | lead | member`) filtered by the caller's profile role before being passed to the API. Tool executors receive the caller's RLS-scoped Supabase client (session-bound), NOT service role — DB-level isolation does the permission enforcement (constitution II). Keep existing regex fast-paths (register-lead flow, assign shortcuts) before invoking the model. Haiku fallback when Sonnet errors.
- **Rationale**: Current implementation is regex + Haiku @ 120 max_tokens — cannot be a "team controller". Tool-use is the standard Anthropic agent pattern; RLS-scoped execution means a member literally cannot read another member's leads through Helio (matches constitution: enforce at DB, not UI).
- **Alternatives considered**: Vercel AI SDK / AI Gateway — rejected: @anthropic-ai/sdk is the constitution-fixed stack and already integrated; MCP server — overkill for 10 tools in-process.

## D4. Autonomy engine

- **Decision**: Deterministic rule-based engine in `lib/agent/autonomy.ts` (no LLM call for detection): queries for (a) leads with no open auto-created first-call task, (b) overdue tasks, (c) stuck leads per `last_contact_date` threshold (default 3 days, configurable), (d) 7+ day stuck → team-lead escalation, (e) workload imbalance (max-min open-lead count > 2 → rebalance newest unworked leads). Actions executed with service role, each inserted into `agent_actions` with reasoning text. Cron `agent/brain/cron` scheduled Sat–Thu ≈10:00 & ≈14:00 Cairo (dual-UTC + guard like D2). 24h suppression per (action_type, target) via `agent_actions` lookup. Digest assembled from the run's actions → Mido in-app + Telegram.
- **Rationale**: Detection rules are crisp business rules — an LLM adds cost, latency, and nondeterminism with zero benefit; the LLM stays in the chat layer where language matters. Deterministic actions are also cleanly undoable.
- **Alternatives considered**: LLM-planned autonomous actions — rejected for auditability and constitution VIII (simplicity); n8n workflows — the hub exists but business logic lives in the codebase next to its data access.

## D5. Action audit & undo

- **Decision**: `agent_actions` table stores `action_type`, `origin` (chat|autonomous), `target_lead_id`, `target_user_id`, `task_id`, `reasoning`, `payload` JSONB (snapshot of prior state), `created_by`, `created_at`, `undone_at`. Undo endpoint validates current state still matches the action's recorded after-state before reverting (e.g., lead still assigned to whom Helio assigned it); otherwise 409 with explanation. Reversible: `assign_lead` (restore previous assignee from payload), `create_task` (cancel task). Non-reversible (nudge, escalation, digest): no undo control.
- **Rationale**: Owner chose "full autonomy + report to me" — audit + undo is the control surface that makes full autonomy safe.

## D6. Rate limiting

- **Decision**: Sliding-window check inside `agent/chat`: count caller's `agent_actions`-independent `agent_requests` rows in last 5 min (tiny table, service-role insert per request, index on `(user_id, created_at)`); limit 30/5min members, 120/5min admin. Friendly Arabic refusal on exceed. Old rows purged opportunistically.
- **Rationale**: Vercel functions are stateless (no in-memory counters); no Redis in stack; a 2-column table + index is the simplest durable window for 10 users.
- **Alternatives considered**: Vercel KV/Marketplace Redis — discontinued/new dependency; per-IP limiting — users share office IPs.

## D7. Idempotency & stuck detection

- **Decision**: Migration adds `notifications.type TEXT` and `tasks.auto_created BOOLEAN DEFAULT false` (+ indexes). Stuck-lead dedup → `type = 'stuck_lead' AND lead_id = X AND created_at > now()-24h`. Auto-task dedup → `lead_id = X AND auto_created = true AND status != 'cancelled'`. Staleness basis → `COALESCE(last_contact_date, updated_at)` (column exists since migration 001).
- **Rationale**: Current `ilike '%واقف%'` / `'%اتصل%'` matching breaks on any copy change; `last_contact_date` measures what the business actually means by "stuck".

## D8. Scraping pipeline

- **Decision**: `scrape_targets` queue table; weekly cron Saturday ≈08:00 Cairo runs queued targets through extracted `lib/scraper/run.ts` (existing Apify compass/crawler logic + existing mock fallback), results into extracted `lib/leads/intake.ts` (the current intake route's dedup → round-robin → insert → task → notify loop, unchanged behavior). Week-spread: batch index `i` → due_date = Sat + (i mod 6) days, skipping Friday. Summary (created/dups/errors/per-rep) → Mido notification + Telegram.
- **Rationale**: Owner chose weekly batch (Apify cost control). Extraction (not duplication) lets route and cron share one tested code path. Spread balances workload across the Sat–Thu week per spec FR-025.

## D9. UI refresh approach

- **Decision**: One `heliomaxTheme.ts` token object consumed by antd `ConfigProvider` in the dashboard layout (palette, radius, font, component density); shared `<PageHeader>`, `<EmptyState>`, skeleton patterns applied to dashboard/CRM/reports/BOQ list pages; `error.tsx` boundaries (dashboard + root); NotificationBell switches from 30s polling to `supabase.channel('user:{id}')` broadcast subscription (the `createNotification` lib already broadcasts on exactly that channel) with polling retained as degraded fallback; `xlsx` and `@react-pdf/renderer` behind `next/dynamic`/lazy `import()`. AI login: zero diffs under `components/agent/*Step*` and the login page.
- **Rationale**: Owner chose visual refresh over redesign; ConfigProvider gives app-wide effect from one file; the realtime channel infrastructure already exists server-side — only the client subscription is missing.

## D10. Secrets handling

- **Decision**: Strip all token/signature/raw-body logging from `meta/webhook`; rotate `META_WEBHOOK_VERIFY_TOKEN` after deploy. Intake accepts only `Bearer $WEBHOOK_SECRET` (new env var) — never the service-role key. `.env.local` confirmed NOT in git history (verified) — no forced rotation of Supabase/Anthropic keys, but `CRON_SECRET` + `WEBHOOK_SECRET` must be set in Vercel env before the cron phases are verified.
- **Rationale**: Service-role key in an Authorization header to an app route is a credential-scope violation; verified the env file was never committed so panic rotation is unnecessary.
