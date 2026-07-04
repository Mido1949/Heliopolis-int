# Feature Specification: Team Works in the Full App (retire chat-only)

**Feature Branch**: `006-team-full-app`

**Created**: 2026-07-03

**Status**: Draft

**Input**: Owner decision (Mido) after advisor review (Fable option **B**). Leads arrive from **multiple sources** — Meta ads, direct/walk-in, phone calls, and large batches of old/historical data — so a guided one-lead-at-a-time chat is the wrong container for pipeline work. Give the whole team the full app (including the CRM board); keep Helio chat as an optional accelerator, not the required container.

## Guiding Principles

- **The shared board is the CRM.** "Every team completes each other" is only possible on a pipeline everyone can see. The Kanban with Tech/CS/Sales zones is the literal picture of that.
- **Manual stays manual.** Atomic claim, no round-robin, autonomy = reminders-only. This feature exposes the *existing* manual board to more people; it adds no automation.
- **Chat is an accelerator, not a cage.** Helio remains great for single-lead capture during a call and quick Q&A — reachable everywhere, required nowhere.
- **Don't overwhelm.** Reps land on their focused daily surface (My Day / My Leads); the full board is one click away when they need to triage or claim.

## Background (current state)

- `components/layout/Shell.tsx:36` gates the UI: `isNormalUser = role !== 'admin' && role !== 'Tech Team Leader'`. Every other role (Sales Engineer, Telesales, Call Center, CS Team Leader, **and Manager**) is forced into `NormalUserShell` — a chat-only 3-column layout with **no sidebar and no board access**.
- The full shell (`Sidebar` + `Navbar` + floating `HelioAgent`) is only for `admin` + `Tech Team Leader`.
- `Sidebar` gates nav by org **module** + a small `ROLE_RESTRICTED` map. `crm` requires the `crm` module (enabled) and is **not** role-restricted — so any role in the full shell already sees the CRM nav.
- Live RLS already grants **org-wide SELECT** on `leads` (`leads_select_all USING(true)`), so the board renders for everyone; UPDATE stays owner/leader-gated; claim is the atomic `WHERE assigned_to_user IS NULL`.
- All 005 board tooling (atomic claim, SLA colors, next-step, WhatsApp templates, bulk, funnel, My Day) already exists — this feature makes it reachable by the team.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The team gets the full app + board (Priority: P1)

A non-admin team member (Sales/Telesales/Call Center/CS/Manager) logs in and sees the standard app shell — sidebar nav with the **CRM board**, My Leads, Tasks, BOQ, Reports — instead of the chat-only screen.

**Why this priority**: This is the whole feature. Until the team can reach the board, "everyone works the shared pipeline" is impossible. It's also the lowest-effort highest-impact change (one gate + verify nav/RLS).

**Independent Test**: Log in as a Telesales/Call Center user → the sidebar shows CRM; opening CRM shows the Kanban board with all org leads (including unassigned NEW). They can claim an unassigned lead, drag/advance stages, and hand off — using the existing 005 tooling.

**Acceptance Scenarios**:

1. **Given** a non-admin, non-Tech-Team-Leader user, **When** they log in, **Then** they get the full sidebar shell (not the chat-only NormalUserShell).
2. **Given** that user, **When** they open the CRM board, **Then** they see all org leads including the unassigned NEW pool, and can claim one atomically.
3. **Given** two team members, **When** both claim the same unassigned lead, **Then** exactly one wins (409 for the other).
4. **Given** a non-owner non-leader, **When** they try to edit a lead they don't own, **Then** they act via claim, not a silent edit (existing US1 gating holds on the board).
5. **Given** the board is now visible to the team, **When** the nightly brain cron runs, **Then** it still moves/reassigns **nothing** (autonomy = reminders-only).

---

### User Story 2 - Reps land on a focused home, not an overwhelming wall (Priority: P1)

On login (especially on mobile), a rep lands on their personal daily focus — My Day / My Leads (their SLA-red + due next-steps) — with the full board a click away, so the change doesn't drown them in a 10-column board.

**Why this priority**: The board was hidden partly to keep the team's UX simple. Exposing it must not overwhelm them; the default surface should still be "what do I do today," which drives adoption.

**Independent Test**: Log in as a rep on a phone-sized viewport → land on My Day / My Leads (not the raw Kanban). The board is reachable from the sidebar. On desktop, the board is readily available for triage.

**Acceptance Scenarios**:

1. **Given** a rep logs in, **When** the app loads, **Then** their default landing is My Day / My Leads (their actionable list), not the full board.
2. **Given** a rep on a narrow/mobile viewport, **When** they use the app, **Then** the primary experience is the list/My Day (board drag is desktop-first; claim/stage still work on touch per 005).
3. **Given** a leader/manager, **When** they log in, **Then** they can reach the board and oversight tools (funnel, bulk) as before.

---

### User Story 3 - Helio demoted to an optional assistant (Priority: P2)

