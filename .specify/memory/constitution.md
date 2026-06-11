# HelioMax Platform Constitution

## Core Principles

### I. RTL-First UI
Arabic is the primary UI language. Every layout, component, and new page must be designed
RTL-first. English labels may appear in parentheses for reference but Arabic is dominant.
No LTR-only UI patterns. Ant Design's `direction="rtl"` must be applied globally.

### II. Database Safety (NON-NEGOTIABLE)
Never drop, truncate, or destructively alter existing Supabase tables or working columns.
All schema changes must be additive migrations. Data isolation for CS users MUST be enforced
at the database level via Supabase Row Level Security (RLS) — never by hiding UI alone.
A CS user must be technically unable to query another user's leads at the DB level.

### III. Security — Passwords Never Touch AI (NON-NEGOTIABLE)
Passwords are NEVER handled as plain text, chat messages, or LLM inputs. The conversational
login captures the password via a masked `<input type="password">` inside the chat UI.
The password goes directly to Supabase Auth and is never forwarded to any AI model or logged.

### IV. Keyboard-First BOQ — Beat Excel
The BOQ screen is a spreadsheet-like grid, not a form. Acceptance test: a tech user can build
a full multi-unit VRF quote with load calc, live pricing, discount, Y-branch, and PDF export
faster than Excel using mostly the keyboard. If it is slower than Excel, it has failed.
No modal forms per line item. Tab/Enter navigation. Duplicate-row action.

### V. Next.js Runtime Rules
Every server component or page that reads live data keeps `export const dynamic = 'force-dynamic'`.
Do not remove this from existing pages. Vercel `installCommand` stays `npm install --legacy-peer-deps`.

### VI. Phase Order (NON-NEGOTIABLE)
Phases MUST be implemented in order: 0 → 1 → 2 → 3 → 4 → 5 → 6.
No phase may begin before the previous one passes its acceptance test.
The pipeline (Phase 2) is the foundation — Phases 4, 5, and 6 depend on it.

### VII. No Breakage
Never break existing working features: CRM, BOQ, AI assistant, reports, tasks, calls,
inventory, scraper, hub, after-sales. Run a smoke test (app builds + all pages load)
after every phase before moving to the next.

### VIII. Simplicity
No premature abstractions. No features beyond what each phase requires. No backwards-
compatibility shims. No half-finished implementations. YAGNI strictly enforced.

## Stack Constraints

- **Framework**: Next.js 14.2 App Router, TypeScript
- **Database**: Supabase (Postgres + RLS + Auth)
- **UI**: Ant Design 5 + Tailwind CSS
- **Charts**: Recharts
- **PDF**: @react-pdf/renderer
- **AI**: Anthropic Claude SDK (@anthropic-ai/sdk)
- **Deployment**: Vercel

## Governance

This constitution supersedes all other practices. Every implementation task must reference
the relevant principle. Any deviation requires explicit justification in the PR description.
All schema changes go through Supabase migrations — never direct SQL in the dashboard.

**Version**: 1.0 | **Ratified**: 2026-06-04 | **Last Amended**: 2026-06-04
