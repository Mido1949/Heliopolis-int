# Plan 2 — Meta Facebook Lead Ads Webhook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Next.js API route that receives Meta Facebook Lead Ads webhook events, deduplicates by `meta_lead_id`, inserts new leads into the CRM, and notifies all admins/managers of each new Meta lead.

**Architecture:** Three files change — `types/index.ts` gets `meta_lead_id` on the `Lead` interface, a new API route `app/api/meta/webhook/route.ts` handles GET (token verification) and POST (HMAC verification + lead ingestion + notifications), and a migration SQL documents the new column. The webhook uses a direct Supabase admin client (`@supabase/supabase-js`) — no SSR cookies — because the request arrives from Meta servers with no user session.

**Tech Stack:** Next.js 14 App Router Route Handlers, `@supabase/supabase-js` (direct service-role client), Node.js built-in `crypto` for HMAC-SHA256 signature verification, TypeScript.

---

## File Map

| File | Change |
|------|--------|
| `types/index.ts` | Add `meta_lead_id?: string` to `Lead` interface |
| `supabase/migrations/20260418_plan2_meta_lead_id.sql` | Document `meta_lead_id TEXT UNIQUE` column + make `assigned_to` nullable — run manually |
| `app/api/meta/webhook/route.ts` | Create: GET verification + POST ingestion + admin notifications |

---

## Task 1: Extend Lead type + create migration file

**Files:**
- Modify: `gchv-egypt-ai-co-pilot (3)/loomark/types/index.ts`
- Create: `gchv-egypt-ai-co-pilot (3)/loomark/supabase/migrations/20260418_plan2_meta_lead_id.sql`

- [ ] **Step 1: Add `meta_lead_id` to the `Lead` interface**

Open `types/index.ts`. Find the `Lead` interface. After the line `assigned_user?: { id: string; name: string } | null;` (currently line 48), insert:

```typescript
meta_lead_id?: string;
```

The Lead interface around lines 37–63 should now look like:
```typescript
export interface Lead {
  id: string;
  name: string;
  phone: string;
  company?: string;
  email?: string;
  source: LeadSource;
  status: LeadStatus;
  assigned_to: string;
  assigned_to_team?: CrmTeam;
  assigned_to_user?: string;
  assigned_user?: { id: string; name: string } | null;
  meta_lead_id?: string;          // ← new
  project_capacity?: string;
  region?: Region;
  notes?: string;
  next_follow_up?: string;
  fb1?: boolean;
  fb1_date?: string;
  fb2?: boolean;
  fb2_date?: string;
  fb3?: boolean;
  fb3_date?: string;
  created_at: string;
  updated_at: string;
  profile?: Profile;
}
```

- [ ] **Step 2: Create the migration SQL file**

Create `supabase/migrations/20260418_plan2_meta_lead_id.sql` with this content:

```sql
-- Migration: 20260418_plan2_meta_lead_id
-- 1. Add meta_lead_id (TEXT UNIQUE) to leads for Facebook Lead Ads deduplication.
-- 2. Make assigned_to nullable so webhook-inserted leads can be unassigned initially.
--
-- Run manually in Supabase Dashboard → SQL Editor.
-- Verify: leads table has meta_lead_id column with UNIQUE index.

BEGIN;

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS meta_lead_id TEXT UNIQUE;

ALTER TABLE leads
  ALTER COLUMN assigned_to DROP NOT NULL;

COMMIT;
```

> ⚠️ Run in **Supabase Dashboard → SQL Editor**. After running, verify:
> - `leads` table has a `meta_lead_id` column with a UNIQUE constraint
> - `assigned_to` is now nullable (allows NULL for webhook-inserted leads)

- [ ] **Step 3: Verify no new TypeScript errors**

Run from `gchv-egypt-ai-co-pilot (3)/loomark/`:
```bash
npx tsc --noEmit 2>&1 | head -30
```
Expected: no new errors mentioning `meta_lead_id`.

