# Research: HelioMax Platform Transformation

**Branch**: `002-heliomax-platform` | **Date**: 2026-06-04

---

## Session Management & Supabase Auth Persistence

**Decision**: Use `createBrowserClient` from `@supabase/ssr` with `persistSession: true` (default). Store session in `localStorage`. Add a `onAuthStateChange` listener in `AuthContext` to catch `TOKEN_REFRESHED` and `SIGNED_OUT` events. Implement proactive token refresh 5 minutes before expiry using `setTimeout` in the session manager hook.

**Rationale**: The current `useSessionManager.ts` hook exists but is not wired to handle expiry. The fix is additive — enhance the existing hook rather than rewriting auth.

**Alternatives considered**: Cookie-based sessions (SSR-compatible but adds complexity on client-side realtime); rolling refresh via Supabase Realtime heartbeat (overkill — Auth SDK handles refresh natively when wired correctly).

---

## Supabase RLS Pattern for CS User Isolation

**Decision**: Add a Postgres policy on the `leads` table:

```sql
CREATE POLICY "cs_users_own_leads" ON leads
FOR ALL TO authenticated
USING (
  (SELECT crm_team FROM profiles WHERE id = auth.uid()) != 'cs'
  OR assigned_to_user = auth.uid()
);
```

This allows non-CS roles (admin, tech, tech_lead) unrestricted access, while CS users are limited to their own leads at the DB level.

**Rationale**: RLS is already enabled on the Supabase project (used in LOOMARK build). Pattern reuses existing `profiles.crm_team` field. No application-layer changes needed for security — the DB enforces it.

**Alternatives considered**: Application-level filtering only (rejected — violates constitution principle II); separate schema per user (overkill for this use case).

---

## 9-Stage Pipeline Migration Strategy

**Decision**: Add a new `pipeline_stage` TEXT column to `leads` with a CHECK constraint for the 9 valid values. Keep the existing `status` column untouched during migration, then backfill `pipeline_stage` by mapping old statuses: `New→NEW`, `Interested→CONTACTED`, `Quote Sent→QUOTED`, `Won→WON`, `Lost→LOST_PRICE`. After Phase 2 is confirmed working, a follow-up migration can drop `status`.

**Rationale**: Additive migration preserves all existing data and doesn't break current queries. Two-step approach (add → confirm → drop) is safer than a destructive single migration.

**Stage timestamp storage**: Use a `stage_timestamps` JSONB column that stores `{ "STAGE_NAME": "ISO_TIMESTAMP" }` per stage transition. Updated via a Postgres trigger or application logic on every `pipeline_stage` change.

---

## BOQ Spreadsheet Grid Implementation

**Decision**: Use Ant Design `Table` component with `editable` cells implemented via `antd`'s inline editing pattern. Each row is a `BOQItem`. Keyboard navigation: intercept `Tab` and `Enter` keydown events on cell inputs to move focus to the next cell/row. Model autocomplete uses `antd AutoComplete` against a real-time filtered `price_list` query.

**Rationale**: The existing `BOQEditor.tsx` uses Ant Design — staying consistent. `@tanstack/react-virtual` for large tables is not needed (max ~30 rows per BOQ). No external grid library needed, keeping bundle size stable.

**Y-branch formula**: `(total_outdoor_qty - 2) × 2` — computed in a derived state variable, displayed as a read-only row at the bottom of the grid.

---

## PDF Generation

**Decision**: Continue using `@react-pdf/renderer` (already installed). The `BOQDocument.tsx` component is refactored to match the standard "Commercial Offer For VRF" template. The personal report PDF uses the same renderer. Both are generated client-side via `PDFDownloadButton` (already exists).

**Rationale**: `@react-pdf/renderer` is already in the dependency tree and working in the existing BOQ. Extending it is lower risk than introducing a new PDF library.

---

## AI Conversational Login — Password Security

**Decision**: In the chat UI, when the auth flow reaches the password step, render a `React` component that injects an `<input type="password">` directly into the chat bubble (not a text message). The component calls `supabase.auth.signInWithPassword({ email, password })` directly — the password string never passes through the AI API call chain. The AI message that triggers this step says "please enter your password below" and renders a `PasswordStep` component as a chat bubble child.

**Rationale**: Constitution principle III is non-negotiable. The technical pattern of rendering interactive React components inside chat bubbles is already established in the existing `LookAgent.tsx` component (it renders form inputs inside the chat).

---

## Scheduled Reports — Vercel Cron

**Decision**: Implement cron jobs using Vercel's built-in cron feature (`vercel.json` cron configuration). Two routes:
- `app/api/reports/personal/cron/route.ts` — triggered at `30 15 * * *` (3:30 PM Cairo time = 13:30 UTC)
- `app/api/reports/company/cron/route.ts` — triggered at `30 16 * * *` (4:30 PM Cairo time = 14:30 UTC)

**Rationale**: Vercel Cron is free on Pro plan and integrates with existing deployment. No external scheduler (e.g., Inngest, Upstash) needed.

**Telegram delivery**: Use the Telegram Bot API directly via `fetch` (no SDK needed). Store `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` as Vercel environment variables.

---

## Automation — Auto Lead Intake

**Decision**: Extend the existing `/api/scraper` route to auto-insert scraped leads directly into `leads` with `pipeline_stage='NEW'` when a flag is set. Round-robin CS assignment reads all active CS profiles (`crm_team='cs'`) and assigns via modulo on lead count.

**Rationale**: The scraper infrastructure already exists. Auto-intake is an additional mode of the existing route, not a new system.