Helio chat is no longer the forced home container. It's reachable from anywhere (floating launcher and/or `/helio`) and still does single-lead capture ("سجّل عميل"), call logging, and quick Q&A.

**Why this priority**: Keeps the genuinely useful capture/assistant UX without forcing the whole pipeline through it. The floating `HelioAgent` already exists for full-shell users — this mostly means the team now gets it too.

**Independent Test**: As a rep in the full shell, open the Helio launcher → run "سجّل عميل" and complete a capture; ask a quick question. It works without being the only screen.

**Acceptance Scenarios**:

1. **Given** a rep in the full shell, **When** they open Helio, **Then** they can capture a single lead via the guided flow and log a call.
2. **Given** the guided capture, **When** a lead is created, **Then** it follows the manual rules (lands appropriately, owner set to the creator or unassigned per the agreed capture behavior) and is visible on the board.

---

### User Story 4 - Fast lead capture preserved for all three real situations (Priority: P2)

The team can capture a lead the right way for the situation: **guided chat** (one lead during a call), **quick form** (desk entry — `LeadFormModal`), and **import** (batches / historical — `ImportModal`), all reachable from the board / My Leads.

**Why this priority**: Leads come from many sources; capture must fit each. The guided flow shouldn't be lost when the chat is demoted.

**Independent Test**: From the board/My Leads, a rep can: open the quick-add guided flow, open the fast form, and (leaders) open bulk import — each creates leads that appear on the board with dedupe applied.

**Acceptance Scenarios**:

1. **Given** the board/My Leads, **When** a rep uses "＋ إضافة سريعة", **Then** the guided capture (or the fast form) opens and creates a lead.
2. **Given** a batch of historical leads, **When** a leader imports them, **Then** they land with phone-normalized dedupe (005) and appear on the board.

---

### Edge Cases

- A rep who was mid-chat-flow when the shell changes → no data loss; the guided flow still exists in the demoted Helio.
- Roles not previously considered (e.g., a bare `CS Team Leader` or `Manager` who was in chat-only) now get the full shell — verify their nav/module access is correct.
- Mobile drag on the 10-column board is awkward → reps default to My Day/list; tap-to-claim + stage change still work (005).
- Org modules: if an org doesn't have the `crm` module enabled, the board nav correctly stays hidden (module gating unchanged).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: All team roles (not just admin/Tech Team Leader) MUST receive the full app shell (Sidebar + Navbar), not the chat-only `NormalUserShell`.
- **FR-002**: The CRM board, My Leads, Tasks, BOQ, and Reports MUST be reachable from the team's navigation (subject to existing org-module gating).
- **FR-003**: The board MUST show all org leads including the unassigned NEW pool; claiming MUST be atomic (existing US1 route/policy).
- **FR-004**: Editing/stage/owner changes MUST remain owner-or-leader gated; non-owners act via claim (existing US1 gating).
- **FR-005**: Reps MUST default to a focused personal landing (My Day / My Leads), especially on mobile; the board is available but not the forced first screen.
- **FR-006**: Helio chat MUST remain available as an optional assistant (launcher and/or `/helio`), including the guided "سجّل عميل" capture and call logging — never the required container.
- **FR-007**: The guided capture, the fast `LeadFormModal`, and the bulk `ImportModal` MUST all remain available paths to create leads, reachable from the board/My Leads.
- **FR-008**: No automation may move/assign leads (autonomy stays reminders-only); this feature only changes visibility/navigation, not pipeline automation.
- **FR-009**: Leaders/Managers MUST retain oversight tools (funnel report, bulk actions) on the board.
- **FR-010**: The change MUST NOT break existing per-role module gating or org isolation.

### Key Entities

- No new entities. Uses existing `leads`, `tasks`, `lead_activities`, `profiles.role`, org `modules`. RLS unchanged (already org-wide SELECT).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A non-admin rep can, in one session, reach the CRM board and claim an unassigned lead — something impossible before.
- **SC-002**: Reps default to My Day / My Leads on login (0 reps dropped straight onto the raw 10-column board on mobile).
- **SC-003**: Helio capture ("سجّل عميل") and call logging still work from the demoted assistant (no capability lost).
- **SC-004**: The whole team (all roles) can see the same shared pipeline — "every team completes each other" is now literally visible.
- **SC-005**: Post-change, the brain cron still performs 0 auto-assignments/moves (manual guarantee intact).

## Assumptions

- The org's `crm` module is enabled (it is — admins use the board today).
- Live RLS already grants org-wide SELECT on `leads` (verified); no RLS change is required for the board to render for the team. UPDATE stays owner/leader-gated.
- `NormalUserShell` is retired as the *forced* container but its useful pieces (guided capture, daily-report/BOQ panels) are preserved by folding into the rep home / the demoted Helio, not deleted outright.
- Verification is `npx tsc --noEmit` + `npm run build` + manual acceptance per story (no automated test runner).
