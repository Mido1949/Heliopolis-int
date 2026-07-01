# Manual Collaborative CRM + Clear Pipeline — Design Spec

**Date:** 2026-07-01
**Status:** Approved (design)
**Author:** brainstormed with Mido

## Problem

The CRM has two competing "state" fields fighting each other:
- `status` (legacy: New / Interested / Quote Sent / Won / Lost) — the entry form itself
  labels it *"سيتم إيقاف هذا الحقل لاحقًا"* (to be deprecated).
- `pipeline_stage` (9-stage funnel) — the real funnel.

Both appear in the entry form, the lead drawer, and the filters, so the pipeline is not
"clear" and the team doesn't read it the same way.

Worse, the real business flow lives almost entirely on WhatsApp and never touches the CRM:

1. **Meta ad** → lead drops into **WhatsApp**.
2. Inside the **Tech team's "room"**: a welcome message explaining the system is sent →
   if the customer is interested *and* has a project, they send it on WhatsApp → it gets
   priced → a **quote (عرض سعر)** is sent. *None of this is recorded in the CRM.*
3. After the quote, the lead goes to **Sales** — follow-up is **random/loose** and
   **nothing is recorded in the CRM pipeline**.
4. The **CS team** works the **non-responders** (WhatsApp messages nobody replied to) on
   **paper**, making phone calls to re-engage them.

Assignment is also semi-automatic today (round-robin intake from scraper/Meta, random
"send to team" RPCs), which the business no longer wants.

## Goals

1. **One** clear pipeline everyone reads the same way (retire the legacy `status` field).
2. **Enhanced lead entry** that captures the full project context up front.
3. **Fully manual & collaborative** operation: anyone can add a lead, drag it across
   stages, and send quotes. Every lead always has one visible **owner**. All automatic
   assignment is turned off.
4. **Drag-and-drop Kanban** as the primary CRM view, grouped by team zone, with WhatsApp
   quick-actions — so all teams work 100% inside the app and hand leads off cleanly.

## Non-Goals (YAGNI)

- **No WhatsApp Business API integration.** The team keeps using WhatsApp as normal; the
  CRM is the system of record they update manually, with one-click "Open WhatsApp"
  buttons. (A shared inbox can be a future phase; the design must not block it, but we do
  not build it now.)
- No changes to BOQ, email, inventory, or reporting internals beyond what the new stages
  require.
- No hard per-team permission locks — team zones organize and route, they do not block.

## Design

### 1. Unified pipeline (10 stages)

Replaces both `status` and the old 9-stage set. `status` stays in the DB for
back-compat but is removed from all UI.

| # | Stage (AR) | Code | Zone | Meaning |
|---|-----------|------|------|---------|
| 1 | 🆕 جديد | `NEW` | Tech | Meta ad lead just arrived on WhatsApp |
| 2 | 👋 تم الترحيب | `WELCOME_SENT` | Tech | Welcome message sent, awaiting reply |
| 3 | 📵 لم يرد | `NO_RESPONSE` | CS | No reply → CS chases by phone (recovery queue) |
| 4 | 🔥 مهتم / عنده مشروع | `INTERESTED` | Tech | Replied, interested, has a project |
| 5 | 🧮 جاري التسعير | `PRICING` | (open) | Project received, being priced |
| 6 | 📤 تم إرسال العرض | `QUOTED` | (open) | Quote sent; hands toward Sales |
| 7 | 🤝 متابعة السيلز / تفاوض | `NEGOTIATION` | Sales | Sales follow-up & negotiation |
| 8 | ✅ تم البيع | `WON` | Sales | Deal closed |
| 9 | ❌ خسارة | `LOST` | — | Lost — requires a reason (see below) |
| 10 | ⏸️ مؤجل | `POSTPONED` | — | Deferred, revisit later |

- **Zones** (`Tech` / `CS` / `Sales`) are for visual grouping and notification routing
  only — they do **not** restrict who can act. Stages 5–6 are open (anyone can price/quote).
- **`NO_RESPONSE`** is CS's recovery queue (replaces the paper list). When a lead replies,
  CS drags it back to `INTERESTED`.
- **`LOST` reason** (new field `lost_reason`): price / no need / competitor / ghosted /
  other — replaces the scattered `LOST_PRICE`/`GHOSTED` stages and powers loss analytics.

### 2. Enhanced lead entry form

Grouped sections. **Only Name + Phone are required**; everything else optional so entry
stays fast.

