# Company Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `/hub` page per org with three sections: Company Profile (editable), Automations Status (n8n API), and Files & Knowledge Base (Supabase Storage).

**Architecture:** Single `'use client'` page shell (`HubClient`) wraps three focused section components. Org data flows from `useOrg()`. Automations data is proxied through a Next.js API route to hide n8n credentials. Files reuse the existing `/api/files` and `/api/files/upload` endpoints.

**Tech Stack:** Next.js 14 App Router, TypeScript, Ant Design, Supabase (client + server), n8n REST API v1, Supabase Storage `client-files` bucket.

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `app/(dashboard)/hub/page.tsx` | Server wrapper with `force-dynamic` |
| Create | `app/(dashboard)/hub/_components/HubClient.tsx` | Tab layout shell, reads `useOrg()` |
| Create | `app/(dashboard)/hub/_components/CompanyProfile.tsx` | Section 1: display + edit org fields |
| Create | `app/(dashboard)/hub/_components/AutomationsStatus.tsx` | Section 2: fetch + display n8n workflows |
| Create | `app/(dashboard)/hub/_components/FilesKnowledgeBase.tsx` | Section 3: file grid, upload, preview |
| Create | `app/api/hub/update-org/route.ts` | PATCH org profile (owner/admin only) |
| Create | `app/api/hub/automations/route.ts` | Proxy n8n API, filter by org slug tag |
| Modify | `lib/constants.ts` | Add `hub` nav item after `dashboard` |
| Modify | `components/layout/Sidebar.tsx` | Add `hub` to `NAV_MODULE_MAP` |
| Modify | `middleware.ts` | Add `/hub` to `MODULE_ROUTES` |

---

## Task 1: DB — Add `company_hub` Module and Enable for All Orgs

**Files:** Supabase MCP (no local file)

- [ ] **Step 1: Insert the module row**

Run in Supabase SQL editor or via MCP `apply_migration`:

```sql
INSERT INTO modules (name, display_name, description, icon, route, category)
VALUES ('company_hub', 'Company Hub', 'Org profile, automations, and files', 'HomeOutlined', '/hub', 'operations');
```

- [ ] **Step 2: Enable for all 3 orgs**

```sql
INSERT INTO organization_modules (org_id, module_id, enabled)
SELECT o.id, m.id, true
FROM organizations o, modules m
WHERE m.name = 'company_hub';
```

- [ ] **Step 3: Verify**

```sql
SELECT o.name, m.name, om.enabled
FROM organization_modules om
JOIN organizations o ON o.id = om.org_id
JOIN modules m ON m.id = om.module_id
WHERE m.name = 'company_hub';
```

Expected: 3 rows (HelioMax, Nestiq, Nerds Academy), all `enabled = true`.

---

## Task 2: Nav Wiring — Constants, Sidebar Map, Middleware

**Files:**
- Modify: `lib/constants.ts`
- Modify: `components/layout/Sidebar.tsx`
- Modify: `middleware.ts`

- [ ] **Step 1: Add `hub` to `NAV_ITEMS` in `lib/constants.ts`**

Add immediately after the `dashboard` entry:

```ts
{ key: 'hub', labelAr: 'مركز الشركة', labelEn: 'Company Hub', icon: 'hub', path: '/hub' },
```

- [ ] **Step 2: Add the Hub icon to `ICON_MAP` in `components/layout/Sidebar.tsx`**

Add this import at the top with the other lucide imports:

```ts
import { Building2 } from 'lucide-react';
```

Then add to `ICON_MAP`:

```ts
hub: <Building2 className="w-5 h-5" />,
```

- [ ] **Step 3: Add `hub` to `NAV_MODULE_MAP` in `components/layout/Sidebar.tsx`**

```ts
hub: 'company_hub',
```

- [ ] **Step 4: Add `/hub` to `MODULE_ROUTES` in `middleware.ts`**

```ts
'/hub': 'company_hub',
```

- [ ] **Step 5: Commit**

```bash
git add lib/constants.ts components/layout/Sidebar.tsx middleware.ts
git commit -m "feat: wire Company Hub nav item and middleware route"
```

---

## Task 3: Page Shell

**Files:**
- Create: `app/(dashboard)/hub/page.tsx`
- Create: `app/(dashboard)/hub/_components/HubClient.tsx`

