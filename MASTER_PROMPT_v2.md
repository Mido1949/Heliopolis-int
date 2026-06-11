# MASTER BUILD PROMPT — HelioMax Platform (Execution Round 2)

## ROLE & DELEGATION
You are the PLANNER and REVIEWER. Delegate all code writing to OpenCode.
Your job: break this into ordered steps, hand each coding task to OpenCode,
then review OpenCode's output before moving on. Do NOT write the code
yourself — plan, delegate to OpenCode, verify, integrate.

## CRITICAL EXECUTION RULES
- Work in the EXACT order of the STAGES below. Do not jump ahead.
- STOP after each stage and report what changed + how I can test it on
  localhost. Wait for my confirmation before the next stage.
- Do NOT rebuild features that already work. Only build what's specified.
- Before applying any database migration, SHOW me the full SQL and explain
  what it changes. Migrations touch a LIVE production database — never run
  one without showing it first.
- Keep Arabic RTL intact everywhere. Don't break existing working pages.
- Vercel constraint: install uses `npm install --legacy-peer-deps`.
- Passwords are NEVER handled as plain chat text — always a masked auth field.

---

## STAGE 1 — APPLY THE PENDING MIGRATIONS (foundation, do first)

Several features were coded but are non-functional because their database
tables don't exist yet. The pending migrations are: 001 (pipeline stages),
002 (price_list table) + seed, 005 (notifications).

Tasks:
1. For EACH pending migration, show me the full SQL first. Explain what it
   creates/changes and confirm it does NOT delete or overwrite existing
   data. Wait for my approval per migration.
2. After approval, apply them.
3. Seed the `price_list` table from the official price list (97 models).
   The schema must be: model (text, unique), capacity_kw (numeric),
   description (text), price_usd (numeric). I will provide the data file;
   parse it and generate the seed.
4. Confirm: pipeline stages exist on leads, price_list is populated,
   notifications table exists.

Acceptance: after this stage, BOQ price auto-fill, the pipeline, and
notifications have the data layer they need.

---

## STAGE 2 — THE AI-FIRST SHELL (major UI restructure)

This changes the core layout. The AI assistant is NOT a login gate — it is
the PERMANENT home interface the whole app lives inside.

### For a NORMAL user (CS / Tech), after login the screen is:
- CENTER / majority of screen: the AI Assistant interface (like a Siri-style
  home — "Hello [name], how can I help you today?" + an input box).
- LEFT side: ONLY TWO panels:
  1. Daily Report panel (the user's 3:30 PM personal report)
  2. Quotes (BOQ) panel
- ALL other pages (Dashboard, Company Hub, Inventory, Data Extraction, Email,
  KSA CRM, etc.) are HIDDEN from normal users.
- The AI assistant stays present from login to logout — it is the frame.

### Role-based shell:
- Normal user (CS/Tech): AI center + the two panels only.
- Tech Team Lead: full technical access per the brief (CRM, BOQ, scraping,
  email, inventory, team performance).
- Admin (Mido): everything, all pages, as now.

### Conversational login (keep, wire correctly):
- AI greets → asks name → asks password in a SECURE masked field (inside the
  chat visually, but a real password input, never plain text) → logs in in
  background (Supabase Auth) → lands on the AI shell above.
- Session remembered so password isn't needed daily.

### Data entry happens THROUGH the AI (this is the measurement strategy):
- A normal user adds a client by telling the AI: e.g. "register a new client
  named X". The AI then asks the needed questions one by one (project type,
  region, budget, source, etc.) and creates the lead with ALL required
  pipeline fields filled and stage = NEW.
- Rationale: AI-guided entry guarantees complete, structured data every time
  → strong measurability. (No half-empty manual forms.)
- The user can still VIEW their own clients (RLS-filtered, own leads only)
  for follow-up — a simple list the AI can surface or open on request. Not a
  full open CRM form for normal users.

### Report timing (correct these):
- Personal user report: 3:30 PM
- Company AI report (to Admin): 4:30 PM, via Email or Telegram.

Acceptance: a normal user logs in via the AI, sees the AI center + 2 panels
only, can add a client by talking to the AI (all fields captured), and can
view their own clients list.

---

## STAGE 3 — BOQ: SIMPLE ENTRY GRID + OFFICIAL QUOTE PDF

The Tech team abandoned the in-app BOQ for Excel. Keep this SIMPLE — the team
explicitly does NOT want extra steps. There is NO load calculator. The BOQ is
exactly two things: (1) a simple entry grid where picking a model auto-fills
everything, and (2) a one-click official quote PDF that mirrors their sheet.

### Part A — Simple entry grid (the only input)
A spreadsheet-style grid. Columns, in this order (mirroring the sheet):
| Unit No | Type | Capacity KW | Qty | Model | Unit Price | Total Price $ |

Behavior (this is the whole point — replicate exactly):
- The tech picks the MODEL from a dropdown/autocomplete (sourced from the
  price_list table — all 96 models).
- On selecting the model, AUTO-FILL from price_list:
  - Unit Price (price_usd)
  - Capacity KW (capacity_kw)
  - Type (derived from the model's description, e.g. Cassette / Ducted /
    Wall / VRF outdoor)
- The tech ONLY types the Qty.
- Total Price = Qty × Unit Price, computed LIVE.
- Group rows visually under headers: Indoor Units / Outdoor Units (like the
  sheet) — but this grouping is just a label, not extra work for the tech.
- Y-branch line auto-calculates: qty = (SUM of all unit qtys − 2) × 2, fixed
  unit price ($60 in the file; make it editable), total = qty × unit price.
- Grand Total = SUM of all line totals.
- "Total after discount X%" line — discount % is editable.
- Keyboard-first: Tab/Enter between cells, Enter adds a new row, duplicate-row
  action. No per-line modal forms.

NO load calculator. NO room-sizing step. Do not build one.

### Part B — Official quote PDF (mirror the sheet layout exactly)
One button generates a branded PDF that looks like their Excel quote, because
this is what gets sent to the client (via WhatsApp). It must contain:
- Header: "Commercial Offer For VRF"
- "please find the financial offer"
- From: Heliopolis For Investment | date | To: [client name] | PI No.: [auto]
- The supplier line (GUANGDONG CARRIER HEATING, VENTILATION AND AIR CONDITIONING)
- The units table from Part A (Type / Capacity KW / Qty / Model / Unit Price /
  Total Price $), grouped Indoor / Outdoor, with the Y-branch line.
- Total Price + Total Price after discount.
- Inclusions: commissioning/startup, 3-year warranty, technical-offer note.
- Exclusions: builders' work, copper pipes, power/water at site, electrical
  works/control panel, drain piping/fittings/cable tray, separate power supply
  with breaker, maintenance contract/spare parts, any unlisted items, tax/
  customs note.
- Terms: 10% Down Payment, 90% Upon Delivery.
- Validity: 7 days.
- Signatures: Sales Engineer / Sales Manager / Financial Director.
- All inclusions/exclusions/terms/signatures are a SAVED TEMPLATE, applied
  automatically — the tech never retypes them.

Acceptance test: a tech builds a multi-line VRF quote by ONLY picking models
(price/capacity/type auto-fill) and typing quantities, sees live totals and
discount, and exports a PDF that matches the Excel quote — faster than Excel,
mostly via keyboard. If slower than Excel, it failed.

---

## DELIVERY
- Execute Stage 1 → confirm → Stage 2 → confirm → Stage 3.
- Delegate coding to OpenCode at each stage; you review and integrate.
- After each stage: short test checklist for me to verify on localhost.