1. **Contact:** Name*, Phone/WhatsApp* (with inline "افتح واتساب" button), Company, Email.
2. **Classification:** Client Type (موزع / شركة تكييف / مقاول / عميل منفرد), Source
   (**add "إعلان ميتا" / Meta Ad**, plus WhatsApp / Direct / Phone), Region.
3. **Project (new):** Project description (free text), Capacity needed (`project_capacity`),
   Expected deal value (`deal_value`).
4. **Pipeline & ownership:** Stage (default `NEW`), Owner (default = current user, any user
   selectable), Next follow-up date.
5. **Attachments (new):** file upload for WhatsApp drawings/photos, stored via the existing
   `app/api/files` system and linked to the lead.
6. **Notes:** free text.

### 3. Board, hand-offs & manual operation

- **Kanban is the primary CRM view.** 10 columns grouped under **Tech | CS | Sales** zone
  headers. Built on the existing `KanbanView.tsx`.
- **Drag & drop** changes stage; each move writes to `stage_timestamps` and inserts a
  `lead_activities` row (mechanism already exists).
- **Hand-off rule:** dragging a lead into another team's zone leaves it **unassigned there**
  and **notifies that team**. A member **claims** it (becomes owner) or a team leader
  **assigns** it to a member. No auto round-robin.
- **Card shows:** name, company, owner avatar, stage age ("3 days in this stage"),
  WhatsApp quick-button.
- **Turned OFF:** auto round-robin in `intakeLeads` (new scraper/Meta leads land
  **unassigned in `NEW`**), and the random "إرسال للفريق (عشوائي)" RPC buttons →
  replaced by explicit **claim / assign**.
- **Notifications** (existing bell system) fire on: hand-off into a zone, being assigned/
  claimed, and a follow-up date coming due.

### 4. Data migration

DB migration under `supabase/migrations/` (following the existing date-prefixed naming):
- Add `lost_reason` (nullable text) to `leads`.
- Map existing `pipeline_stage`: `ASSIGNED_TECH`→`INTERESTED`, `FOLLOW_UP`→`NEGOTIATION`,
  `LOST_PRICE`→`LOST` (`lost_reason='price'`), `GHOSTED`→`LOST` (`lost_reason='ghosted'`);
  `NEW`/`CONTACTED`/`QUOTED`/`WON`/`POSTPONED` unchanged; add `WELCOME_SENT`, `NO_RESPONSE`.
- Leads with no stage → `NEW`.
- `status` column retained (not dropped) for back-compat; removed from all UI.

## Affected code (initial map)

- `lib/constants.ts` — replace `PIPELINE_STAGES`, drop `LEAD_STATUSES` from UI usage,
  add `LOST_REASONS`, add `Meta Ad` to `LEAD_SOURCES`.
- `types/index.ts` — new `PipelineStage` union, `LostReason`, `lost_reason` on `Lead`,
  `project_description`.
- `app/(dashboard)/crm/LeadFormModal.tsx` — rebuilt grouped entry form + attachments.
- `app/(dashboard)/crm/KanbanView.tsx` — zone grouping, stage age, claim/assign, WhatsApp.
- `app/(dashboard)/crm/LeadDrawer.tsx` — remove legacy status; claim/assign UI; lost reason.
- `app/(dashboard)/crm/page.tsx` — Kanban as default view; drop legacy status filter.
- `lib/leads/intake.ts` — stop auto round-robin; insert leads unassigned in `NEW`.
- `app/api/automation/assign/route.ts` + assign RPCs — reduce to explicit assign/claim.
- `supabase/migrations/2026XXXX_manual_crm_pipeline.sql` — schema + data migration.

## Testing

- Migration: existing leads map to correct new stages; no orphaned/invalid stages.
- Entry form: required-field validation; attachment upload; owner defaults to current user.
- Board: drag between stages updates stage + timestamps + activity log; hand-off to a zone
  leaves lead unassigned and notifies; claim/assign sets owner.
- Automation off: a scraped/Meta lead lands unassigned in `NEW` (no auto-owner).
- Notifications fire on hand-off, assign/claim, and follow-up due.

## Rollout / phasing

1. Migration + constants/types (foundation).
2. Enhanced entry form + attachments.
3. Kanban board (zones, drag-drop, claim/assign, WhatsApp, stage age).
4. Turn off automation; update drawer; loss reasons; notifications.
