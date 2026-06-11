# Feature Specification: HelioMax Platform Transformation

**Feature Branch**: `002-heliomax-platform`

**Created**: 2026-06-04

**Status**: Draft

---

## User Scenarios & Testing

### User Story 1 — Rebrand: HelioMax Identity (Priority: P1)

Any team member opens the app and sees "HelioMax" consistently — in the browser title, the sidebar logo, the loading screen, all UI text, and all metadata. No trace of "Loomark" or "Heliopolis INT" remains in the source code.

**Why this priority**: Foundational identity change. Must happen before any other work so all new code is written with the correct brand.

**Independent Test**: Run `grep -ri "loomark\|heliopolis int" --include="*.ts" --include="*.tsx" --include="*.json" d:\HelioMax\app d:\HelioMax\components d:\HelioMax\lib d:\HelioMax\context d:\HelioMax\hooks d:\HelioMax\types d:\HelioMax\package.json` — must return zero results. App builds (`npm run build`) without errors.

**Acceptance Scenarios**:

1. **Given** any page in the app, **When** a user looks at the browser tab title, sidebar, and loading screen, **Then** they see "HelioMax" — not "Loomark" or "Heliopolis INT"
2. **Given** the source code repository, **When** a developer runs grep for "loomark" case-insensitively across source files, **Then** zero matches are returned
3. **Given** the package.json, **When** a developer reads the `name` field, **Then** it reads `"heliomax"` not `"loomark"`

---

### User Story 2 — Stability: Full Workday Without Refresh (Priority: P2)

A team member logs in at 9 AM and uses the app continuously until 5 PM without encountering a blank page, an auth error, or needing to manually refresh or re-login. Data on screen stays current automatically.

**Why this priority**: The team does hard-refreshes multiple times daily. This breaks trust in the app and wastes time. Must be fixed before features are added or the new features will also feel broken.

**Independent Test**: Log in, navigate between CRM → BOQ → Tasks → Dashboard repeatedly over 30 minutes without refresh. No auth redirects, no blank screens, no stale data visible after a mutation.

**Acceptance Scenarios**:

1. **Given** a user logged in at session start, **When** 8 hours pass with normal usage, **Then** they are still logged in with no auth errors
2. **Given** a user adds a new lead, **When** they navigate away and return to the CRM, **Then** the new lead appears without a manual refresh
3. **Given** multiple users on different devices, **When** one user updates a lead stage, **Then** the change is reflected for all viewers within 30 seconds

---

### User Story 3 — Pipeline: 9-Stage Sales Funnel (Priority: P3)

Mido opens the pipeline dashboard and sees every lead positioned in one of 9 stages. He can answer "how many leads are in discussion?", "what is the total pipeline value?", and "where are deals dying?" A CS user opens their own CRM page and sees only their leads — they cannot see colleagues' clients even if they try to query directly.

**Why this priority**: The pipeline is the foundation for all downstream metrics, AI reports, and automation. Without it, no other phase delivers value.

**Independent Test**: Create 3 leads for CS User A and 2 for CS User B. Log in as CS User A — see 3 leads only. Log in as Admin — see 5 leads. Move a lead through all 9 stages by dragging in kanban. WON stage prompts for deal_value. Dashboard shows conversion rate, active leads count, pipeline value.

**Acceptance Scenarios**:

1. **Given** a lead exists, **When** a CS user drags it from NEW to CONTACTED in the kanban, **Then** the stage updates, a timestamp is recorded, and the lead's `last_contact_date` updates
2. **Given** a lead moved to WON, **When** the stage is saved, **Then** the system requires a `deal_value` input before confirming
3. **Given** CS User A is logged in, **When** they open their CRM page, **Then** they see only their own leads — leads assigned to other CS users are invisible
4. **Given** Admin is logged in, **When** they open the pipeline dashboard, **Then** they see: leads per stage, conversion rate (NEW→WON), total pipeline value, and a drop-off chart by stage
5. **Given** a CS user attempts a direct Supabase query for another user's lead, **When** the query executes, **Then** RLS returns zero rows

---

### User Story 4 — BOQ Engine: Beat Excel (Priority: P4)

A Tech team member opens the BOQ page, creates a new quote, types room dimensions in the load calculator, selects models from a searchable list (price auto-fills), adjusts quantity, sees all totals recalculate live, sets a discount, and exports a branded PDF — all without touching the mouse for data entry, faster than their current Excel process.

**Why this priority**: Tech team abandoned the app for Excel. Until BOQ beats Excel on speed, the team will not adopt the app. This is the highest-pain feature.

**Independent Test**: Time a Tech user building a 5-room, 8-unit VRF quote from scratch: load calc → model selection → pricing → discount → PDF. Must complete faster than the same task in Excel (measured baseline). Navigation with Tab/Enter only for data entry.

**Acceptance Scenarios**:

