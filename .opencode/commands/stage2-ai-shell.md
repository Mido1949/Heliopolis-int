# Stage 2 — AI-First Shell

## Prerequisites
Stage 1 must be complete (price_list table populated, notifications table exists).

## Your role
You are the coder. Restructure the app layout so normal users (CS/Tech) see ONLY the
AI assistant + 2 side panels. Admins and Tech Leads keep full access. Report before
and after each file you change.

## Critical rules
- DO NOT break existing pages for Admin and Tech Lead roles.
- DO NOT touch the login page or authentication flow.
- Keep Arabic RTL intact everywhere.
- Password is NEVER plain text — always a masked input.
- Preserve all existing page routes — only the shell changes, not the pages themselves.

---

## Task A — Role detection

In `context/AuthContext.tsx`, confirm that `profile.role` is already available.
Valid roles (from DB): 'admin', 'Tech Team Leader', 'CS Team Lead', 'staff'.

Normal user = role is NOT 'admin' AND NOT 'Tech Team Leader'.

---

## Task B — New NormalUserShell component

Create `components/layout/NormalUserShell.tsx`.

Three-column layout (full viewport, no sidebar):

```
┌──────────────────┬──────────────────────────────┬──────────────────┐
│  Daily Report    │                              │   My Quotes      │
│  Panel (200px)   │   AI Chat — full height      │   (BOQ) Panel    │
│                  │   "أهلاً يا [name]!"         │   (200px)        │
│  Shows:          │   + input box at bottom      │                  │
│  - today's KPIs  │                              │  - recent BOQs   │
│  - follow-ups    │                              │  - "New BOQ" btn │
│  - pending tasks │                              │                  │
└──────────────────┴──────────────────────────────┴──────────────────┘
```

Design specs:
- Background: `#F4F6F8` (same as full shell)
- Left panel: white card, 200px min, shows personal stats
- Center: `bg-[#0D2137]` dark, chat messages + input (same style as HelioAgent panel)
- Right panel: white card, 200px min, recent quotes list
- Navbar at top (same as full shell — user name, org, logout)
- The AI chat in the center uses `/api/agent/chat` (same endpoint as HelioAgent)
- RTL: main text direction right-to-left

The center AI panel MUST include the conversational lead creation flow (Task D below).

---

## Task C — Update Shell.tsx for role routing

In `components/layout/Shell.tsx`:

```typescript
const { profile } = useAuth();
const isNormalUser = profile && 
  profile.role !== 'admin' && 
  profile.role !== 'Tech Team Leader';

if (isNormalUser) {
  return <NormalUserShell>{children}</NormalUserShell>;
}
// existing Shell renders for admin + Tech Lead
```

---

## Task D — AI lead creation intent

In `app/api/agent/chat/route.ts`, add a `register_lead` intent handler.

Trigger patterns (Arabic + English):
- "سجّل عميل", "اضف عميل", "register client", "new client", "عميل جديد"

When triggered:
1. Return a structured JSON response with `action: "register_lead_step"` and the next question
2. The front-end (NormalUserShell chat) tracks the conversation state
3. Questions in order: name → phone → region → project_type → source → budget_range
4. After all answers: POST to `POST /api/leads` with all fields + `pipeline_stage: 'NEW'`
5. AI confirms: "تم تسجيل [name] — رقم الهاتف [phone] ✅"

Field mapping:
```
name          → leads.name
phone         → leads.phone
region        → leads.region (add column if needed, text)
project_type  → leads.notes (prefix "Project: ")
source        → leads.source
budget_range  → leads.deal_value (parse number from text)
```

Security: the AI ONLY creates leads for the currently logged-in user.
`assigned_to_user = auth.uid()`, `assigned_to_team = 'cs'`, `created_by = auth.uid()`.

---

## Task E — My Leads page for normal users

Create `app/(dashboard)/my-leads/page.tsx`.

Simple list (not the full CRM):
- Fetches only leads where `assigned_to_user = user.id` (RLS already enforces this)
- Shows: name, phone, stage tag, last_contact_date, next follow-up
- Clicking a row opens `LeadDrawer` (reuse existing component)
- "Add Client" button triggers the AI lead creation flow

This page is accessible from the BOQ right panel and from the AI chat.

---

## Acceptance test (manual, on localhost)

1. Login as a CS user (not Mido, not a Tech Lead) → 
   Should see: NormalUserShell 3-column layout, NO sidebar
2. In the AI chat type "سجّل عميل جديد" →
   Should: AI asks name, phone, region, project type, source, budget one by one →
   After last answer: lead appears in `/crm` (check as admin) with all fields filled
3. Right panel shows any existing BOQs for that user + "New BOQ" button
4. Login as Mido (admin) → Full shell unchanged, all pages accessible
5. Login as a Tech Lead → Full shell unchanged

## Report when done
List every file created or modified with a one-line description of the change.
