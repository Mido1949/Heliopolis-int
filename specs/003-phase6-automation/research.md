# Research: Phase 6 — HelioMax Automation

## Existing Code Inventory

| Feature | Status | Location |
|---------|--------|---------|
| PriceListManager component | ✅ Complete + wired to settings | `components/boq/PriceListManager.tsx` |
| Price list API routes | ✅ Complete | `app/api/price-list/route.ts`, `app/api/price-list/[id]/route.ts` |
| Settings page with price list tab | ✅ Already renders PriceListManager | `app/(dashboard)/settings/page.tsx:359` |
| `createNotification()` helper | ✅ Complete | `lib/notifications/in-app.ts` |
| `notifications` table | ✅ Created by migration 005 | Supabase |
| `tasks` table | ✅ Exists | Supabase |
| Personal report cron | ✅ Pattern to follow | `app/api/reports/personal/cron/route.ts` |
| Helio agent chat route | ✅ Needs system-approval injection | `app/api/agent/chat/route.ts` |
| `system-approval/` folder | ✅ Exists (empty) | `system-approval/README.md` |

## Decisions

### Notification Bell Polling vs Realtime
- **Chosen**: Simple 30-second polling via `/api/notifications`
- **Why**: Supabase Realtime requires subscription management in the component. Polling is simpler, reliable, and sufficient for a ~10-user team. Can be upgraded to Realtime later.

### Stuck Leads Threshold
- **Chosen**: 3 days (72 hours)
- **Why**: Specified in the Master Brief as the threshold for "flags: leads stuck in a stage too long".

### Auto-Task Idempotency
- **Chosen**: Check for existing task with `lead_id + title LIKE '%اتصل%'` before inserting
- **Why**: Prevents duplicate tasks if the save function is called twice (network retry, etc.)

### system-approval Files at Request Time
- **Chosen**: `fs.readFileSync` in the API route handler
- **Why**: Next.js runs API routes as Node.js — `fs` module is available. No build step needed. Content updates are instant.
- **Note**: Vercel serverless functions have access to files bundled in the deployment. The `system-approval/` folder IS included in the deployment (not in `.vercelignore`).
