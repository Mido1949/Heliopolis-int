# HelioMax Platform — Master Build Brief (v1.0)

> **Purpose:** This is the single source of truth for transforming the HelioMax internal app from a passive record-keeping system into an active, AI-driven operations platform.
> **Repo:** `Mido1949/Heliopolis-int` → local: `D:\HelioMax`
> **Stack:** Next.js 14.2 (App Router), TypeScript, Supabase, Tailwind, Ant Design, Recharts
> **Author:** Mido | **Date:** June 2026
>
> ⚠️ **HOW TO USE THIS BRIEF:** This is a REFERENCE document, not a single prompt. Do NOT paste the whole thing into an agent and code everything at once. Implementation is split into PHASES (Section 8). Build one phase, confirm it works, then move to the next. Each phase becomes its own Spec-Kit spec.

---

## 1. The Core Problem (Why we are rebuilding)

The current app is **passive**: the team manually enters data and the app just stores it. The result:
- No clear sales pipeline — Mido cannot answer "is the model working?" or "how many real clients are in discussion?"
- The app records **activity** (calls, quotes) but not **outcomes** (won/lost/value).
- Half the team (5 Tech members) refuse to use the BOQ feature and work in Excel because it is faster.
- Performance issues force constant hard-refresh / logout-login, wasting team time.

**The goal:** Turn the app into an **active operations system** that plans, assigns, thinks, and notifies — and pull 100% of company work inside the app (zero external tools).

---

## 2. Users & Roles

| Role | Count | Access |
|---|---|---|
| **CS User** | 3 (2 on CRM, 1 on after-sales) | AI assistant + own daily tasks + own personal report + a CRM page **filtered to their own clients only** (add/view/manage their own leads). Cannot see other users' clients. |
| **Tech User** | 5 | AI assistant + own daily tasks (BOQ work) + own personal report |
| **Tech Team Lead** | 1 | Full edit/add in CRM & BOQ; can use data scraping & email campaigns; view inventory; view full team performance. (Admin for the technical side — NOT system settings/user management.) |
| **Admin (Mido)** | 1 | Everything. All pages, full visibility, system settings, user management. Receives the daily AI company report. |

---

## 3. The Sales Pipeline (THE FOUNDATION — build this first)

The pipeline was previously undefined, which is why no metrics existed. Defined stages:

```
1. NEW            → Lead enters (Facebook lead form / written data import)
2. CONTACTED      → CS made a call + entered data into CRM
3. ASSIGNED_TECH  → CS assigned the lead to Tech team
4. QUOTED         → Tech created the BOQ + sent it via WhatsApp
5. FOLLOW_UP      → Assigned back to CS for follow-up
   ── End states ──
6. WON            → Client approved + paid down payment   (capture DEAL VALUE here)
7. LOST_PRICE     → Client rejected the price
8. GHOSTED        → Client went silent / disappeared
9. POSTPONED      → Client postponed the decision
```

**Required fields per lead:** source, current stage, assigned_to (user), assigned_team (CS/Tech), deal_value (filled at WON), stage timestamps (for time-in-stage analytics), last_contact_date.

**Why this matters:** Every metric, every AI insight, and the daily report are computed FROM this pipeline. Without it, nothing downstream works.

**Metrics this unlocks:**
- Conversion rate (NEW → WON %)
- Active clients in discussion (stages 2–5)
- Where deals die (which stage has the biggest drop-off)
- Pipeline value (sum of deal_value in active stages)

---

## 4. The Lead Lifecycle (current real workflow)

```
Lead enters (Facebook / written data)
   ↓ CS receives → makes calls → enters data in CRM
   ↓ CS assigns to Tech
   ↓ Tech calls client → builds BOQ → sends via WhatsApp
   ↓ Tech assigns back to CS for follow-up
   ↓ CS follows up → one of 4 outcomes (WON / LOST_PRICE / GHOSTED / POSTPONED)
```

**Assignment hand-off** must be a first-class action (currently informal). When a user finishes their task, they re-assign to the other team via a simple action/chat command, which auto-notifies the receiving user.

### 4.1 CRM access for CS users (data isolation)

CS users need to both add new clients AND see/manage their own clients — but must NOT see other users' clients.

**Two complementary ways to work — both write to the same data:**
- **Via the AI assistant (fast entry):** during/after a call the CS says e.g. "add a new client: Ahmed, 010..." and the AI creates the lead. Best for quick capture.
- **Via a CRM page (view & manage):** each CS user opens a CRM page that shows **only their own clients** — to review status, manage their pipeline, and follow up.