1. **Given** a new BOQ, **When** the user enters room name, length, width in the load calculator, **Then** area, heat factor, and required kW compute automatically
2. **Given** a BOQ line item, **When** the user types a model number, **Then** an autocomplete dropdown shows matching models and selecting one populates unit price automatically from the price list
3. **Given** a BOQ with multiple line items, **When** any quantity or price changes, **Then** line total, Y-branch count `(total_qty - 2) × 2`, grand total, and discounted total all update instantly
4. **Given** a complete BOQ, **When** the user clicks "Export PDF", **Then** a branded "Commercial Offer For VRF" PDF is generated with client details, inclusions/exclusions, payment terms (10% down, 90% on delivery), 7-day validity, and signature blocks
5. **Given** the price list, **When** Admin or Tech Lead updates a model price, **Then** all new BOQs use the updated price immediately

---

### User Story 5 — AI Login + Daily Workflow + 3:30 PM Report (Priority: P5)

A team member opens the app and sees the AI assistant. They type their name, the AI asks for their password via a masked secure input (not a chat message), they log in, and land directly on today's tasks pulled from the pipeline. At 3:30 PM they receive a prompt to download their personal PDF report showing their day's activity and outcomes.

**Why this priority**: Login friction is daily pain. The personal report creates accountability without management overhead.

**Independent Test**: Open app fresh (no session). AI greets and asks for name. Type name → AI shows masked password input. Enter password → session established → tasks view loads. Verify password never appears in browser console, network logs, or AI chat history. Wait until 3:30 PM simulation → report prompt appears → download PDF → PDF contains correct activity/outcome data.

**Acceptance Scenarios**:

1. **Given** a fresh browser session, **When** the app loads, **Then** the AI greets the user and asks for their name in conversational style
2. **Given** the user typed their name, **When** the AI asks for the password, **Then** a masked `<input type="password">` appears inside the chat bubble — not a plain text message
3. **Given** a valid password entered, **When** authentication completes, **Then** the session is persisted (survives browser close/reopen) so the user does not re-enter their password on the next visit
4. **Given** a logged-in user at 3:30 PM, **When** the daily report trigger fires, **Then** they see a download prompt for their personal PDF report
5. **Given** the personal PDF report, **When** opened, **Then** it contains: calls made, leads entered, leads assigned, BOQs created, WON deals with value, LOST/FOLLOW_UP outcomes — all scoped to that user's activity that day

---

### User Story 6 — AI Brain: 4:30 PM Company Report (Priority: P6)

At 4:30 PM every working day, Mido receives an email or Telegram message with a complete company intelligence report: pipeline health, team performance, deals won/lost today, flags for stuck leads, and an AI-generated insight paragraph telling him where the funnel is leaking and what to focus on tomorrow.

**Why this priority**: Mido currently has no way to see company performance without manually reviewing each user's data. This automates his end-of-day briefing.

**Independent Test**: Trigger report generation manually (bypass time check). Verify: email or Telegram message received by Mido's account, contains all required sections, AI insight paragraph is coherent and data-grounded, stuck-lead flags correctly identify leads in same stage > 3 days.

**Acceptance Scenarios**:

1. **Given** it is 4:30 PM, **When** the scheduled job runs, **Then** Admin (Mido) receives the report via Email or Telegram within 5 minutes
2. **Given** the report, **When** opened, **Then** it contains: leads per stage, conversion rate, pipeline value, per-user activity summary, today's WON deals with values, LOST/GHOSTED/POSTPONED counts, and flags for leads stuck > 3 days in one stage
3. **Given** the AI insight section, **When** generated, **Then** it references specific data from the day (e.g., "4 leads moved to FOLLOW_UP today, 0 converted to WON — follow-up conversion may need attention")

---

### User Story 7 — Automation: Self-Running Pipeline (Priority: P7)

When a new lead arrives (via scraper or Facebook), it automatically appears in the pipeline as NEW and a call task is auto-created for the correct CS user. When a CS user marks a task done via the AI assistant, the lead is automatically re-assigned to the Tech team and a notification is sent to the receiving user.

**Why this priority**: Automation eliminates manual hand-off steps and ensures no lead falls through the cracks.

**Independent Test**: Run the scraper → verify new leads appear in CRM with stage=NEW and a task auto-created for a CS user. Mark the task done via AI chat → verify lead reassigns to Tech team and Tech user receives an in-app notification.

**Acceptance Scenarios**:

1. **Given** the scraper runs, **When** it finds new business data, **Then** leads are auto-added to the CRM with `pipeline_stage=NEW` and assigned to a CS user via round-robin
2. **Given** a new lead with `pipeline_stage=NEW`, **When** it is created, **Then** a call task is auto-created for the assigned CS user with due date = today
3. **Given** a CS user types "done" or "assign to tech" in the AI assistant, **When** the command is processed, **Then** the lead's `assigned_team` switches to Tech, stage advances to ASSIGNED_TECH, and the receiving Tech user gets an in-app notification

