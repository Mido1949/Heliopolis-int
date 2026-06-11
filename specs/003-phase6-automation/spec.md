# Feature Specification: Phase 6 — HelioMax Automation

**Feature Branch**: `003-phase6-automation`

**Created**: 2026-06-05

**Status**: Draft

## User Scenarios & Testing *(mandatory)*

---

### User Story 1 — Price List In-App Editor (Priority: P1)

The Tech Team Lead or Admin opens the Settings page and navigates to "Price List". They see all 97 AC models with their prices in an editable table. They update a price and save — the change immediately reflects in all new BOQ quotes without any developer involvement.

**Why this priority**: The current price list is hardcoded/seeded and becomes outdated. Every outdated price means incorrect client quotes going out. This is a daily business pain with zero code needed except wiring an existing component.

**Independent Test**: Can be tested fully by: opening Settings → Price List, editing one model price, creating a new BOQ, verifying the new price auto-fills.

**Acceptance Scenarios**:

1. **Given** Admin opens Settings, **When** they click "قائمة الأسعار", **Then** they see a table of all 97 models with editable price, capacity, and description fields.
2. **Given** Tech Lead edits a price and saves, **When** a Sales Engineer creates a new BOQ and selects that model, **Then** the new price appears automatically.
3. **Given** a non-Admin/non-Tech-Lead user, **When** they try to access Price List editor, **Then** they are denied access (Admin and Tech Lead only).

---

### User Story 2 — Automatic Notifications: Stuck Leads & Assignment Alerts (Priority: P2)

A CS user logs in and sees a red badge on the notification bell. They click it and see: "3 leads have been stuck in CONTACTED for more than 3 days" and "Lead Ahmed Sayed was assigned to you by Mido". These alerts appear inside the app without the user needing to check anything manually.

**Why this priority**: Without notifications, leads fall through the cracks silently. Users miss assignments. Mido can't act on stuck deals without manual checking. This directly reduces lost revenue.

**Independent Test**: Can be tested by: seeding a lead with `updated_at` 4 days ago in CONTACTED stage, running the stuck-leads check, and verifying a notification appears for the assigned user.

**Acceptance Scenarios**:

1. **Given** a lead has not changed stage for 3+ days, **When** the daily check runs, **Then** an in-app notification is created for the lead's assigned user with the lead name and how many days it has been stuck.
2. **Given** a lead is reassigned to a new user (via `assigned_to_user` update), **When** the assignment is saved, **Then** an in-app notification is instantly created for the receiving user: "تم تحويل [lead name] إليك".
3. **Given** a user has unread notifications, **When** they open the app, **Then** a notification bell with a badge count is visible in the shell header.
4. **Given** a user clicks the notification bell, **When** the panel opens, **Then** they see all unread notifications with timestamp, and can mark them as read.

---

### User Story 3 — Auto Task Creation When Lead Enters Pipeline (Priority: P3)

When a new lead is created in the CRM (stage = NEW), the system automatically creates a task: "اتصل بـ [lead name]" assigned to the lead's assigned CS user, with a due date of today. The CS user sees this task on their task board without needing manual entry.

**Why this priority**: Eliminates the manual step of "remember to create a task after adding a lead". Ensures no new lead is ever forgotten within the first 24 hours.

**Independent Test**: Can be tested by creating a new lead via the AI shell or CRM form and verifying a call task appears in the tasks page for the assigned user.

**Acceptance Scenarios**:

1. **Given** a new lead is saved with `assigned_to_user` set, **When** the lead is created, **Then** a task is automatically created: title "اتصل بـ [lead name]", type "call", assigned to same user, due today.
2. **Given** a lead is created WITHOUT an assigned user, **When** it enters the system, **Then** no auto-task is created (task would have no owner).
3. **Given** an auto-task already exists for a lead, **When** the lead is updated (not created), **Then** no duplicate task is created.

---

### User Story 4 — System-Approval Knowledge Base in Helio AI (Priority: P4)

Mido adds company knowledge files to the `system-approval/` folder (products, pricing policy, team structure, FAQ). When a Sales Engineer asks Helio "ما سعر وحدة كاسيت 24 ألف BTU؟" or "ما هي شروط الضمان؟", Helio answers accurately using the company files — not generic AI knowledge.

**Why this priority**: Helio currently answers from general AI knowledge, which can be inaccurate for company-specific details. Company data makes Helio genuinely useful as a daily assistant.

**Independent Test**: Add a `system-approval/pricing.md` with a specific price. Ask Helio that price. Verify the answer matches the file, not a generic response.

**Acceptance Scenarios**:

1. **Given** `system-approval/products.md` exists with specific model data, **When** a user asks Helio about that product, **Then** Helio answers using the file content, not generic knowledge.
2. **Given** system-approval files are updated, **When** the next chat session starts, **Then** Helio uses the updated content (no redeploy needed for content changes).
3. **Given** no system-approval files exist, **When** Helio is asked company-specific questions, **Then** Helio gracefully says it doesn't have that info yet rather than hallucinating.

