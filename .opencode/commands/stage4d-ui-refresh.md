# Stage 4D — UI Visual Refresh + Final Polish

## Your role
You are the coder executing feature `004-helio-command-center`, Stages: US5 (UI refresh) + Polish.
Branch `004-helio-command-center`. Prerequisite: Stage 4C complete.
STOP and report after each checkpoint.

## Read first (in order)
1. `specs/004-helio-command-center/tasks.md` — execute tasks **T039–T048** in order
2. `specs/004-helio-command-center/research.md` — D9 (UI approach)
3. `specs/004-helio-command-center/quickstart.md` — Phase E verification
4. `.specify/memory/constitution.md` — especially I (RTL-first) and III (login untouched)

## Rules
- ABSOLUTE: zero changes to the AI login flow (`components/agent/*Step*`, login page visuals/behavior). FR-032.
- Theme = one token object in `components/theme/heliomaxTheme.ts` applied via antd ConfigProvider — no per-page style forks.
- RTL first: verify every refreshed screen in Arabic before English.
- Realtime bell subscribes to channel `user:{id}` event `new_notification` (matches `lib/notifications/in-app.ts` broadcast); keep degraded polling fallback.
- Dynamic imports must not break BOQ PDF export or CRM Excel import — regression-test both.
- T046 needs Vercel + Meta dashboard access — if credentials unavailable, document exact steps for Mido and continue.
- Mark tasks `[x]`; commit per checkpoint: `feat(004): <summary>` / final `chore(004): polish`.

## Checkpoints (STOP + report after each)
1. T039 (theme) → all pages render with theme, AR + EN
2. T040–T043 (states, boundaries, realtime, dynamic imports) → quickstart Phase E probes pass
3. T044 (bundle evidence) → sizes recorded in commit message
4. T045–T048 (full verification + env rotation + docs + merge prep) → full quickstart top-to-bottom green

## Done when
T039–T048 checked, quickstart Phase E + full pass complete, ready to merge to main.
