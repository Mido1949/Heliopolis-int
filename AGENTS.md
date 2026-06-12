<!-- VERCEL BEST PRACTICES START -->
## Best practices for developing on Vercel

These defaults are optimized for AI coding agents (and humans) working on apps that deploy to Vercel.

- Treat Vercel Functions as stateless + ephemeral (no durable RAM/FS, no background daemons), use Blob or marketplace integrations for preserving state
- Edge Functions (standalone) are deprecated; prefer Vercel Functions
- Don't start new projects on Vercel KV/Postgres (both discontinued); use Marketplace Redis/Postgres instead
- Store secrets in Vercel Env Variables; not in git or `NEXT_PUBLIC_*`
- Provision Marketplace native integrations with `vercel integration add` (CI/agent-friendly)
- Sync env + project settings with `vercel env pull` / `vercel pull` when you need local/offline parity
- Use `waitUntil` for post-response work; avoid the deprecated Function `context` parameter
- Set Function regions near your primary data source; avoid cross-region DB/service roundtrips
- Tune Fluid Compute knobs (e.g., `maxDuration`, memory/CPU) for long I/O-heavy calls (LLMs, APIs)
- Use Runtime Cache for fast **regional** caching + tag invalidation (don't treat it as global KV)
- Use Cron Jobs for schedules; cron runs in UTC and triggers your production URL via HTTP GET
- Use Vercel Blob for uploads/media; Use Edge Config for small, globally-read config
- If Enable Deployment Protection is enabled, use a bypass secret to directly access them
- Add OpenTelemetry via `@vercel/otel` on Node; don't expect OTEL support on the Edge runtime
- Enable Web Analytics + Speed Insights early
- Use AI Gateway for model routing, set AI_GATEWAY_API_KEY, using a model string (e.g. 'anthropic/claude-sonnet-4.6'), Gateway is already default in AI SDK
  needed. Always curl https://ai-gateway.vercel.sh/v1/models first; never trust model IDs from memory
- For durable agent loops or untrusted code: use Workflow (pause/resume/state) + Sandbox; use Vercel MCP for secure infra access
<!-- VERCEL BEST PRACTICES END -->

<!-- SPECKIT START -->
## Active Implementation: 004-helio-command-center

Read before writing any code:
`specs/004-helio-command-center/plan.md` and `specs/004-helio-command-center/tasks.md`

Branch: `004-helio-command-center`. Four stages. Execute in order. Stop and report after each checkpoint.

### Stage 4A — Security & Stability Hardening (+ Cairo Reports)
Command: `.opencode/commands/stage4a-hardening.md`
Goal: Tasks T001–T021. Revive crons (GET + Cairo guard), close auth holes, strip secret logs, WEBHOOK_SECRET, re-enable build checks, idempotency migration, repo cleanup, rate limit, 15:50 Cairo Sat–Thu reports.

### Stage 4B — Helio Command Brain
Command: `.opencode/commands/stage4b-helio-brain.md`
Goal: Tasks T022–T030. Tool-use agent (claude-sonnet-4-6), autonomy engine cron, agent_actions audit + undo, /helio control page.

### Stage 4C — Weekly Auto-Scraping
Command: `.opencode/commands/stage4c-scraping.md`
Goal: Tasks T031–T038. scrape_targets queue, Saturday cron, intake/scraper extraction, week-spread tasks, Mido summary.

### Stage 4D — UI Refresh + Polish
Command: `.opencode/commands/stage4d-ui-refresh.md`
Goal: Tasks T039–T048. antd theme, skeletons/empty states, error boundaries, realtime bell, dynamic imports, final verification + merge prep.

### Reference artifacts (do not contradict)
- `specs/004-helio-command-center/spec.md` — user stories & acceptance criteria
- `specs/004-helio-command-center/contracts/` — cron, Helio-tools, scrape-pipeline contracts (follow exactly)
- `specs/004-helio-command-center/data-model.md` — the 3 additive migrations
- `specs/004-helio-command-center/quickstart.md` — per-stage verification probes
- `.specify/memory/constitution.md` — governing principles (NON-NEGOTIABLE)

### Key constraints
- `npm install` must use `--legacy-peer-deps`
- Arabic RTL must be preserved everywhere
- Passwords are NEVER plain text in chat; AI login flow must NOT be modified
- Additive migrations only — show SQL before applying; never drop/truncate
- Vercel crons fire via HTTP GET in UTC; Cairo-time guards live in the handlers
<!-- SPECKIT END -->