---

### Edge Cases

- What if the notifications table already has 100+ unread notifications for a user — paginate or cap display at 20 most recent.
- What if a price list model is deleted — existing BOQs with that model should retain their saved price, not break.
- What if `system-approval/` files are very large (>100KB) — truncate or summarize to avoid exceeding the AI context window.
- What if a lead has no `assigned_to_user` set — skip auto-task creation and stuck-lead notification (no target user).

---

## Requirements *(mandatory)*

### Functional Requirements

**Price List Editor**
- **FR-001**: System MUST display all price list models in an editable table on the Settings page, accessible to Admin and Tech Lead roles only.
- **FR-002**: System MUST allow Admin and Tech Lead to edit price, capacity, and description per model and save changes to the database.
- **FR-003**: System MUST reflect price changes immediately in all new BOQ quotes (no cache).

**Auto Notifications**
- **FR-004**: System MUST run a daily check that detects leads unchanged for 3+ days and creates in-app notifications for the assigned user.
- **FR-005**: System MUST create an instant in-app notification when `assigned_to_user` changes on a lead.
- **FR-006**: System MUST display a notification bell with unread count badge in the app shell header, visible to all logged-in users.
- **FR-007**: System MUST show a notification panel listing unread notifications (newest first, max 20 shown).
- **FR-008**: System MUST allow users to mark notifications as read (individually or all-at-once).
- **FR-009**: Notification bell and panel MUST be present in both NormalUserShell and the full dashboard layout.

**Auto Task Creation**
- **FR-010**: System MUST automatically create a "اتصل بـ [name]" call task when a new lead is created with a non-null `assigned_to_user`.
- **FR-011**: Auto-created tasks MUST have: `title = "اتصل بـ [lead name]"`, `type = "call"`, `assigned_to = lead's assigned user`, `due_date = today`, `lead_id = lead's id`.
- **FR-012**: Auto-task creation MUST be idempotent — creating the same lead twice must not create duplicate tasks.

**System-Approval Knowledge Base**
- **FR-013**: The Helio AI agent MUST load and include the content of all `.md` files in `system-approval/` as context in its system prompt.
- **FR-014**: System-approval content MUST be read at request time (not build time) so content updates take effect without redeployment.
- **FR-015**: If `system-approval/` is empty or files are missing, the AI MUST continue functioning normally without errors.

### Key Entities

- **Notification**: id, user_id, message (Arabic text), type ('stuck_lead'|'assignment'|'report'|'general'), read (bool), lead_id (nullable FK), created_at. Already exists via migration 005.
- **Task**: id, title, type, assigned_to, due_date, lead_id, org_id, created_by, completed (bool), created_at. Already exists in `tasks` table.
- **PriceList**: id, model, capacity_kw, description, price_usd. Already exists and seeded.
- **SystemApprovalFile**: markdown files in `system-approval/` folder — read at runtime, not stored in DB.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Admin can update any price list entry and see the change reflected in a new BOQ within 30 seconds, with no developer involvement.
- **SC-002**: Every lead stuck for 3+ days generates exactly one notification per day for its assigned user — no duplicates, no missed leads.
- **SC-003**: Every lead assignment hand-off generates an in-app notification within 5 seconds of the assignment being saved.
- **SC-004**: Every new lead with an assigned user generates exactly one auto-task within 5 seconds of creation.
- **SC-005**: Helio answers at least 80% of company-specific questions correctly when corresponding content exists in `system-approval/`.
- **SC-006**: All Phase 6 features work without breaking any existing Phase 2–5 features (CRM, BOQ, AI shell, reports, login).

---

## Assumptions

- The `notifications` table already exists in Supabase (created by migration 005). No new migration needed for the table schema.
- The `tasks` table already exists with the required columns (`title`, `type`, `assigned_to`, `due_date`, `lead_id`, `org_id`).
- `PriceListManager.tsx` component already exists at `components/boq/PriceListManager.tsx` and handles CRUD via the `/api/price-list` route — it only needs to be rendered on the settings page.
- The stuck-leads daily check can be implemented as a Vercel cron job at a convenient off-peak time (e.g., 8:00 AM Cairo).
- Assignment notifications are triggered at the API level (in the existing lead update route), not via DB triggers, to keep logic in Next.js.
- Auto-task creation is triggered at the API level when a lead is inserted, not via a Supabase DB trigger (to keep logic in one place).
- System-approval files are small enough to fit within the AI context window when combined (< 50KB total).
- Role-based access for the price list editor follows the existing `profile.role` check pattern used throughout the app (`admin` and `tech_lead` roles).
- Mobile support is out of scope — the notification panel is desktop-only for now.
