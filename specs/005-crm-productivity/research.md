# Research & Decisions: CRM Productivity

## D1 — Next step: reuse `tasks` table  ✅ REVISED after live schema check

**Decision (revised 2026-07-03)**: **Reuse the existing `tasks` table** for the rep-set next step. No new `leads` columns for next-step.

**Why**: The live `tasks` table already has exactly the right shape: `title`, `description`, `due_date`, `status`, `priority`, `completed_at`, `assigned_to`, `lead_id`, `created_by`, and crucially `auto_created boolean`. The rep's "next step" is simply a `tasks` row with `auto_created = false`. The bot's (now-retired) tasks were `auto_created = true`, so the manual/auto line stays clean by filtering on that flag. My Day + reminders = query `tasks where status = open and due_date <= now()` (optionally `auto_created = false`). "One next action per lead" = show the nearest open task per lead in the UI (convention, not schema).

**Superseded**: the earlier plan to add `next_step`, `next_step_due`, `next_step_done_at` columns to `leads` — unnecessary now that `tasks` covers it. (Only `phone_normalized` remains as a new `leads` column, for US6.)

## D0 — Activity log type  ✅ RESOLVED (was an open question)

`lead_activities` uses a **free-text `type` column** (plus `body`, `details jsonb`, `duration_seconds`) — NOT a Postgres enum. So adding `next_step_set` / `next_step_done` activity types needs **no migration** — just insert rows with those `type` strings. Match the existing insert shape (`lead_id, user_id, type, body, details, org_id`).

## D2 — Atomic claim: RLS-only vs. server route

**Decision**: Server route `POST /api/leads/[id]/claim` doing a conditional update (`... where assigned_to_user is null returning id`), plus an RLS policy permitting the NULL→me transition. Empty return ⇒ 409 "already taken."

**Why**: RLS alone can gate *who* may claim but the atomicity comes from the conditional `WHERE`. A single round-trip conditional update is race-free at the DB. Server route gives a clean 409 for the UI toast.

## D3 — Autonomy: pause flag vs. code removal

**Decision**: Remove the lead-moving code paths (`rebalanceTeams` call, autonomous `create_task` block) outright; keep `autonomy_paused` as a global reminders kill switch.

**Why**: A flag left "off by default" is how we ended up hybrid. Deleting the movement code makes "manual" a property of the system, not a setting someone must remember. Reminders stay because they don't move leads and are the safety net replacing round-robin.

**Note**: Also remove `CONTACTED` from the fresh-lead query (`autonomy.ts:262`) — dead stage post-migration.

## D4 — Phone normalization library

**Decision**: `libphonenumber-js`, default region resolution order EG → SA, store E.164 in `phone_normalized`.

**Why**: Mixed `05…` (KSA local), `01…` (EG local), and `+9665…/+2010…` formats can't be reliably normalized by regex without wrongly merging distinct numbers. The library is ~145KB, tree-shakeable, battle-tested. A regex fallback stays for un-parseable input (treated as non-matching, never merged).

## D5 — WhatsApp templates location

**Decision**: Typed constant map in `lib/whatsapp.ts` (stage → `(firstName) => string`), Arabic-first, editable in one file. No DB/table for v1.

**Why**: Templates change rarely and are developer/owner-edited; a table + admin UI is scope creep. Revisit if reps need to self-edit templates.

## D6 — Funnel report computation

**Decision**: Aggregate server-side in `app/api/reports/funnel` from `stage_timestamps`; render read-only in `FunnelReport.tsx`.

**Why**: `stage_timestamps` already records entry time per stage on 890 leads. Conversion = count reaching stage N+1 / reaching stage N; velocity = avg(next_entry − entry). No new storage, reuses existing report auth.

## D7 — Default view routing (My Day)

**Decision**: In `crm/page.tsx` (or the dashboard landing), route non-leaders to the My Day list built on `my-leads`; leaders/managers keep the board. Role is already available in the profile/session.

**Why**: Behavior-driving surface for reps without removing the board for oversight roles. Reuses `my-leads`.

## Open questions (resolve during implementation)

- ~~Is `lead_activities.activity_type` a Postgres enum or free text?~~ **RESOLVED (D0):** free-text `lead_activities.type`; no migration needed.
- ~~Exact live RLS policy names on `leads`~~ **RESOLVED (T003):** captured in `contracts/live-rls-leads.sql`; live DB already org-wide read+update.
- SLA thresholds per stage or global? Start global (`amberDays: 2, redDays: 5`); make per-stage only if the team asks.
- Does `tasks` have its own RLS that lets owners create their own rows? Verify before US5 so the next-step create isn't blocked (check `pg_policies` for `tasks`).
