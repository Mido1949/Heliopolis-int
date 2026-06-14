# Stage 4B — Helio Command Brain (Autonomous Team Controller)

## Your role
You are the coder executing feature `004-helio-command-center`, Stage: US2 (Helio autonomy).
Branch `004-helio-command-center`. Prerequisite: Stage 4A complete (build green with checks on).
STOP and report after each checkpoint.

## Read first (in order)
1. `specs/004-helio-command-center/tasks.md` — execute tasks **T022–T030** in order
2. `specs/004-helio-command-center/contracts/helio-tools.md` — the tool-use contract (follow exactly: schemas, scopes, RLS-scoped execution, action recording, undo semantics)
3. `specs/004-helio-command-center/data-model.md` — Migration 2 (agent_actions, agent_settings)
4. `specs/004-helio-command-center/research.md` — D3 (agent architecture), D4 (autonomy rules), D5 (undo)
5. `specs/004-helio-command-center/quickstart.md` — Phase B verification scenarios
6. `.specify/memory/constitution.md`

## Rules
- Tool executors use the CALLER's session-bound Supabase client (RLS enforces permissions). Service role only inside `nudge_user` / report generation / autonomy engine.
- Autonomy detection is deterministic SQL rules — NO LLM calls in `lib/agent/autonomy.ts`.
- Every state-changing action inserts an `agent_actions` row with prior-state payload BEFORE returning success.
- Preserve the existing register-lead regex flow and rate limiting added in Stage 4A.
- Model: `claude-sonnet-4-6`, max_tokens 2048, max 6 tool iterations, Haiku fallback.
- Helio control page is RTL-first Arabic, antd components, admin/team-lead only.
- Mark tasks `[x]` in tasks.md; commit per checkpoint: `feat(004): <summary>`.

## Checkpoints (STOP + report after each)
1. T022–T023 (migration 2 applied) → tables + RLS verified
2. T024–T025 (tools + chat rewrite) → quickstart Phase B chat scenarios 1–4 + member-scope test pass
3. T026–T027 (autonomy engine + brain cron) → seeded autonomy run + suppression re-run pass; Mido digest received
4. T028–T030 (undo + control page + cron schedule) → undo/pause scenarios pass; build green

## Done when
T022–T030 checked, quickstart Phase B passes end-to-end, build green.
