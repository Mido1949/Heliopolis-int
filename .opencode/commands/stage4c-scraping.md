# Stage 4C — Weekly Auto-Scraping Pipeline

## Your role
You are the coder executing feature `004-helio-command-center`, Stage: US4 (weekly scraping).
Branch `004-helio-command-center`. Prerequisite: Stage 4B complete.
STOP and report after each checkpoint.

## Read first (in order)
1. `specs/004-helio-command-center/tasks.md` — execute tasks **T031–T038** in order
2. `specs/004-helio-command-center/contracts/scrape-pipeline.md` — extraction + cron contract (follow exactly)
3. `specs/004-helio-command-center/data-model.md` — Migration 3 (scrape_targets)
4. `specs/004-helio-command-center/quickstart.md` — Phase C verification
5. `.specify/memory/constitution.md`

## Rules
- EXTRACT, don't duplicate: `lib/leads/intake.ts` and `lib/scraper/run.ts` carry the existing logic; the old routes become thin wrappers with unchanged external behavior. The manual scraper page must keep working identically.
- First-call tasks: `auto_created: true`, due dates rotate across the current Cairo week Sat–Thu (skip Friday).
- Test the cron in mock mode (no APIFY_API_TOKEN) — do NOT spend Apify credits.
- Zero CS members ⇒ ops alert, no partial assignment.
- Mark tasks `[x]`; commit per checkpoint: `feat(004): <summary>`.

## Checkpoints (STOP + report after each)
1. T031–T032 (migration 3 applied)
2. T033–T034 (extractions) → manual intake route + scraper page regression OK; build green
3. T035–T038 (cron + chat tool wiring + page queue UI + schedule) → quickstart Phase C passes in mock mode

## Done when
T031–T038 checked, quickstart Phase C passes, build green.
