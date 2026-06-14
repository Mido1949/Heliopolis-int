# Contract: Weekly Scrape Pipeline

## lib/scraper/run.ts (extracted from app/api/scraper/route.ts)

```ts
runScrape(target: { query: string; region: string }): Promise<ScrapedBusiness[]>
// Uses ApifyClient when APIFY_API_TOKEN is set (existing actor + proxy config, unchanged),
// otherwise returns the existing mock dataset (tagged mocked: true upstream).
// Throws on Apify API failure — caller handles status transition + alert.
```

`app/api/scraper/route.ts` becomes a thin authenticated wrapper around `runScrape` (manual scraping page keeps working identically).

## lib/leads/intake.ts (extracted from app/api/automation/intake/route.ts)

```ts
intakeLeads(
  businesses: ScrapedBusiness[],
  opts?: { dueDates?: string[] }   // optional rotation of YYYY-MM-DD due dates
): Promise<{ created: number; duplicates: number; errors: number;
             perRep: Record<string, number>; createdLeadIds: string[] }>
```

Behavior (identical to current route loop, plus additions in **bold**):
1. Load active CS members (`profiles.crm_team = 'cs'`); zero members ⇒ throw `NoCsMembersError` (**caller sends ops alert**).
2. Per business: skip without phone (error count); dedup by exact phone match; round-robin assign; insert lead (`source`, `pipeline_stage: 'NEW'`, `stage_timestamps`); insert first-call task (**`auto_created: true`**, **`due_date` from `opts.dueDates` rotation** — default today); notify assignee (type `lead_intake`).
3. **Track per-rep counts** for the summary.

The HTTP route `app/api/automation/intake` keeps its external contract (array in → `{created, duplicates, errors}` out) but authenticates via `Bearer $WEBHOOK_SECRET` (or session) per Phase A.

## app/api/scraper/cron/route.ts (new)

Auth + window per contracts/cron-endpoints.md (Sat 08:00 Cairo).

```text
1. SELECT scrape_targets WHERE status='queued' ORDER BY created_at (cap: 10 per run)
2. For each target:
   a. UPDATE status='running'
   b. results = runScrape(target)            — on throw: status='failed', error=msg, continue
   c. summary = intakeLeads(results, { dueDates: weekSpread() })
   d. UPDATE status='done', last_run_at=now(), results_count=summary.created
3. weekSpread(): the 6 dates of the current Cairo week Sat..Thu (skipping Fri);
   intake rotates through them per created lead ⇒ due dates span ≥4 distinct days for batches ≥4.
4. Admin summary — notification type='scrape_summary' + Telegram:
   targets run/failed, created, duplicates, errors, per-rep distribution.
5. Zero queued targets ⇒ { ok: true, skipped: 'no_queued_targets' } (no notifications).
6. Any unhandled throw ⇒ withCronAlert fires Telegram ops alert.
```

## Queue input surfaces

- Helio chat: `queue_scrape_target` tool (admin) — see helio-tools.md.
- Scraper page (`app/(dashboard)/scraper/page.tsx`): add a "queue for Saturday" action alongside the existing immediate-scrape button, plus a table of `scrape_targets` with status/results (RLS: SELECT authenticated).
