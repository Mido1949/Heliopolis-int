# Stage 4A — Security & Stability Hardening (+ Cairo Reports)

## Your role
You are the coder executing feature `004-helio-command-center`, Stages: Setup + Foundational + US1 + US3.
Work on branch `004-helio-command-center`. STOP and report after each checkpoint.

## Read first (in order)
1. `specs/004-helio-command-center/tasks.md` — execute tasks **T001–T021** in order
2. `specs/004-helio-command-center/contracts/cron-endpoints.md` — exact cron contract
3. `specs/004-helio-command-center/data-model.md` — Migration 1 SQL definition
4. `specs/004-helio-command-center/quickstart.md` — Phase A + Phase D verification
5. `.specify/memory/constitution.md` — NON-NEGOTIABLE principles

## Rules
- Additive migrations only. Show full SQL before applying. NEVER drop/truncate.
- `npm install --legacy-peer-deps` if installing.
- T018 (re-enable build checks) will surface many type errors — fix them properly, no `any` casts, no blanket eslint-disable.
- Do NOT touch the AI login flow (`components/agent/*Step*`, login page).
- Keep `export const dynamic = 'force-dynamic'` on touched routes.
- Mark each finished task `[x]` in tasks.md as you go.
- Commit per checkpoint: `fix(004): <summary>`.

## Checkpoints (STOP + report after each)
1. T001–T003 (setup libs) → build green
2. T004–T006 (migration 1 applied) → verify columns exist
3. T007–T017 (cron revival + auth holes + secrets + idempotency + cleanup) → quickstart Phase A probes 1–5, 8 pass
4. T018–T019 (build checks ON + schedules) → `npm run build` green WITH checks; quickstart probe 6–7
5. T020–T021 (US3 verification) → quickstart Phase D probes pass

## Done when
All of T001–T021 checked, build green with checks enabled, quickstart Phases A+D fully pass.