**Data isolation is enforced at the database level via Supabase Row Level Security (RLS), NOT just by hiding UI.** A CS user technically cannot query another user's leads. (RLS was already used in the previous LOOMARK build — reuse that pattern.)

- CS users: see only their own leads.
- Tech Team Lead & Admin: see all leads (per Section 2).

Whether a client is added via the AI or the CRM page, it appears in both views — single source of truth.

---

## 5. The BOQ Engine (CRITICAL — must beat Excel)

The Tech team abandoned the in-app BOQ for Excel. Analysis of their actual Excel file reveals exactly why, and what the new BOQ must do.

### 5.1 What the Excel does (and the app must replicate)

**Load calculation sheet (per-room sizing):**
- Columns: Room name, Length, Width, Area (=L×W), Heat factor (=Area×0.3), Required capacity (kW), Qty
- The tech sizes each room's cooling need before choosing units.

**Quote build sheet:**
- Rows of units: Type, Capacity (kW), Qty, **Model number**
- Type the model → **unit price auto-fills from price list** (Excel uses `VLOOKUP` against a price-list sheet)
- Total per line = Qty × Unit Price (instant)
- Y-branch auto-calc: `(SUM of unit qtys − 2) × 2`
- Grand total = SUM of lines
- Discounted total (e.g. ×0.75 for 25% off)

**Price list (98 models):** Model | Capacity (kW) | Description | Price ($). This is the VLOOKUP source.

