# Implementation Plan: Helio Command Center & Platform Hardening

**Branch**: `004-helio-command-center` | **Date**: 2026-06-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-helio-command-center/spec.md`

## Summary

Five sequential phases on one feature branch family: (A) fix dead crons, API auth holes, secret logging, build-check suppression, idempotency, repo hygiene, and chat rate limiting; (D) DST-proof Sat–Thu 15:50 Cairo report delivery (rides on A); (B) upgrade Helio to a real Anthropic tool-use agent with an autonomy-engine cron, `agent_actions` audit log, digest reporting, and a control page with undo/pause; (C) weekly Apify scraping from a `scrape_targets` queue feeding the existing round-robin intake with week-spread first-call tasks; (E) app-wide antd ConfigProvider theme, skeletons/empty states, error boundaries, realtime notifications, and dynamic imports — AI login untouched.

Execution order: **A → D → B → C → E** (D is a small rider on A's cron work).

## Technical Context

**Language/Version**: TypeScript 5 / Next.js 14.2 App Router (Node 20)

**Primary Dependencies**: @supabase/supabase-js + @supabase/ssr, @anthropic-ai/sdk ^0.80, antd 5, apify-client, resend, @react-pdf/renderer, xlsx (all already installed — no new deps)

**Storage**: Supabase Postgres with RLS; additive migrations only (constitution II)

**Testing**: `npm run build` (with checks re-enabled) as the gate per phase + manual cron triggers via curl + quickstart.md scenarios. No unit-test framework exists; not introduced in this feature (constitution VIII)

**Target Platform**: Vercel (serverless functions, UTC GET crons), Supabase cloud (project `wrmqrvqixtrasajjfbge`)

**Project Type**: Web application (single Next.js app, API routes under `app/api`)

**Performance Goals**: Notification delivery < 5s (realtime); Helio chat round-trip < 10s including tool calls; no initial-bundle growth from xlsx/react-pdf after dynamic imports

**Constraints**: Arabic RTL-first; passwords never touch AI; `force-dynamic` preserved; `npm install --legacy-peer-deps`; no destructive schema changes; Vercel crons = UTC + GET; Egypt week = Sat–Thu, DST UTC+2/+3

**Scale/Scope**: ~10 users, single org; ~25 files touched + 3 migrations + 4 new routes + 1 new page

## Constitution Check

| Principle | Status | Notes |
|---|---|---|
| I. RTL-First UI | PASS | Control page + theme built RTL-first; `direction="rtl"` preserved in ConfigProvider work |
| II. Database Safety | PASS | All 3 migrations additive (new tables `agent_actions`, `agent_settings`, `scrape_targets`; new columns `notifications.type`, `tasks.auto_created`). No drops. Legacy `assigned_to` column cleanup explicitly deferred |
| III. Passwords Never Touch AI | PASS | AI login flow explicitly out of scope/untouched (FR-032) |
| IV. Keyboard-First BOQ | PASS | BOQ grid untouched; only auth added to BOQ API routes and dynamic import of its PDF lib |
| V. Next.js Runtime Rules | PASS | `force-dynamic` kept on all touched routes; installCommand unchanged |
| VI. Phase Order | PASS | Phases 0–6 complete; this is the next feature, internally ordered A→D→B→C→E with per-phase gates |
| VII. No Breakage | PASS | Build + smoke test after every phase before next; re-enabling TS checks may surface latent errors — fixing them IS the task (A5) |
| VIII. Simplicity | PASS | Reuses intake/notifications/telegram/reports/assign libs; no new frameworks; rate limiting via simple DB-window check, no Redis |

**Post-design re-check**: PASS — no violations introduced by data model or contracts.

## Project Structure

### Documentation (this feature)

```text
specs/004-helio-command-center/
├── spec.md
├── plan.md              # this file
├── research.md          # decisions & rationale
├── data-model.md        # 3 migrations + entity definitions
├── quickstart.md        # per-phase verification scenarios
├── contracts/
│   ├── cron-endpoints.md    # GET contract, auth, Cairo guard semantics
│   ├── helio-tools.md       # tool-use schema for all 10 Helio tools
│   └── scrape-pipeline.md   # queue → scrape → intake → spread contract
└── tasks.md             # /speckit-tasks output (next step)
```

### Source Code (repository root)

```text
app/
├── api/
│   ├── reports/{personal,company,stuck-leads}/cron/route.ts   # A1+D: GET handler, Cairo guard, alerting
│   ├── files/[id]/signed-url/route.ts                         # A2: ownership check
│   ├── boq/pdf/route.ts                                       # A2: auth required
│   ├── boq/[id]/rooms/route.ts                                # A2: BOQ access check
│   ├── meta/webhook/route.ts                                  # A3: strip secret logs
│   ├── automation/intake/route.ts                             # A4: WEBHOOK_SECRET; C1: thin wrapper over lib
│   ├── agent/chat/route.ts                                    # A9 rate limit; B1 tool-use rewrite
│   ├── agent/brain/cron/route.ts                              # B2: NEW autonomy engine
│   ├── agent/actions/[id]/undo/route.ts                       # B3: NEW undo endpoint
│   └── scraper/cron/route.ts                                  # C3: NEW weekly scrape
├── (dashboard)/
│   ├── helio/page.tsx                                         # B3: NEW control page
│   ├── error.tsx                                              # E3: NEW error boundary
│   └── layout.tsx                                             # E1: ConfigProvider theme
├── error.tsx                                                  # E3: NEW root boundary
lib/
├── cron/guard.ts            # NEW: verifyCronAuth + cairoNow + isCairoWindow (A1/D shared)
├── notifications/alert.ts   # NEW: sendOpsAlert → Telegram (A6)
├── agent/tools.ts           # NEW: Helio tool definitions + executors (B1)
├── agent/autonomy.ts        # NEW: detection + action logic (B2)
├── leads/intake.ts          # NEW: extracted intake core (C1)
├── scraper/run.ts           # NEW: extracted Apify runner (C3)
└── tasks/auto-create.ts     # A7: typed idempotency
supabase/migrations/
├── 20260612_idempotency_hardening.sql    # A7
├── 20260612_agent_command_center.sql     # B
└── 20260612_scrape_targets.sql           # C
next.config.mjs              # A5: checks on
vercel.json                  # D/B2/C3: cron schedules
components/layout/NotificationBell (realtime)  # E4
components/theme/heliomaxTheme.ts              # E1: NEW theme tokens
```

**Structure Decision**: Existing single Next.js app structure retained; new logic goes in `lib/` modules consumed by thin API routes (matches existing `lib/reports`, `lib/notifications` pattern).

## Phase Gates

Each phase merges only after: `npm run build` green (with A5 checks once Phase A lands) + quickstart.md scenarios for that phase pass + constitution VII smoke test (all pages load).

## Complexity Tracking

No constitution violations — table not required.