---

## Task 2: Create the Meta webhook API route

**Files:**
- Create: `gchv-egypt-ai-co-pilot (3)/loomark/app/api/meta/webhook/route.ts`

This is the core of Plan 2. The file handles:
1. **GET** — Meta webhook challenge verification (must respond within 20s)
2. **POST** — HMAC signature check → parse payload → upsert lead → notify admins/managers

Read the file map above and the code below carefully before writing — all types are defined inline at the bottom of the file to keep it self-contained.

- [ ] **Step 1: Create the directory and file**

Create `app/api/meta/webhook/route.ts` with this full content:

```typescript
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'crypto';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ── GET: Webhook Verification ────────────────────────────────────────────────

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    return new Response(challenge ?? '', { status: 200 });
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

// ── POST: Lead Ingestion ─────────────────────────────────────────────────────

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-hub-signature-256');

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let body: MetaWebhookPayload;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (body.object !== 'page') {
    return NextResponse.json({ status: 'ignored' }, { status: 200 });
  }

  const results: string[] = [];

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'leadgen') continue;
      const result = await processLead(change.value);
      results.push(result);
    }
  }

  return NextResponse.json({ processed: results }, { status: 200 });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function verifySignature(body: string, signature: string | null): boolean {
  const secret = process.env.META_APP_SECRET;
  if (!secret || !signature) return false;

  const expected = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

async function processLead(value: MetaLeadValue): Promise<string> {
  const { leadgen_id, field_data = [] } = value;

  const get = (key: string) =>
    field_data.find((f) => f.name === key)?.values?.[0] ?? '';

  const name = get('full_name') || get('name') || 'Meta Lead';
  const phone = get('phone_number') || get('phone') || '';
  const email = get('email') || null;

  const { data: inserted, error } = await supabase
    .from('leads')
    .upsert(
      {
        meta_lead_id: leadgen_id,
        name,
        phone,
        email,
        source: 'Meta',
        status: 'New',
        assigned_to: null,
      },
      { onConflict: 'meta_lead_id', ignoreDuplicates: true }
    )
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('Lead insert error:', error);
    return `error:${leadgen_id}`;
  }

  if (!inserted) {
    return `duplicate:${leadgen_id}`;
  }

  await notifyAdmins(inserted.id, name, phone);
  return `inserted:${leadgen_id}`;
}

async function notifyAdmins(leadId: string, name: string, phone: string): Promise<void> {
  const { data: admins } = await supabase
    .from('profiles')
    .select('id')
    .in('role', ['admin', 'Manager']);

  if (!admins || admins.length === 0) return;

  const notifications = admins.map((admin) => ({
    user_id: admin.id,
    title: `ليد جديد من Meta: ${name} — ${phone}`,
    type: 'meta_lead',
    reference_id: leadId,
    reference_type: 'lead',
  }));

  const { error } = await supabase.from('notifications').insert(notifications);
  if (error) {
    console.warn('Notification insert failed (non-fatal):', error);
  }
}

// ── Payload Types ────────────────────────────────────────────────────────────

interface MetaFieldData {
  name: string;
  values: string[];
}

interface MetaLeadValue {
  leadgen_id: string;
  form_id?: string;
  page_id?: string;
  created_time?: number;
  field_data?: MetaFieldData[];
}

interface MetaChange {
  field: string;
  value: MetaLeadValue;
}

interface MetaEntry {
  id: string;
  time: number;
  changes?: MetaChange[];
}

interface MetaWebhookPayload {
  object: string;
  entry?: MetaEntry[];
}
```

- [ ] **Step 2: Verify no new TypeScript errors**

Run from `gchv-egypt-ai-co-pilot (3)/loomark/`:
```bash
npx tsc --noEmit 2>&1 | head -30
```
Expected: no errors in the new file. All payload types are locally defined.

---

## Task 3: Document environment variables

