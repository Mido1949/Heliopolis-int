# Implementation Plan: CRM Productivity & Manual-System Completion

**Branch**: `005-crm-productivity` | **Date**: 2026-07-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/005-crm-productivity/spec.md`

## Summary

Complete the manual-CRM redesign so all teams can work in one app with clear, Zoho-like pipeline hygiene, without automation that moves leads. Two P1 fixes make the manual model correct and safe (org-wide read + owner/leader-gated writes + atomic claim; and neutering the autonomy engine to reminders-only). Four P2 stories add the CRM primitives and the highest-leverage quick wins (templated WhatsApp, SLA card colors, rep-set next-step + reminders, phone-normalized dedupe). Three P3 stories improve daily throughput (My Day view, funnel report, bulk actions, mobile/keyboard fast paths).

## Technical Context

**Language/Version**: TypeScript 5, React 18, Next.js 14.2 (App Router)

**Primary Dependencies**: Ant Design 5, Tailwind, `@hello-pangea/dnd` (already present), `@supabase/supabase-js`, `libphonenumber-js` (NEW — for phone normalization; small, tree-shakeable)

**Storage**: Supabase Postgres (RLS-enforced). New columns on `leads`; new/adjusted RLS policies; reuse `lead_activities`, `tasks`, autonomy settings.

**Testing**: No unit runner in repo. Gate per task = `npx tsc --noEmit` **and** `npm run build` **and** the story's manual acceptance scenario. (Same convention as the 004 plan.)

**Target Platform**: Vercel (web, project `loomark`); mobile web via responsive UI.

**Project Type**: Web application (Next.js monolith — app/, components/, lib/).

**Performance Goals**: Board and My Day render < 1s for a few hundred leads; funnel report query returns < 2s over ~1k leads.

**Constraints**: Manual philosophy is a hard constraint — no code path may auto-change a lead's owner or stage. Arabic-first UI. RLS must not hide unassigned NEW leads from any org member.

**Scale/Scope**: ~890 live leads, single org today; dozens of daily users across 6 roles.

## Constitution Check

Per `.specify/memory/constitution.md` (HelioMax): changes stay within the existing Next.js/Supabase monolith; every schema change ships as a numbered migration in `supabase/migrations/`; RLS remains enforced; no secrets in the repo; verification is build + tsc + manual acceptance. **No violations** — this feature adds columns/policies/UI within existing patterns and introduces one small dependency (`libphonenumber-js`). No new services, no new infra.

## Pre-work (blocking, before any story)

These are prerequisites the owner already flagged; they gate a safe rollout:

- **P0-a Merge & deploy** the current `feat/manual-crm-pipeline` branch (UI + the applied `20260701` migration) to `main` so DB and code are aligned before layering new work.
- **P0-b Security**: close the unauthenticated `app/api/auth/lookup/route.ts` PII route (require session / drop service-role / or remove). Independent of this feature but must not ship after it.
- **P0-c Source-of-truth**: dump live `pg_policies` for `leads` and reconcile with the repo as a committed migration, so US1's RLS work starts from reality, not drift.
- **P0-d Move loose PII** (`Heliomax_Riyadh_Leads.xlsx`, lead CSVs) out of the repo and add ignore globs.

## Project Structure

### Documentation (this feature)

```text
specs/005-crm-productivity/
├── plan.md              # This file
├── spec.md              # Feature spec (done)
├── research.md          # Decisions & unknowns (this plan writes it)
├── data-model.md        # New columns / policies / activity types
├── tasks.md             # Delegable task list (/speckit-tasks output)
└── contracts/           # API route contracts (claim, next-step, funnel, bulk)
```

### Source Code (repository root — real paths touched)

```text
supabase/migrations/
├── 20260703_crm_rls_visibility.sql      # US1: org-wide SELECT, owner/leader write, atomic-claim helper
└── 20260703_lead_next_step.sql          # US5: next_step, next_step_due, next_step_done_at + normalized phone key

lib/
├── constants.ts                         # US3 WhatsApp templates, US4 SLA thresholds (extend existing)
├── whatsapp.ts                          # US3: buildWhatsAppUrl(phone, stage, lead) + templates (NEW)
├── phone.ts                             # US6: normalizePhone() (NEW, wraps libphonenumber-js)
├── leads/intake.ts                      # US6: dedupe on normalized phone
├── agent/autonomy.ts                    # US2: remove rebalance + auto-task; keep reminders; drop CONTACTED
└── reports/funnel-report.ts             # US8: stage conversion / velocity / win-rate (NEW)