---

### Edge Cases

- What happens when a BOQ is exported while a price list update is in progress?
- How does RLS behave if a CS user is assigned to 0 leads — do they see an empty page or a friendly empty state?
- What if the 4:30 PM email/Telegram delivery fails — is there a retry mechanism?
- What if a lead is dragged to WON without deal_value — is the stage save blocked or does it prompt inline?
- What if two CS users are available for round-robin auto-assignment but one is inactive?

---

## Requirements

### Functional Requirements

- **FR-001**: System MUST rename all "Loomark" and "Heliopolis INT" occurrences to "HelioMax" in source files, metadata, and the package name
- **FR-002**: System MUST maintain an active Supabase session for a minimum of 8 hours without requiring re-authentication
- **FR-003**: System MUST implement a 9-stage pipeline: NEW, CONTACTED, ASSIGNED_TECH, QUOTED, FOLLOW_UP, WON, LOST_PRICE, GHOSTED, POSTPONED
- **FR-004**: System MUST record a timestamp whenever a lead changes pipeline stage
- **FR-005**: System MUST require `deal_value` input when a lead is moved to WON stage
- **FR-006**: System MUST enforce CS user data isolation at the Supabase RLS level — CS users can only read/write their own leads
- **FR-007**: System MUST expose a CS-only CRM page that shows only the logged-in user's leads
- **FR-008**: System MUST provide a `price_list` table with 98 HVAC models editable by Admin and Tech Lead roles
- **FR-009**: The BOQ grid MUST auto-populate unit price when a model is selected from the price list
- **FR-010**: The BOQ grid MUST compute line totals, Y-branch count, grand total, and discounted total in real time
- **FR-011**: The BOQ MUST support Tab/Enter keyboard navigation between cells without requiring mouse input for data entry
- **FR-012**: The BOQ MUST include a per-room load calculator (L × W × 0.3 = required kW)
- **FR-013**: System MUST generate a branded PDF quote using the fixed commercial offer template
- **FR-014**: The AI login flow MUST capture passwords via a masked HTML input — never as plain chat text
- **FR-015**: User sessions MUST persist across browser close/reopen (no daily re-login)
- **FR-016**: System MUST generate a per-user daily activity+outcome PDF report triggered at 3:30 PM
- **FR-017**: System MUST send a company-wide intelligence report to Admin at 4:30 PM via Email or Telegram
- **FR-018**: System MUST auto-create leads from scraper output with `pipeline_stage=NEW`
- **FR-019**: System MUST auto-create a call task for the assigned CS user when a new lead enters the pipeline
- **FR-020**: System MUST support AI-chat re-assignment commands that move leads between teams and notify recipients

### Key Entities

- **Lead**: id, name, phone, company, source, pipeline_stage (9 values), assigned_to_user, assigned_team (cs/tech), deal_value, stage_timestamps (jsonb), last_contact_date, created_at, updated_at
- **PriceListItem**: id, model, capacity_kw, description, price_usd, updated_at, updated_by
- **BOQRoom**: id, boq_id, room_name, length, width, area, heat_factor, required_kw, qty
- **BOQItem**: id, boq_id, product_id, model, quantity, unit_price, total, location
- **Task**: id, title, assigned_to, lead_id, due_date, status, source (manual/auto), created_at
- **Profile**: id, name, role, team, crm_team, is_admin

---

## Success Criteria

- **SC-001**: Zero occurrences of "Loomark" or "Heliopolis INT" in source files after Phase 0
- **SC-002**: Team members use the app for a full 8-hour workday without a single manual refresh or re-login
- **SC-003**: Mido can answer "how many active leads are in discussion and what is their total value?" in under 10 seconds from the dashboard
- **SC-004**: A Tech user builds a complete 5-room VRF quote (load calc + pricing + PDF) faster than the same task in Excel
- **SC-005**: CS users are unable to access another user's leads via any method (UI, direct API call, or Supabase direct query)
- **SC-006**: 100% of new leads from the scraper appear in the CRM within 60 seconds of scraper completion
- **SC-007**: Admin receives the 4:30 PM company report every working day without manual intervention

---

## Assumptions

- The Supabase project and all existing tables (leads, profiles, boq, boq_items, tasks, call_logs, etc.) remain in place — migrations are additive only
- The 98-model price list will be seeded from the existing Excel file provided separately
- "Telegram" delivery for the company report uses a bot token and chat ID stored as environment variables
- Session persistence uses Supabase's `persistSession: true` with localStorage
- The 3:30 PM and 4:30 PM triggers are implemented as Vercel Cron Jobs (using Next.js route handlers)
- Facebook Lead Ads webhook integration is out of scope for Phase 6 (marked as Phase 7 / future)
- RTL layout is already configured globally via Ant Design — new components must follow this pattern
- The existing `export const dynamic = 'force-dynamic'` directives on server pages are preserved
