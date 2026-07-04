# Implementation Plan: Team Works in the Full App

**Branch**: `006-team-full-app` | **Date**: 2026-07-03 | **Spec**: [spec.md](./spec.md)

## Summary

Retire the chat-only container as the *forced* experience for the team. Flip the shell gate so every role gets the full app (Sidebar + board access), default reps to their focused My Day/My Leads surface, and demote Helio to an optional assistant while preserving guided single-lead capture. No data-model or automation changes — RLS is already org-wide SELECT and autonomy is already reminders-only, so this is primarily a **navigation/shell** change that unlocks the 005 board for the whole team.

## Technical Context

**Language/Version**: TypeScript 5, React 18, Next.js 14.2 (App Router)
**Primary Dependencies**: existing (Ant Design, Tailwind, Supabase). No new deps.
**Storage**: no schema change. RLS unchanged (org-wide SELECT already live; UPDATE owner/leader-gated).
**Testing**: `npx tsc --noEmit` + `npm run build` + manual acceptance (no unit runner).
**Target Platform**: Vercel (loomark), responsive web (reps are mobile-heavy).
**Project Type**: Next.js monolith.
**Constraints**: Manual guarantees must stay intact (no auto-assignment). Must not overwhelm reps (default to My Day). Must not lose the guided capture UX or the daily-report content.

## Constitution Check

Per `.specify/memory/constitution.md`: change stays within the existing shell/nav components; no new services; no secrets; RLS enforced (unchanged). **No violations.** This is a visibility/routing change over already-built, already-manual tooling.

## Key Design Decisions

1. **Shell gate (US1).** In `components/layout/Shell.tsx`, stop routing non-admin roles to `NormalUserShell`. Give the full `Sidebar + Navbar + HelioAgent` shell to all authenticated roles. `Sidebar` already shows `crm/my-leads/tasks/boq/reports` by org-module gating (not role), so no Sidebar change is needed beyond verification. Keep `NormalUserShell` in the tree but no longer as the forced container (repurposed for the guided flow — see #3).
2. **Default landing for reps (US2).** After login and on the app root, route non-leaders to **/my-leads** (which renders My Day first) instead of `/dashboard`. Leaders/managers/admins keep `/dashboard`. Implement at the login-success redirect and/or a small role-based redirect on `/dashboard` (reps → /my-leads). Board remains reachable from the sidebar; it is never the forced first screen. On mobile, My Leads/My Day is the primary surface (board drag is desktop-first; tap-claim/stage from 005 still work).
3. **Demote Helio, preserve capture (US3/US4).** The full shell already renders the floating `HelioAgent`. Verify whether `HelioAgent` includes the guided "سجّل عميل" capture + call logging; if not, either (a) route `/helio` to the existing guided flow from `NormalUserShell`, or (b) expose a "＋ إضافة سريعة" quick-add on the board/My Leads that opens the guided flow (or the existing `LeadFormModal`). Do NOT delete the guided-capture code. `LeadFormModal` (fast form) and `ImportModal` (bulk/historical) remain the other two capture paths.
4. **Preserve the daily-report/BOQ panel content (US4).** `NormalUserShell`'s `DailyReportPanel` + `BOQPanel` content (my KPIs, follow-ups, pending tasks, recent BOQs, quick actions) should not vanish. Fold their essentials into the rep landing (My Leads/My Day already shows the actionable list; add the KPI/BOQ quick actions if missing) or keep them reachable. Minimal acceptable: reps still have My Day + Tasks + BOQ via nav.
5. **Verify manual guarantees (US1/FR-008).** With the board now visible to the team, re-confirm: atomic claim still enforced, autonomy cron still reminders-only, no round-robin. No code change expected — verification task.

## Project Structure

### Source Code (real paths touched)

```text
components/layout/Shell.tsx            # US1: flip the isNormalUser gate → full shell for all
components/layout/Sidebar.tsx          # US1: verify nav (crm/my-leads/tasks/boq/reports) for team roles
components/layout/NormalUserShell.tsx  # US3: no longer forced; guided-capture flow preserved/repurposed
components/agent/HelioAgent.tsx        # US3: verify/ensure guided capture + call logging available
app/(auth)/login/page.tsx              # US2: redirect reps → /my-leads on login success
app/(dashboard)/dashboard/page.tsx     # US2: (optional) redirect non-leaders → /my-leads
app/(dashboard)/my-leads/page.tsx      # US2/US4: rep landing; ensure quick-add + KPIs present
app/(dashboard)/crm/page.tsx           # US4: quick-add entry ("＋ إضافة سريعة") if not present
```

**Structure Decision**: Pure front-end shell/nav/routing change in the existing monolith. No API/DB/migration work.

## Complexity Tracking

No violations. The main risk is UX regression (losing guided capture or overwhelming reps), mitigated by decisions #2–#4 (default to My Day, preserve all three capture paths, keep Helio as launcher).

## Rollout & Verification

- Ship behind the branch; verify with a **real non-leader test account** on both desktop and mobile: sees sidebar + board, claims an unassigned lead, lands on My Day by default, can still capture via Helio/quick-add.
- Confirm no role lost access to something they had (e.g., a role that only had chat now must still reach My Leads/Tasks/BOQ).
- Deploy to production (main) like 005; Vercel keeps the live site up if the build fails.