**Files:**
- Create: `gchv-egypt-ai-co-pilot (3)/loomark/.env.local.example`

> Note: `.env.local.example` does not currently exist. Create it. Do NOT touch `.env.local` itself.

- [ ] **Step 1: Create `.env.local.example`**

Create `gchv-egypt-ai-co-pilot (3)/loomark/.env.local.example` with this content:

```bash
# ── Supabase ─────────────────────────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# ── Meta Facebook Lead Ads Webhook ───────────────────────────────────────────
# META_WEBHOOK_VERIFY_TOKEN: Any string you choose — must exactly match the
#   "Verify Token" you enter in Meta Developer Console → Webhooks → Edit.
META_WEBHOOK_VERIFY_TOKEN=your_verify_token_here

# META_APP_SECRET: Found in Meta App Dashboard → Settings → Basic → App Secret.
#   Used to verify the X-Hub-Signature-256 header on incoming webhook POSTs.
META_APP_SECRET=your_app_secret_here

# META_PAGE_ACCESS_TOKEN: Generated via Meta Graph API.
#   Reserved for future Graph API calls (e.g. fetching lead details by ID).
#   Not used by the webhook route itself.
META_PAGE_ACCESS_TOKEN=your_page_access_token_here
```

- [ ] **Step 2: Note for developer**

After running the SQL migration and adding the env vars to `.env.local`, register the webhook in Meta Developer Console:

- **Callback URL:** `https://<your-domain>/api/meta/webhook`
- **Verify Token:** value of `META_WEBHOOK_VERIFY_TOKEN` in `.env.local`
- **Subscriptions:** `leadgen`

---

## Self-Review

- [x] **Spec coverage:**
  - ✅ GET: verify `hub.mode === 'subscribe'`, `hub.verify_token`, return `hub.challenge` → Task 2
  - ✅ POST: HMAC verification via `X-Hub-Signature-256` + `META_APP_SECRET` → Task 2 (`verifySignature`)
  - ✅ Lead insert: name, phone, email, `source='Meta'`, `status='New'` → Task 2 (`processLead`)
  - ✅ Deduplication via `meta_lead_id UNIQUE` + `ignoreDuplicates: true` → Tasks 1 + 2
  - ✅ Notify all admin/Manager: `title: 'ليد جديد من Meta'` + name/phone, `type: 'meta_lead'` → Task 2 (`notifyAdmins`)
  - ✅ `meta_lead_id` migration SQL → Task 1, Step 2
  - ✅ `meta_lead_id` on `Lead` TypeScript type → Task 1, Step 1
  - ✅ `.env.local` documentation → Task 3
  - ✅ `assigned_to` nullable migration → Task 1, Step 2 (required because webhook has no user session)

- [x] **Placeholder scan:** No TBD, no "handle edge cases". All code is complete and runnable.

- [x] **Type consistency:**
  - `MetaWebhookPayload`, `MetaEntry`, `MetaChange`, `MetaLeadValue`, `MetaFieldData` — all defined at the bottom of `route.ts`, consumed only within that file.
  - `meta_lead_id?: string` added to `Lead` type in Task 1; the DB column is `TEXT UNIQUE`; the upsert uses `onConflict: 'meta_lead_id'`.
  - `'meta_lead'` notification type — already in the CHECK constraint from Plan 1's migration (`20260418_plan1_rls_ownership.sql`). No additional migration needed.

- [x] **`assigned_to` nullable:** The TypeScript `Lead.assigned_to: string` is non-optional, implying NOT NULL in the DB. The migration in Task 1 drops this constraint so webhook inserts can pass `null`. After the migration, admins can later assign the lead via the existing Assign To UI.

- [x] **Service role client:** Used directly via `@supabase/supabase-js` `createClient` with `SUPABASE_SERVICE_ROLE_KEY` — no cookies, no user session. Correct choice for a server-to-server webhook. This bypasses RLS so the insert/select work regardless of the Plan 1 RLS policy.