**Fixed quote template (reused every time):**
- Header: "Commercial Offer For VRF", From Heliopolis, To [client], date, PI No.
- Standard inclusions (commissioning, 3-year warranty)
- Standard exclusions (builders' work, copper pipes, power/water, electrical, drainage, etc.)
- Terms: 10% down payment, 90% upon delivery
- Validity: 7 days
- Signatures: Sales Engineer / Sales Manager / Financial Director

### 5.2 Why Excel wins (the requirements this dictates)

| Excel strength | New BOQ requirement |
|---|---|
| Type model → price auto-fills (VLOOKUP) | Model field with autocomplete from price-list DB; price auto-populates on select |
| Instant calculations | All math (line total, grand total, discount, Y-branch) computes live as you type |
| Keyboard-only entry, Tab between cells | Editable grid; Tab/Enter navigation; add row with Enter — NO modal forms per line |
| Copy/paste rows fast | Duplicate-row action; paste support |
| Familiar spreadsheet feel | The BOQ screen must be a SPREADSHEET-LIKE GRID, not a form |
| Template is reusable | Quote template (inclusions/exclusions/terms/signatures) stored once, auto-applied |
| One-click result | Generate branded PDF quote with one button |

### 5.3 Price list = the engine's fuel
- The 98-model price list must live in the database (a `price_list` table).
- It must be **easily updatable** (the current one is outdated). Admin / Tech Lead can edit prices in-app.
- The BOQ pulls live prices from this table — change a price once, all new quotes use it.

### 5.4 Must include the load-calculation step
- Add a per-room load calculator (L × W × factor → required kW) so the tech sizes rooms inside the app, then maps each to a model. This is half of why Excel was being used.

> **Acceptance test for BOQ:** A tech can build a full multi-unit VRF quote, with load calc, live pricing, discount, Y-branch, and PDF export — faster than they currently do it in Excel, using mostly the keyboard. If it is slower than Excel, it has failed.

---

## 6. AI Assistant Login & Daily Experience

### 6.1 Conversational login (with secure password handling)
```
User opens app
   ↓ AI assistant greets: "Hello! Who are you?"
   ↓ User types/selects their name  (normal chat — fine)
   ↓ AI: "Welcome [name] 👋 enter your password"
   ↓ A SECURE password field (masked ••••) appears INSIDE the chat
     — the password is NEVER a plain chat message, never logged, never sent to any LLM
   ↓ Login happens in the background (Supabase Auth)
   ↓ Opens directly onto the user's daily tasks, assistant stays available 24/7
```
**Security rule (non-negotiable):** the password is captured via a real masked auth input, not as conversational text. Session is remembered so users don't re-enter the password daily — this kills login friction.

### 6.2 Daily tasks view
- After login, each user lands on **their tasks for today** (system-generated from the pipeline).
- The AI assistant acts as a 24/7 auditor/helper alongside the user.

### 6.3 3:30 PM personal report
- At 3:30 PM daily, each user gets a prompt: **"Download your report today."**
- Report content = **activity + outcome** (Type B):
  - Activity: calls made, leads entered, leads assigned, BOQs created
  - Outcome: of those, how many WON (with value), LOST, FOLLOW_UP, etc.
- User downloads it as PDF and brings it to Mido's desk.
- Each user is responsible for their own report.

---

## 7. The AI Brain (Company-level intelligence)

Separate from the personal reports. This is Mido's "Jarvis report."

### 7.1 Daily company report
- Delivered to **Mido at 4:30 PM daily**, via **Email or Telegram**.
- Content: whole-company + per-team summary:
  - Pipeline snapshot (leads per stage, conversion rate, pipeline value)
  - Team performance (CS + Tech)
  - Wins/losses of the day with values
  - Flags: leads stuck in a stage too long, POSTPONED/GHOSTED leads needing follow-up
  - AI insight: where the funnel is leaking, what to focus on tomorrow

### 7.2 Automation targets (build AFTER the foundation)
- **Auto lead intake:** data scraping runs automatically → new leads auto-added to CRM with stage=NEW.
- **Auto task creation:** when a lead lands, the system auto-creates the call task for the right CS user.
- **Auto notifications:** users notified on new assignments, due follow-ups, stuck leads.
- **Auto re-assignment hand-off:** when a user finishes a task, a simple chat/command re-assigns to the other team and notifies them.

---

## 8. Performance & Stability (a real, daily pain)
- The team currently does frequent hard-refresh / logout-login. This must be diagnosed and fixed.
- Likely culprits to investigate: stale Supabase sessions, missing data revalidation, over-use of `force-dynamic` without caching strategy, auth token expiry handling.
- Target: the app stays responsive across a full workday with no manual refresh/relogin.

---

## 9. Future-Ready (design for, don't build yet)
- **Meta integration:** Facebook Lead Ads → auto-create leads (webhook already explored previously).
- **WhatsApp integration:** send quotes and follow-ups from inside the app; receive replies into a unified inbox.
- Build the data model and assignment system so these plug in later without rework.

---

## 10. IMPLEMENTATION PHASES (build in this order)

> Each phase = one Spec-Kit spec. Confirm each works before the next. Do NOT batch them.

**PHASE 0 — Rebrand & cleanup (mechanical, safe)**
- Rename all "Loomark" → "HelioMax" across the codebase, metadata, logo, title.
- Acceptance: `grep -ri loomark` returns zero in source; app builds & runs.

**PHASE 1 — Performance & stability fix**
- Diagnose and fix the refresh/relogin problem. This is foundational — everything else sits on a stable app.

**PHASE 2 — The Pipeline (the foundation)**
- Implement the 9-stage pipeline, lead fields (stage, assigned_to, team, deal_value, timestamps).
- Build a clear pipeline/kanban view. Add WON value capture.
- Implement RLS so CS users see only their own leads; build the CS CRM page (own clients only) with add-client. (See Section 4.1)
- Acceptance: Mido can see leads per stage, conversion rate, active clients, pipeline value; a CS user sees only their own clients.

**PHASE 3 — The BOQ Engine (beat Excel)**
- Price-list table (editable, seed from the 98-model list).
- Spreadsheet-like BOQ grid: keyboard nav, model autocomplete + auto price, live totals, discount, Y-branch.
- Load calculator (per-room sizing).
- Reusable quote template → one-click branded PDF.
- Acceptance: a tech builds a full quote faster than Excel.

**PHASE 4 — AI Assistant login + daily tasks + 3:30 personal report**
- Conversational login with secure masked password; remembered session.
- Per-user daily task view.
- 3:30 PM personal report (activity + outcome) as downloadable PDF.

**PHASE 5 — AI Brain: 4:30 PM company report (Email/Telegram)**
- Pipeline + team summary + insights, delivered daily.

**PHASE 6 — Automation**
- Auto lead intake (scraping → CRM), auto task creation, auto notifications, auto re-assignment hand-off.

**PHASE 7 (future) — Meta & WhatsApp integration.**

---

## 11. Hard Constraints (apply to every phase)
- Arabic (RTL) is the primary UI language; all layouts RTL-first.
- Do not break existing Supabase data or working features.
- Every page that needs it keeps `export const dynamic = 'force-dynamic'`.
- Vercel: `installCommand` uses `npm install --legacy-peer-deps`.
- Passwords never handled as plain text/chat.
- Every change reviewed and confirmed before applying (no auto-deploy without review).