- [ ] **Step 1: Create `app/(dashboard)/hub/page.tsx`**

```tsx
export const dynamic = 'force-dynamic';
import HubClient from './_components/HubClient';

export default function HubPage() {
  return <HubClient />;
}
```

- [ ] **Step 2: Create `app/(dashboard)/hub/_components/HubClient.tsx`**

```tsx
'use client';

import { Tabs } from 'antd';
import { useOrg } from '@/context/OrgContext';
import CompanyProfile from './CompanyProfile';
import AutomationsStatus from './AutomationsStatus';
import FilesKnowledgeBase from './FilesKnowledgeBase';

export default function HubClient() {
  const { org, isLoading } = useOrg();

  if (isLoading || !org) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        Loading hub...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0D2137]">Company Hub</h1>
        <p className="text-sm text-slate-500 mt-1">{org.name} — central control panel</p>
      </div>

      <Tabs
        defaultActiveKey="profile"
        size="large"
        items={[
          { key: 'profile',     label: 'Company Profile',    children: <CompanyProfile /> },
          { key: 'automations', label: 'Automations',        children: <AutomationsStatus /> },
          { key: 'files',       label: 'Files & Knowledge',  children: <FilesKnowledgeBase /> },
        ]}
      />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/hub/"
git commit -m "feat: Company Hub page shell with tab layout"
```

---

## Task 4: Section 1 — Company Profile Component

**Files:**
- Create: `app/(dashboard)/hub/_components/CompanyProfile.tsx`

- [ ] **Step 1: Create `CompanyProfile.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { Form, Input, Button, Tag, message, Spin } from 'antd';
import { useOrg } from '@/context/OrgContext';

interface ProfileForm {
  name: string;
  industry: string | null;
  primary_color: string;
  secondary_color: string;
  contact_email: string;
  contact_phone: string;
  address: string;
  website: string;
}

export default function CompanyProfile() {
  const { org, orgModules } = useOrg();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<ProfileForm>();

  if (!org) return <Spin />;

  const settings = (org.settings ?? {}) as Record<string, string>;

  const handleEdit = () => {
    form.setFieldsValue({
      name: org.name,
      industry: org.industry ?? '',
      primary_color: org.brand_colors?.primary ?? '#000000',
      secondary_color: org.brand_colors?.secondary ?? '#000000',
      contact_email: settings.contact_email ?? '',
      contact_phone: settings.contact_phone ?? '',
      address: settings.address ?? '',
      website: settings.website ?? '',
    });
    setEditing(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    setSaving(true);
    const res = await fetch('/api/hub/update-org', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: values.name,
        industry: values.industry,
        brand_colors: {
          primary: values.primary_color,
          secondary: values.secondary_color,
        },
        settings: {
          ...settings,
          contact_email: values.contact_email,
          contact_phone: values.contact_phone,
          address: values.address,
          website: values.website,
        },
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (data.error) {
      message.error(data.error);
    } else {
      message.success('Profile updated');
      setEditing(false);
      // Reload to reflect changes in sidebar
      window.location.reload();
    }
  };

  if (editing) {
    return (
      <div className="bg-white rounded-xl border border-slate-100 p-6 max-w-2xl">
        <h2 className="text-lg font-bold text-[#0D2137] mb-6">Edit Company Profile</h2>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Organization Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="industry" label="Industry">
            <Input placeholder="e.g. hvac, ecommerce, education" />
          </Form.Item>
          <div className="grid grid-cols-2 gap-4">
            <Form.Item name="primary_color" label="Primary Brand Color">
              <Input type="color" className="h-10 w-full" />
            </Form.Item>
            <Form.Item name="secondary_color" label="Secondary Brand Color">
              <Input type="color" className="h-10 w-full" />
            </Form.Item>
          </div>
          <Form.Item name="contact_email" label="Contact Email">
            <Input type="email" />
          </Form.Item>
          <Form.Item name="contact_phone" label="Contact Phone">
            <Input />
          </Form.Item>
          <Form.Item name="address" label="Address">
            <Input />
          </Form.Item>
          <Form.Item name="website" label="Website">
            <Input placeholder="https://" />
          </Form.Item>
          <div className="flex gap-3 mt-2">
            <Button type="primary" loading={saving} onClick={handleSave}>Save</Button>
            <Button onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </Form>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-100 p-6 max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {org.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={org.logo_url} alt={org.name} className="w-16 h-16 object-contain rounded-lg border border-slate-100" />
          ) : (
            <div className="w-16 h-16 rounded-lg flex items-center justify-center text-2xl font-black text-white"
              style={{ backgroundColor: org.brand_colors?.primary ?? '#0D2137' }}>
              {org.name.charAt(0)}
            </div>
          )}
          <div>
            <h2 className="text-xl font-bold text-[#0D2137]">{org.name}</h2>
            <p className="text-sm text-slate-500 capitalize">{org.industry ?? '—'}</p>
          </div>
        </div>
        <Button onClick={handleEdit}>Edit Profile</Button>
      </div>

      {/* Brand Colors */}
      <div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Brand Colors</p>
        <div className="flex gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md border border-slate-200"
              style={{ backgroundColor: org.brand_colors?.primary ?? '#ccc' }} />
            <span className="text-sm text-slate-600">{org.brand_colors?.primary ?? '—'}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md border border-slate-200"
              style={{ backgroundColor: org.brand_colors?.secondary ?? '#ccc' }} />
            <span className="text-sm text-slate-600">{org.brand_colors?.secondary ?? '—'}</span>
          </div>
        </div>
      </div>

      {/* Contact Info */}
      <div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Contact Info</p>
        <div className="space-y-2 text-sm text-slate-700">
          <p><span className="font-medium w-28 inline-block">Email:</span>{settings.contact_email || '—'}</p>
          <p><span className="font-medium w-28 inline-block">Phone:</span>{settings.contact_phone || '—'}</p>
          <p><span className="font-medium w-28 inline-block">Address:</span>{settings.address || '—'}</p>
          <p><span className="font-medium w-28 inline-block">Website:</span>{settings.website || '—'}</p>
        </div>
      </div>

      {/* Enabled Modules */}
      <div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Enabled Modules</p>
        <div className="flex flex-wrap gap-2">
          {orgModules.map(m => (
            <Tag key={m.module.name} color="blue">{m.module.display_name}</Tag>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/(dashboard)/hub/_components/CompanyProfile.tsx"
git commit -m "feat: Company Hub Section 1 — Company Profile display and edit"
```

