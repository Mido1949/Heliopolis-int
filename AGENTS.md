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
## Active Implementation: MASTER_PLAN_V2

Read the master plan before writing any code:
`specs/002-heliomax-platform/MASTER_PLAN_V2.md`

Three stages. Execute in order. Stop and report after each stage.

### Stage 1 — Database Foundation
Command: `.opencode/commands/stage1-foundation.md`
Goal: Apply migrations 001, 002, 005. Fix seed script. Seed 97 GCHV models.

### Stage 2 — AI-First Shell
Command: `.opencode/commands/stage2-ai-shell.md`
Goal: Role-based layout. NormalUserShell. AI lead creation.

### Stage 3 — BOQ Simplification
Command: `.opencode/commands/stage3-boq.md`
Goal: Remove load calculator. New grid with auto-fill. Official quote PDF.

### Reference artifacts (do not contradict)
- `specs/002-heliomax-platform/spec.md` — original user stories
- `.specify/memory/constitution.md` — governing principles (NON-NEGOTIABLE)
- `price_list_seed.json` — the 97 official GCHV model prices (source of truth)
- `MASTER_PROMPT_v2.md` — requirements authored by the product owner

### Key constraints
- Migration 003_boq_rooms.sql: DO NOT apply (load calculator is removed)
- `npm install` must use `--legacy-peer-deps`
- Arabic RTL must be preserved everywhere
- Passwords are NEVER plain text in chat
<!-- SPECKIT END -->
