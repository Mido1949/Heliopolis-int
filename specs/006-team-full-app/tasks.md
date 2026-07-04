---
description: "Delegable task list for Team Works in the Full App (retire chat-only)"
---

# Tasks: Team Works in the Full App

**Input**: `specs/006-team-full-app/` (spec.md, plan.md)

**Verification gate (every task)**: `npx tsc --noEmit` AND `npm run build` AND the story's manual acceptance. Commit per task; no push/merge until approved.

**Delegation**: `[→S]` Sonnet (multi-file UI/routing). `[→Opus]` Opus (the shell gate + verification). `[→OC]` OpenCode (tiny single-file only).

**Guardrails**: no schema/RLS/automation change. Manual guarantees must stay intact. Do not delete the guided-capture code or the daily-report/BOQ panel content — preserve/repurpose.

---

## Phase 0: Verify / investigate (BLOCKING)

- [x] T001 `[→Opus]` **DONE** — verified live RLS grants org-wide SELECT on `leads` (`leads_select_all USING(true)`), so the board renders for all roles. UPDATE stays owner/leader-gated. No RLS change needed.
- [x] T002 `[→Opus]` **DONE** — `HelioAgent.tsx` is free Q&A + conversational login ONLY; it has NO guided "سجّل عميل" capture flow. The guided flow + call logging live solely in `NormalUserShell.tsx`. Decision: preserve `NormalUserShell.tsx` in the repo (not deleted) and use the already-existing fast `LeadFormModal` as the reachable capture path on board + My Leads; re-exposing the guided chat as an optional launcher is a fast-follow (see T030).
- [x] T003 `[→Opus]` **DONE** — `crm` module confirmed enabled (admins use the board today); Sidebar gates CRM by module, not role, so team roles see it once in the full shell.

**Checkpoint**: RLS ok (done), Helio capability known, crm module confirmed.

---

## Phase 1: US1 — Team gets the full app + board (Priority: P1) 🎯 MVP

- [x] T010 `[→Opus]` **DONE** — flipped the gate in `components/layout/Shell.tsx`: removed `isNormalUser` + the `NormalUserShell` branch; every authenticated role now gets the full `Sidebar + Navbar` shell and the floating `<HelioAgent />` (unconditional). `useSessionManager`/`useIdleLogout` still run for everyone (they were already above the removed branch). Removed the now-unused `NormalUserShell` import (file preserved in repo). tsc clean.
- [x] T011 `[→Opus]` **DONE (verify)** — Sidebar gates `crm/boq/tasks/reports` by org **module**, not role; `ROLE_RESTRICTED` only limits `helio` (the sidebar Helio control-center, distinct from the floating agent). No change needed — team roles see the board once in the full shell.
- [x] T012 `[→Opus]` **DONE (verify)** — no code touched the claim route, autonomy engine, or intake. Atomic claim (`WHERE assigned_to_user IS NULL`), reminders-only autonomy, and no round-robin are all intact. This feature is visibility-only.

**Checkpoint**: a non-admin logs in → full sidebar + board; can claim an unassigned lead; nothing auto-moves.

---

## Phase 2: US2 — Focused landing, don't overwhelm (Priority: P1)

- [x] T020 `[→Opus]` **DONE** — `handleLoginSuccess` in `app/(auth)/login/page.tsx` now branches on `selectedUser.role`: leaders (`admin`, `Manager`, `CS Team Leader`, `Tech Team Leader`) → `/dashboard`, all reps → `/my-leads`.
- [x] T021 `[→Opus]` **DONE** — `app/(dashboard)/dashboard/page.tsx` redirects reps to `/my-leads` via `useEffect` when `!authLoading && user && !isStaff` (`router.replace`). Leaders unaffected.
- [x] T022 `[→Opus]` **DONE (verify)** — `my-leads/page.tsx` already renders `MyDayList` first; the full table uses `scroll={{ x: 800 }}` so it scrolls on mobile. No raw 10-column board is forced.

**Checkpoint**: reps land on My Day; board reachable but not forced; leaders keep dashboard.

---

## Phase 3: US3 — Demote Helio, preserve capture (Priority: P2)

- [~] T030 `[→Opus]` **PARTIAL / fast-follow** — Helio is demoted: the floating `HelioAgent` is now available to every role (optional, never the container). The guided "سجّل عميل" flow is preserved intact in `NormalUserShell.tsx` (not deleted). Re-exposing that guided flow as an optional `/helio` launcher/page is a deliberate FAST-FOLLOW after this load-bearing increment — the reachable capture path today is the fast `LeadFormModal` (T040) with dedupe.
- [x] T031 `[→Opus]` **DONE (verify)** — the floating `HelioAgent` renders for team roles in the full shell (quick Q&A). Guided capture is via `LeadFormModal` for now (see T030 fast-follow).

**Checkpoint**: reps can capture a single lead and log a call via the demoted Helio.

---

## Phase 4: US4 — Three capture paths + preserve panels (Priority: P2)

- [x] T040 `[→OC→Opus]` **DONE** — the board (`crm/page.tsx`) already had all three paths: "＋ عميل جديد" (New Lead → `LeadFormModal`, line 395), Import (`ImportModal`, line 389), and the guided flow preserved in repo. Added a "＋ عميل جديد" quick-add to `my-leads/page.tsx` (opens `LeadFormModal` with `lead={null}`) + fixed its stale "من الشات" empty-state text. Delegated to OpenCode first; it stalled with zero output for ~6 min (same no-op as 005/T101), so Opus landed it.
- [x] T041 `[→Opus]` **DONE (minimal)** — My Leads surfaces `MyDayList` (SLA/next-step actionable list), a "عرض سعر جديد" (New BOQ) quick action, and reps reach Tasks/BOQ/Reports via the sidebar. The richer `DailyReportPanel`/`BOQPanel` markup is preserved in `NormalUserShell.tsx` for optional reuse. Minimal acceptable met.

**Checkpoint**: guided + form + import all reachable; reps still have KPIs/BOQ quick actions.

---

## Phase 5: Polish & acceptance

- [ ] T050 `[→Opus]` Manual acceptance across US1–US4 with a real non-leader account on desktop + mobile; full `npm run build`. Confirm no role lost prior access (My Leads/Tasks/BOQ). Then deploy to production.

---

## Dependencies & Execution Order

- **Phase 0** informs Phase 3 (T002) and gates the board (T003).
- **US1 (T010)** is the crux and unblocks everything visible; do it first, verify on a test account.
- **US2** right after US1 so reps aren't dropped on the raw board.
- **US3/US4** preserve capture UX; can follow.
- **T050** last, then deploy.

## Delegation Notes

- **Opus** owns the shell gate (T010) and verifications (T001/T003/T012/T050) — small but load-bearing and auth/routing-sensitive.
- **Sonnet** owns the routing + UI stories (US2/US3/US4).
- Keep the manual-guarantee guardrail in every delegated prompt: this feature changes visibility/nav only, never automation.