---

## Task 5: API Route — Update Org Profile

**Files:**
- Create: `app/api/hub/update-org/route.ts`

- [ ] **Step 1: Create `app/api/hub/update-org/route.ts`**

```ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Only owner/admin/super_admin can edit
  const { data: membership } = await supabase
    .from('organization_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (!membership) return NextResponse.json({ error: 'No org membership' }, { status: 403 });
  if (!['owner', 'admin', 'super_admin'].includes(membership.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  const body = await request.json();
  const { name, industry, brand_colors, settings } = body;

  const { error } = await supabase
    .from('organizations')
    .update({ name, industry, brand_colors, settings, updated_at: new Date().toISOString() })
    .eq('id', membership.org_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/api/hub/update-org/route.ts"
git commit -m "feat: API route to update org profile (owner/admin only)"
```

---

## Task 6: Section 2 — Automations Status + n8n Proxy API

**Files:**
- Create: `app/api/hub/automations/route.ts`
- Create: `app/(dashboard)/hub/_components/AutomationsStatus.tsx`

**n8n API reference:**
- Base URL env var: `N8N_BASE_URL=http://46.101.166.122:5678/api/v1`
- Auth header: `X-N8N-API-KEY: <value of N8N_API_KEY env var>`
- List workflows: `GET /workflows` → `{ data: Workflow[] }`
- Each workflow has `tags: { id, name }[]` and `active: boolean`
- Last execution: `GET /executions?workflowId=<id>&limit=1&includeData=false` → `{ data: Execution[] }`

Add these env vars to Vercel (Settings → Environment Variables):
```
N8N_BASE_URL=http://46.101.166.122:5678/api/v1
N8N_API_KEY=<your n8n api key>
```

To get your n8n API key: n8n dashboard → Settings → API → Create API Key.

- [ ] **Step 1: Create `app/api/hub/automations/route.ts`**

```ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface N8nWorkflow {
  id: string;
  name: string;
  active: boolean;
  tags: { id: string; name: string }[];
  updatedAt: string;
}

interface N8nExecution {
  id: string;
  finished: boolean;
  stoppedAt: string | null;
  status: string;
}

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const orgSlug = request.nextUrl.searchParams.get('org_slug');
  if (!orgSlug) return NextResponse.json({ error: 'org_slug required' }, { status: 400 });

  const n8nBase = process.env.N8N_BASE_URL;
  const n8nKey = process.env.N8N_API_KEY;

  if (!n8nBase || !n8nKey) {
    return NextResponse.json({ workflows: [], error: 'n8n not configured' });
  }

  const headers = { 'X-N8N-API-KEY': n8nKey, 'Content-Type': 'application/json' };

  // Fetch all workflows
  const wfRes = await fetch(`${n8nBase}/workflows?limit=100`, { headers }).catch(() => null);
  if (!wfRes?.ok) return NextResponse.json({ workflows: [] });

  const wfData = await wfRes.json();
  const allWorkflows: N8nWorkflow[] = wfData.data ?? [];

  // Filter to this org's workflows by tag matching org slug
  const orgWorkflows = allWorkflows.filter(wf =>
    wf.tags?.some(t => t.name.toLowerCase() === orgSlug.toLowerCase())
  );

  // Fetch last execution for each workflow (parallel)
  const withExecutions = await Promise.all(
    orgWorkflows.map(async (wf) => {
      const execRes = await fetch(
        `${n8nBase}/executions?workflowId=${wf.id}&limit=1&includeData=false`,
        { headers }
      ).catch(() => null);

      let lastExecution: N8nExecution | null = null;
      if (execRes?.ok) {
        const execData = await execRes.json();
        lastExecution = execData.data?.[0] ?? null;
      }

      return {
        id: wf.id,
        name: wf.name,
        active: wf.active,
        lastRunAt: lastExecution?.stoppedAt ?? null,
        lastStatus: lastExecution?.status ?? null,
      };
    })
  );

  return NextResponse.json({ workflows: withExecutions });
}
```

- [ ] **Step 2: Create `app/(dashboard)/hub/_components/AutomationsStatus.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Badge, Spin, Tag } from 'antd';
import { useOrg } from '@/context/OrgContext';
import { formatDistanceToNow } from 'date-fns';

interface WorkflowStatus {
  id: string;
  name: string;
  active: boolean;
  lastRunAt: string | null;
  lastStatus: string | null;
}

function statusTag(active: boolean, lastStatus: string | null) {
  if (!active) return <Tag color="default">Inactive</Tag>;
  if (lastStatus === 'error') return <Tag color="red">Error</Tag>;
  if (lastStatus === 'success') return <Tag color="green">Active</Tag>;
  return <Tag color="blue">Active</Tag>;
}

export default function AutomationsStatus() {
  const { org } = useOrg();
  const [workflows, setWorkflows] = useState<WorkflowStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!org?.slug) return;
    setLoading(true);
    fetch(`/api/hub/automations?org_slug=${org.slug}`)
      .then(r => r.json())
      .then(data => {
        if (data.error && !data.workflows) setError(data.error);
        setWorkflows(data.workflows ?? []);
      })
      .catch(() => setError('Failed to load automations'))
      .finally(() => setLoading(false));
  }, [org?.slug]);

  if (loading) return <div className="py-12 flex justify-center"><Spin /></div>;

  if (error) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-amber-700 text-sm">
        {error === 'n8n not configured'
          ? 'n8n API is not configured. Add N8N_BASE_URL and N8N_API_KEY to environment variables.'
          : error}
      </div>
    );
  }

  if (workflows.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-100 p-12 text-center text-slate-400">
        <p className="text-lg font-medium">No automations found</p>
        <p className="text-sm mt-1">
          Tag your n8n workflows with <code className="bg-slate-100 px-1 rounded">{org?.slug}</code> to see them here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {workflows.map(wf => (
        <div key={wf.id} className="bg-white rounded-xl border border-slate-100 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Badge status={wf.active ? (wf.lastStatus === 'error' ? 'error' : 'processing') : 'default'} />
            <div>
              <p className="font-semibold text-[#0D2137] text-sm">{wf.name}</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Last run:{' '}
                {wf.lastRunAt
                  ? formatDistanceToNow(new Date(wf.lastRunAt), { addSuffix: true })
                  : 'Never'}
              </p>
            </div>
          </div>
          <div>{statusTag(wf.active, wf.lastStatus)}</div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add "app/api/hub/automations/route.ts" "app/(dashboard)/hub/_components/AutomationsStatus.tsx"
git commit -m "feat: Company Hub Section 2 — Automations Status via n8n API"
```