app/(dashboard)/crm/
├── page.tsx                             # US7 default view routing; US9 bulk selection; sanitize .or() search
├── KanbanView.tsx                       # US3 WhatsApp menu, US4 SLA colors, US1 atomic claim, US10 touch path
├── LeadDrawer.tsx                       # US3 WhatsApp, US5 next-step editor, US1 owner/leader gating
├── LeadFormModal.tsx                    # US6 duplicate warning, US10 keyboard-fast entry
└── FunnelReport.tsx                     # US8 report UI (NEW)

app/(dashboard)/my-leads/page.tsx        # US7 "My Day" prioritized action list
app/api/leads/[id]/claim/route.ts        # US1 atomic claim endpoint (NEW or fold into stage route)
app/api/leads/[id]/next-step/route.ts    # US5 set/complete next step (NEW)
app/api/leads/bulk/route.ts              # US9 bulk claim/assign/advance (NEW)
app/api/reports/funnel/route.ts          # US8 funnel data (NEW)
app/api/reports/stuck-leads/cron/route.ts# US5 include due next-steps in reminders
types/index.ts                           # next_step fields, template/threshold types
```

**Structure Decision**: Stay in the existing Next.js monolith. Server-authoritative mutations go through `app/api/leads/*` route handlers using the service client with explicit permission checks (belt-and-suspenders with RLS). UI is Ant Design + Tailwind, matching current CRM components. No new top-level directories.

## Phased Approach & Delegation

**Delegation model**: This plan (Opus) defines contracts and file-level tasks. Implementation is delegated per-story to **Sonnet** (preferred for multi-file stories US1/US2/US5/US8) or **OpenCode** (only for tightly-scoped single-file tasks — US3/US4 templates, US6 helper — given its weaker model). Every delegated task carries its own verification gate (`tsc` + `build` + acceptance) and must be self-applied only after the gate passes.

Ordering: **P0 pre-work → US1 → US2** (both P1, foundational and independently shippable) → **US3, US4, US6** (cheap P2 wins, parallelizable) → **US5** (P2, the CRM primitive) → **US7, US8, US9, US10** (P3). Each story is independently deployable.

## Key Design Decisions (see research.md for detail)

1. **Atomic claim** = server route doing `update leads set assigned_to_user = :uid where id = :id and assigned_to_user is null returning id`; empty result → "already taken." RLS write policy additionally allows the NULL→me transition for any org member (claiming), while non-claim owner/stage edits require owner-or-leader.
2. **Autonomy neutering** = delete the `rebalanceTeams` call and the auto-`create_task` block from `runAutonomyCycle`; keep nudge/notification paths; remove `CONTACTED` from the fresh-lead query. Leave the `autonomy_paused` kill-switch intact.
3. **Next step** = three columns on `leads` (`next_step text`, `next_step_due timestamptz`, `next_step_done_at timestamptz`) rather than overloading `tasks`, to keep the "one next action per lead" model simple and queryable for reminders and My Day. (Decision revisited in research.md vs. reusing `tasks`.)
4. **WhatsApp templates** = a typed constant map `stage → template(name)` in `lib/whatsapp.ts`; `buildWhatsAppUrl` normalizes the phone via `lib/phone.ts`. No DB, no API for v1.
5. **SLA thresholds** = constant `{ amberDays, redDays }` in `lib/constants.ts`; color helper reused by KanbanView and My Day; terminal stages excluded.
6. **Funnel report** = SQL over `stage_timestamps` (JSON keyed by stage code) aggregated server-side in `app/api/reports/funnel`; UI is read-only tables/bars. Reuses existing report auth.
7. **Phone normalization** = `libphonenumber-js` with default regions EG then SA; store a normalized E.164 match key; intake and entry-form dedupe both use it.

## Complexity Tracking

No constitution violations. One new dependency (`libphonenumber-js`) justified: hand-rolled phone normalization for mixed EG/SA formats is error-prone and would risk wrongly merging distinct leads; the library is small and widely used.