---

## Task 7: Section 3 — Files & Knowledge Base

**Files:**
- Create: `app/(dashboard)/hub/_components/FilesKnowledgeBase.tsx`

This reuses the existing `/api/files` (GET) and `/api/files/upload` (POST) endpoints already in the codebase. No new API routes needed.

- [ ] **Step 1: Create `app/(dashboard)/hub/_components/FilesKnowledgeBase.tsx`**

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Upload, Button, Select, Tag, Spin, message, Modal, Empty } from 'antd';
import {
  UploadOutlined,
  FileOutlined,
  FilePdfOutlined,
  FileImageOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload';
import type { ClientFile } from '@/types/org';

const CATEGORIES = ['catalog', 'pricelist', 'brand', 'content', 'certificate', 'course', 'product', 'other'];

const CATEGORY_COLORS: Record<string, string> = {
  catalog: 'blue',
  pricelist: 'green',
  brand: 'purple',
  content: 'orange',
  certificate: 'gold',
  course: 'cyan',
  product: 'geekblue',
  other: 'default',
};

function FileIcon({ fileType }: { fileType: string | null }) {
  if (fileType === 'pdf') return <FilePdfOutlined className="text-red-500 text-2xl" />;
  if (fileType === 'image') return <FileImageOutlined className="text-blue-500 text-2xl" />;
  return <FileOutlined className="text-slate-400 text-2xl" />;
}

function formatBytes(bytes: number | null) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FilesKnowledgeBase() {
  const [files, setFiles] = useState<ClientFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>();
  const [uploadCategory, setUploadCategory] = useState('other');
  const [previewFile, setPreviewFile] = useState<ClientFile | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (categoryFilter) params.set('category', categoryFilter);
    const res = await fetch(`/api/files?${params}`);
    const data = await res.json();
    setFiles(data.files ?? []);
    setLoading(false);
  }, [categoryFilter]);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  const handleUpload = async (file: UploadFile) => {
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file as unknown as Blob);
    formData.append('category', uploadCategory);
    const res = await fetch('/api/files/upload', { method: 'POST', body: formData });
    const data = await res.json();
    if (data.error) {
      message.error(`Upload failed: ${data.error}`);
    } else {
      message.success(`${file.name} uploaded`);
      fetchFiles();
    }
    setUploading(false);
    return false;
  };

  const openPreview = async (file: ClientFile) => {
    setPreviewFile(file);
    const res = await fetch(`/api/files/${file.id}/signed-url`);
    const data = await res.json();
    setPreviewUrl(data.url ?? null);
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Select
            placeholder="Filter by category"
            allowClear
            style={{ width: 180 }}
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={CATEGORIES.map(c => ({ label: c, value: c }))}
          />
          <span className="text-sm text-slate-400">{files.length} file{files.length !== 1 ? 's' : ''}</span>
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={uploadCategory}
            onChange={setUploadCategory}
            style={{ width: 140 }}
            options={CATEGORIES.map(c => ({ label: c, value: c }))}
          />
          <Upload
            beforeUpload={handleUpload}
            showUploadList={false}
            accept="*/*"
          >
            <Button
              type="primary"
              icon={<UploadOutlined />}
              loading={uploading}
            >
              Upload File
            </Button>
          </Upload>
        </div>
      </div>

      {/* File Grid */}
      {loading ? (
        <div className="flex justify-center py-16"><Spin size="large" /></div>
      ) : files.length === 0 ? (
        <Empty description="No files yet. Upload your first file above." className="py-16" />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {files.map(file => (
            <div
              key={file.id}
              className="bg-white border border-slate-100 rounded-xl p-4 flex flex-col gap-2 hover:shadow-md transition-shadow cursor-pointer group"
              onClick={() => openPreview(file)}
            >
              <div className="flex items-center justify-between">
                <FileIcon fileType={file.file_type} />
                <button
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-[#0D2137]"
                  onClick={(e) => { e.stopPropagation(); openPreview(file); }}
                >
                  <EyeOutlined />
                </button>
              </div>
              <p className="text-xs font-semibold text-[#0D2137] truncate" title={file.file_name}>
                {file.file_name}
              </p>
              <div className="flex items-center justify-between">
                <Tag color={CATEGORY_COLORS[file.category ?? 'other'] ?? 'default'} className="text-[10px] m-0">
                  {file.category ?? 'other'}
                </Tag>
                <span className="text-[10px] text-slate-400">{formatBytes(file.file_size)}</span>
              </div>
              {file.ai_summary && (
                <p className="text-[10px] text-slate-500 line-clamp-2 border-t border-slate-50 pt-2">
                  {file.ai_summary}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Preview Modal */}
      <Modal
        open={!!previewFile}
        title={previewFile?.file_name}
        footer={null}
        onCancel={() => { setPreviewFile(null); setPreviewUrl(null); }}
        width={800}
      >
        {previewFile && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-4 text-sm text-slate-600">
              <span><strong>Category:</strong> {previewFile.category ?? '—'}</span>
              <span><strong>Size:</strong> {formatBytes(previewFile.file_size)}</span>
              <span><strong>Type:</strong> {previewFile.file_type ?? '—'}</span>
            </div>

            {previewFile.ai_summary && (
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                <p className="text-xs font-bold text-blue-600 uppercase tracking-widest mb-1">AI Summary</p>
                <p className="text-sm text-slate-700">{previewFile.ai_summary}</p>
              </div>
            )}

            {previewUrl ? (
              previewFile.file_type === 'image' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt={previewFile.file_name} className="w-full rounded-lg" />
              ) : previewFile.file_type === 'pdf' ? (
                <iframe src={previewUrl} className="w-full h-[500px] rounded-lg border" title={previewFile.file_name} />
              ) : (
                <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline text-sm">
                  Download / Open file
                </a>
              )
            ) : (
              <div className="flex justify-center py-8"><Spin /></div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/(dashboard)/hub/_components/FilesKnowledgeBase.tsx"
git commit -m "feat: Company Hub Section 3 — Files and Knowledge Base grid"
```

---

## Task 8: Final Push and Deploy

- [ ] **Step 1: Confirm all files committed**

```bash
git status
```

Expected: `nothing to commit, working tree clean`

- [ ] **Step 2: Push to trigger Vercel deploy**

```bash
git push origin main
```

- [ ] **Step 3: Add env vars to Vercel** (if not already set)

Go to Vercel → Project → Settings → Environment Variables → Add:
```
N8N_BASE_URL = http://46.101.166.122:5678/api/v1
N8N_API_KEY  = <your n8n api key from n8n Settings → API>
```

Redeploy after adding env vars.

- [ ] **Step 4: Verify per org**
  - Switch to HelioMax → `/hub` → all 3 sections load
  - Section 2 shows workflows tagged `heliomax` (or "No automations" message if none tagged)
  - Switch to Nestiq → sidebar shows hub, data is Nestiq's
  - Switch to Nerds → sidebar shows hub, data is Nerds'

---

## Spec Coverage Check

| Requirement | Task |
|-------------|------|
| Route `/hub` | Task 2, 3 |
| Module `company_hub` in DB, enabled for all 3 orgs | Task 1 |
| Section 1: org name, logo, industry, brand colors, contact info, settings | Task 4 |
| Section 1: editable by owner/admin | Task 4, 5 |
| Section 2: n8n workflow status, name, active/inactive, last execution time | Task 6 |
| Section 2: filter by org slug tag | Task 6 |
| Section 3: file grid from `client_files` | Task 7 |
| Section 3: upload button, category filter | Task 7 |
| Section 3: file preview | Task 7 |
| Section 3: AI summary per file | Task 7 |
| Section 3: upload to `client-files/{org_slug}/` | Existing API (reused) |
| Sidebar: Building icon, after Dashboard | Task 2 |
| Middleware: module access guard | Task 2 |
