# Manual Collaborative CRM + Clear Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the confusing dual `status`/`pipeline_stage` model with ONE clear 10-stage pipeline, add an enhanced lead-entry form (project fields + attachments), and make all lead assignment fully manual (claim/assign hand-offs across Tech/CS/Sales zones) with a drag-and-drop Kanban as the primary CRM view.

**Architecture:** Next.js 14 App Router + Supabase (Postgres/Auth/RLS). Pipeline stages are a TS constant + a Postgres check constraint. The CRM page hosts a Kanban board (drag-drop = stage change, writing `stage_timestamps` and a `lead_activities` row). Assignment is a plain `assigned_to_user`/`assigned_to_team` update (no auto round-robin). WhatsApp stays external — the app links out to it.

**Tech Stack:** Next.js 14.2, React 18, TypeScript, Ant Design 5, `@hello-pangea/dnd` (already a dependency) for drag-drop, Supabase JS, Tailwind.

## Global Constraints

- Package manager: `npm`. Node 20.x.
- No unit-test runner exists. **Verification per task = `npx tsc --noEmit` passes + `npm run build` succeeds + the stated manual check.** Never claim a task passes without running these.
- All new user-facing copy is **bilingual Arabic-first** (Arabic label, English in parentheses), matching existing components.
- Brand primary button color is `#D72B2B` (used verbatim across the CRM).
- DB migrations live in `supabase/migrations/` with a date-prefixed name; apply via the Supabase MCP `apply_migration` or the user's migration flow. Never drop the legacy `status` column.
- Money/valuation fields already exist on `leads` (`deal_value`, `project_capacity`); reuse them — do not add duplicates.
- Commit after every task with a `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer.

---

## File Structure

- `lib/constants.ts` — MODIFY: replace `PIPELINE_STAGES`, add `PIPELINE_ZONES`, `LOST_REASONS`, add `Meta Ad` to `LEAD_SOURCES`. Keep `LEAD_STATUSES` export (referenced elsewhere) but stop using it in CRM UI.
- `types/index.ts` — MODIFY: new `PipelineStage` union, `LostReason` type, `lost_reason` + `project_description` on `Lead`.
- `supabase/migrations/20260701_manual_crm_pipeline.sql` — CREATE: add columns, remap stages, refresh check constraint.
- `app/(dashboard)/crm/LeadFormModal.tsx` — MODIFY (rebuild): grouped entry form, remove legacy status field, add project + attachments + owner.
- `app/(dashboard)/crm/KanbanView.tsx` — MODIFY: zone grouping, stage-change on drop, stage age, WhatsApp button, claim button.
- `app/(dashboard)/crm/LeadDrawer.tsx` — MODIFY: remove legacy status rows, add claim/assign + lost-reason UI, drop random-assign RPC buttons.
- `app/(dashboard)/crm/page.tsx` — MODIFY: Kanban as default view, remove legacy status filter.
- `lib/leads/intake.ts` — MODIFY: stop auto round-robin; insert leads unassigned in `NEW`.

---

### Task 1: Pipeline constants + types foundation

**Files:**
- Modify: `lib/constants.ts`
- Modify: `types/index.ts`

**Interfaces:**
- Produces: `PIPELINE_STAGES` (array of `{value, labelAr, color, zone, emoji}`), `PIPELINE_ZONES` (`['tech','cs','sales']` display config), `LOST_REASONS` (array of `{value, labelAr}`), extended `LEAD_SOURCES` with `Meta Ad`. Type `PipelineStage` union of the 10 codes, `LostReason` union, `Lead.lost_reason?`, `Lead.project_description?`.

- [ ] **Step 1: Replace `PIPELINE_STAGES` and add zones + lost reasons in `lib/constants.ts`**

Replace the existing `PIPELINE_STAGES` and `ACTIVE_PIPELINE_STAGES` blocks (lines 43–58) with:

```ts
// Pipeline Zones (visual grouping + notification routing — NOT permission locks)
export const PIPELINE_ZONES = [
  { value: 'tech',  labelAr: 'الفريق التقني', color: '#1A6FD4' },
  { value: 'cs',    labelAr: 'خدمة العملاء',  color: '#16A34A' },
  { value: 'sales', labelAr: 'المبيعات',      color: '#D72B2B' },
] as const;

// Unified Pipeline (10 stages — replaces legacy `status`)
export const PIPELINE_STAGES = [
  { value: 'NEW',          labelAr: 'جديد',                  emoji: '🆕', zone: 'tech',  color: '#1890FF' },
  { value: 'WELCOME_SENT', labelAr: 'تم الترحيب',            emoji: '👋', zone: 'tech',  color: '#13C2C2' },
  { value: 'NO_RESPONSE',  labelAr: 'لم يرد',                emoji: '📵', zone: 'cs',    color: '#8C8C8C' },
  { value: 'INTERESTED',   labelAr: 'مهتم / عنده مشروع',     emoji: '🔥', zone: 'tech',  color: '#FA8C16' },
  { value: 'PRICING',      labelAr: 'جاري التسعير',          emoji: '🧮', zone: 'tech',  color: '#722ED1' },
  { value: 'QUOTED',       labelAr: 'تم إرسال العرض',        emoji: '📤', zone: 'sales', color: '#2F54EB' },
  { value: 'NEGOTIATION',  labelAr: 'متابعة السيلز / تفاوض', emoji: '🤝', zone: 'sales', color: '#FAAD14' },
  { value: 'WON',          labelAr: 'تم البيع',              emoji: '✅', zone: 'sales', color: '#52C41A' },
  { value: 'LOST',         labelAr: 'خسارة',                 emoji: '❌', zone: 'sales', color: '#FF4D4F' },
  { value: 'POSTPONED',    labelAr: 'مؤجل',                  emoji: '⏸️', zone: 'sales', color: '#EB2F96' },
] as const;

export const ACTIVE_PIPELINE_STAGES: ReadonlyArray<typeof PIPELINE_STAGES[number]['value']> = [
  'NEW', 'WELCOME_SENT', 'NO_RESPONSE', 'INTERESTED', 'PRICING', 'QUOTED', 'NEGOTIATION',
];

// Loss reasons (used when a lead moves to LOST)
export const LOST_REASONS = [
  { value: 'price',      labelAr: 'السعر مرتفع' },
  { value: 'no_need',    labelAr: 'لا يوجد احتياج' },
  { value: 'competitor', labelAr: 'اختار منافس' },
  { value: 'ghosted',    labelAr: 'اختفى / لم يرد' },
  { value: 'other',      labelAr: 'أخرى' },
] as const;
```

- [ ] **Step 2: Add `Meta Ad` to `LEAD_SOURCES` in `lib/constants.ts`**

Replace the `LEAD_SOURCES` block (lines 27–32) with:

```ts
export const LEAD_SOURCES = [
  { value: 'Meta Ad',  labelAr: 'إعلان ميتا', color: '#1877F2' },
  { value: 'WhatsApp', labelAr: 'واتساب',     color: '#25D366' },
  { value: 'Meta',     labelAr: 'ميتا',       color: '#1877F2' },
  { value: 'Direct',   labelAr: 'مباشر',      color: '#0D2137' },
  { value: 'Phone',    labelAr: 'هاتف',       color: '#FF9800' },
] as const;
```

- [ ] **Step 3: Update types in `types/index.ts`**

Replace the `PipelineStage` union (lines 13–22) with:

```ts
export type PipelineStage =
  | 'NEW'
  | 'WELCOME_SENT'
  | 'NO_RESPONSE'
  | 'INTERESTED'
  | 'PRICING'
  | 'QUOTED'
  | 'NEGOTIATION'
  | 'WON'
  | 'LOST'
  | 'POSTPONED';
export type LostReason = 'price' | 'no_need' | 'competitor' | 'ghosted' | 'other';
export type LeadSource = 'WhatsApp' | 'Meta' | 'Meta Ad' | 'Direct' | 'Phone';
```

(The existing `LeadSource` on line 10 must be replaced with the version above — same location.)

Then add two fields to the `Lead` interface (after `notes?: string;` around line 72):

```ts
  lost_reason?: LostReason | null;
  project_description?: string | null;
```

- [ ] **Step 4: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no errors). If errors appear pointing at old stage codes like `ASSIGNED_TECH`/`FOLLOW_UP`/`LOST_PRICE`/`GHOSTED`, note the files — they are fixed in Tasks 4–7. For THIS task, the only acceptable remaining errors are references to those old codes in `KanbanView.tsx`, `LeadDrawer.tsx`, `crm/page.tsx`, `lib/leads/intake.ts`, `app/api/automation/assign/route.ts`. Any OTHER error must be fixed now.

- [ ] **Step 5: Commit**

```bash
git add lib/constants.ts types/index.ts
git commit -m "feat(crm): unified 10-stage pipeline constants + types

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Database migration (schema + data remap)

**Files:**
- Create: `supabase/migrations/20260701_manual_crm_pipeline.sql`

**Interfaces:**
- Produces: `leads.lost_reason` (text, nullable), `leads.project_description` (text, nullable), a refreshed `pipeline_stage` check constraint allowing the 10 new codes, and all existing rows remapped to valid new codes.

- [ ] **Step 1: Inspect the current constraint**

Use the Supabase MCP or SQL console to run:
```sql
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'leads'::regclass and contype = 'c';
```
Note the exact name of any check constraint on `pipeline_stage` (used in Step 2 to drop it).

- [ ] **Step 2: Write the migration file**

Create `supabase/migrations/20260701_manual_crm_pipeline.sql`:

```sql
-- Manual Collaborative CRM: unified 10-stage pipeline
-- 1. New columns
alter table leads add column if not exists lost_reason text;
alter table leads add column if not exists project_description text;

-- 2. Remap existing pipeline_stage values to the new set
update leads set lost_reason = 'price'   where pipeline_stage = 'LOST_PRICE';
update leads set lost_reason = 'ghosted' where pipeline_stage = 'GHOSTED';

update leads set pipeline_stage = case pipeline_stage
  when 'ASSIGNED_TECH' then 'INTERESTED'
  when 'FOLLOW_UP'     then 'NEGOTIATION'
  when 'LOST_PRICE'    then 'LOST'
  when 'GHOSTED'       then 'LOST'
  else pipeline_stage
end
where pipeline_stage in ('ASSIGNED_TECH','FOLLOW_UP','LOST_PRICE','GHOSTED');

update leads set pipeline_stage = 'NEW' where pipeline_stage is null;

-- 3. Refresh the check constraint (drop the old one first — replace NAME from Step 1)
alter table leads drop constraint if exists leads_pipeline_stage_check;
alter table leads add constraint leads_pipeline_stage_check
  check (pipeline_stage in (
    'NEW','WELCOME_SENT','NO_RESPONSE','INTERESTED','PRICING',
    'QUOTED','NEGOTIATION','WON','LOST','POSTPONED'
  ));
```

If Step 1 revealed a differently-named constraint, replace `leads_pipeline_stage_check` in the DROP line with that exact name (keep the ADD name as `leads_pipeline_stage_check`).

- [ ] **Step 3: Apply the migration**

Apply via the Supabase MCP `apply_migration` tool (name: `manual_crm_pipeline`) or the user's normal migration path.

- [ ] **Step 4: Verify no invalid stages remain**

Run:
```sql
select pipeline_stage, count(*) from leads group by pipeline_stage order by 1;
```
Expected: every returned `pipeline_stage` is one of the 10 new codes; no `ASSIGNED_TECH`/`FOLLOW_UP`/`LOST_PRICE`/`GHOSTED`/null rows.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260701_manual_crm_pipeline.sql
git commit -m "feat(db): migrate leads to unified 10-stage pipeline + lost_reason

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Enhanced lead entry form

**Files:**
- Modify: `app/(dashboard)/crm/LeadFormModal.tsx`

**Interfaces:**
- Consumes: `PIPELINE_STAGES`, `LEAD_SOURCES`, `REGIONS`, `LEAD_CLIENT_TYPES` from `lib/constants`; the existing files API at `POST /api/files/upload`.
- Produces: an entry form that writes `pipeline_stage`, `deal_value`, `project_capacity`, `project_description`, `assigned_to_user` (owner) and NO longer writes/reads `status` from the UI. Attachments upload and link to the lead after insert.

- [ ] **Step 1: Confirm the files upload contract**

Read `app/api/files/upload/route.ts` and `app/api/files/route.ts`. Note the exact multipart field name, the expected `lead_id`/`org_id` params, and the JSON shape returned. Use those exact names in Step 3 (do not invent an endpoint).

- [ ] **Step 2: Add an owner-options loader and project fields**

In `LeadFormModal.tsx`, add near the other state (after line 29):

```tsx
const [owners, setOwners] = useState<{ id: string; name: string }[]>([]);

useEffect(() => {
  if (!open) return;
  supabase.from('profiles').select('id, name').order('name')
    .then(({ data }) => setOwners((data || []) as { id: string; name: string }[]));
}, [open, supabase]);
```

- [ ] **Step 3: Rebuild the form body**

Replace the `initialValues` on the `<Form>` (line 128) with:
```tsx
initialValues={{ source: 'Meta Ad', pipeline_stage: 'NEW' }}
```

Remove the legacy-status `<Col span={8}>` block (lines 183–192) entirely. Replace the pipeline/source row and add the Project + Owner sections so the form reads:

```tsx
{/* ② Classification */}
<Row gutter={16}>
  <Col span={12}>
    <Form.Item name="source" label="المصدر (Source)">
      <Select options={LEAD_SOURCES.map((s) => ({ value: s.value, label: s.labelAr }))} />
    </Form.Item>
  </Col>
  <Col span={12}>
    <Form.Item name="region" label="المنطقة (Region)">
      <Select allowClear placeholder="اختر"
        options={REGIONS.map((r) => ({ value: r.value, label: r.labelAr }))} />
    </Form.Item>
  </Col>
</Row>

{/* ③ Project */}
<Form.Item name="project_description" label="وصف المشروع (Project)">
  <TextArea rows={2} placeholder="ما أرسله العميل عن مشروعه..." />
</Form.Item>
<Row gutter={16}>
  <Col span={12}>
    <Form.Item name="project_capacity" label="السعة المطلوبة (Capacity)">
      <Input placeholder="مثال: 10 طن / 8 HP" />
    </Form.Item>
  </Col>
  <Col span={12}>
    <Form.Item name="deal_value" label="القيمة المتوقعة (Expected Value)">
      <Input type="number" placeholder="EGP" />
    </Form.Item>
  </Col>
</Row>

{/* ④ Pipeline & ownership */}
<Row gutter={16}>
  <Col span={12}>
    <Form.Item name="pipeline_stage" label="المرحلة (Stage)">
      <Select options={PIPELINE_STAGES.map((s) => ({
        value: s.value, label: `${s.emoji} ${s.labelAr}` }))} />
    </Form.Item>
  </Col>
  <Col span={12}>
    <Form.Item name="assigned_to_user" label="المسؤول (Owner)">
      <Select allowClear showSearch optionFilterProp="label"
        placeholder="اختر المسؤول"
        options={owners.map((o) => ({ value: o.id, label: o.name }))} />
    </Form.Item>
  </Col>
</Row>
```

- [ ] **Step 4: Fix the submit payload**

In `handleSubmit`, replace the `payload` object (lines 52–61) with:
```tsx
const payload = {
  ...values,
  deal_value: values.deal_value ? Number(values.deal_value) : null,
  next_follow_up: values.next_follow_up ? values.next_follow_up.toISOString() : null,
  pipeline_stage: values.pipeline_stage || 'NEW',
  stage_timestamps: isEdit
    ? lead!.stage_timestamps
    : { [values.pipeline_stage || 'NEW']: new Date().toISOString() },
};
```

In the insert branch (line 89), default the owner to the current user only when none was picked:
```tsx
.insert({ ...payload, org_id: currentOrgId,
  assigned_to_user: values.assigned_to_user || user?.id,
  created_by: user?.id })
```

Remove the `status !== lead.status` activity-log block (lines 75–83) — status is no longer edited here. Remove the now-unused `LEAD_STATUSES` import on line 7.

- [ ] **Step 5: Add attachment upload after insert**

After the successful insert (`if (data) { logLeadActivity(data.id, 'creation'); }`), if the form collected files, upload them. Add an `<Upload>` control (AntD) bound to local state `fileList` in the form body under a `④ المرفقات (Attachments)` section, then after insert:
```tsx
if (data && fileList.length) {
  for (const f of fileList) {
    const fd = new FormData();
    fd.append('file', f.originFileObj as File);   // use the field name confirmed in Step 1
    fd.append('lead_id', data.id);
    await fetch('/api/files/upload', { method: 'POST', body: fd });
  }
}
```
Adjust the field names to match Step 1's confirmed contract. Add `const [fileList, setFileList] = useState<UploadFile[]>([]);` and reset it on close.

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit` — Expected: PASS for this file.
Run: `npm run build` — Expected: build succeeds.
Manual: `npm run dev`, open CRM → "إضافة عميل", confirm the form shows Contact / Classification / Project / Pipeline+Owner / Attachments and NO "الحالة القديمة" field. Create a lead with only Name+Phone → saves. Create one with a file attached → file appears in the lead's files.

- [ ] **Step 7: Commit**

```bash
git add "app/(dashboard)/crm/LeadFormModal.tsx"
git commit -m "feat(crm): enhanced lead entry form (project fields, owner, attachments)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Kanban board — zones, drag-drop stage change, claim, WhatsApp

**Files:**
- Modify: `app/(dashboard)/crm/KanbanView.tsx`

**Interfaces:**
- Consumes: `PIPELINE_STAGES`, `PIPELINE_ZONES` from `lib/constants`; `Lead` type; `getWhatsAppUrl`, `formatDate` from `lib/utils`; `@hello-pangea/dnd`.
- Produces: a board where dropping a card in a column sets `pipeline_stage`, appends to `stage_timestamps`, and inserts a `lead_activities` row (`type: 'status_change'`). Cards show owner, stage age, WhatsApp button, and a "استلام (Claim)" button on unassigned cards that sets `assigned_to_user` to the current user.

- [ ] **Step 1: Read the current KanbanView to learn its props + DnD usage**

Read `app/(dashboard)/crm/KanbanView.tsx` fully. Note its props (`leads`, `onLeadClick`, `onRefresh`), how it currently groups by stage, and whether it already uses `@hello-pangea/dnd`. Preserve the prop signature.

- [ ] **Step 2: Build columns from the new stages, grouped by zone**

Ensure the column list derives from `PIPELINE_STAGES` (all 10), and render a zone header bar above the columns using `PIPELINE_ZONES` (group columns whose `stage.zone` matches). Column definition example:
```tsx
const columns = PIPELINE_STAGES.map((s) => ({
  key: s.value,
  title: `${s.emoji} ${s.labelAr}`,
  color: s.color,
  zone: s.zone,
  items: leads.filter((l) => (l.pipeline_stage || 'NEW') === s.value),
}));
```

- [ ] **Step 3: Implement stage change on drop**

In the `onDragEnd` handler, when `destination.droppableId !== source.droppableId`, update the lead:
```tsx
const now = new Date().toISOString();
const newStage = destination.droppableId as PipelineStage;
const moved = leads.find((l) => l.id === draggableId);
const stage_timestamps = { ...(moved?.stage_timestamps || {}), [newStage]: now };

const { error } = await supabase.from('leads')
  .update({ pipeline_stage: newStage, stage_timestamps, updated_at: now })
  .eq('id', draggableId);
if (error) { message.error('فشل تحديث المرحلة'); return; }

supabase.from('lead_activities').insert({
  lead_id: draggableId,
  user_id: user?.id,
  type: 'status_change',
  body: `${moved?.pipeline_stage || 'NEW'} → ${newStage}`,
  org_id: moved?.org_id ?? currentOrgId,
});
onRefresh();
```
Import `useAuth`/`useOrg` for `user`/`currentOrgId`, `createClient`, `message`, and the `PipelineStage` type. (These mirror the pattern already used in `LeadDrawer.tsx`.)

- [ ] **Step 4: Card content — owner, stage age, WhatsApp, claim**

In the card render, add:
```tsx
{/* stage age */}
{lead.stage_timestamps?.[lead.pipeline_stage || 'NEW'] && (
  <span className="text-[10px] text-gray-400">
    {stageAgeDays(lead)} يوم في هذه المرحلة
  </span>
)}
{/* owner or claim */}
{lead.assigned_user?.name ? (
  <Tag>{lead.assigned_user.name}</Tag>
) : (
  <Button size="small" onClick={(e) => { e.stopPropagation(); claim(lead); }}>استلام</Button>
)}
{/* whatsapp */}
{lead.phone && (
  <a href={getWhatsAppUrl(lead.phone)} target="_blank" rel="noopener noreferrer"
     onClick={(e) => e.stopPropagation()}>
    <WhatsAppOutlined style={{ color: '#25D366' }} />
  </a>
)}
```
Add the helpers:
```tsx
function stageAgeDays(lead: Lead) {
  const ts = lead.stage_timestamps?.[lead.pipeline_stage || 'NEW'];
  if (!ts) return 0;
  return Math.floor((Date.now() - new Date(ts).getTime()) / 86_400_000);
}
const claim = async (lead: Lead) => {
  const { error } = await supabase.from('leads')
    .update({ assigned_to_user: user?.id }).eq('id', lead.id);
  if (error) return message.error('فشل الاستلام');
  message.success('تم الاستلام');
  onRefresh();
};
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit` — Expected: PASS for this file.
Run: `npm run build` — Expected: build succeeds.
Manual: `npm run dev`, CRM → Pipeline view. Confirm 10 columns under Tech/CS/Sales zone headers. Drag a card to another column → it stays there after refresh, the drawer's Stage History shows the new stage, and an activity row appears. Click "استلام" on an unassigned card → owner becomes you.

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/crm/KanbanView.tsx"
git commit -m "feat(crm): drag-drop Kanban with zones, stage age, claim, WhatsApp

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Drawer cleanup, manual assign/claim, lost reason, page defaults

**Files:**
- Modify: `app/(dashboard)/crm/LeadDrawer.tsx`
- Modify: `app/(dashboard)/crm/page.tsx`

**Interfaces:**
- Consumes: `PIPELINE_STAGES`, `LOST_REASONS`; existing `handleAssign` in the drawer.
- Produces: a drawer with NO legacy-status rows, a stage selector, a lost-reason selector shown only when stage = `LOST`, an always-available (not admin-only) manual assign block, and a "استلام" claim button. The CRM page defaults to the Kanban view and drops the legacy status filter.

- [ ] **Step 1: Remove legacy status from the drawer**

In `LeadDrawer.tsx`, delete the "الحالة القديمة (Legacy Status)" `Descriptions.Item` (lines 482–484) and the "الحالة الحالية" badge block in the Activity tab (lines 868–874). Remove the now-unused `LEAD_STATUSES` import and `statusConfig` (lines 401). Keep the Pipeline Stage descriptions item.

- [ ] **Step 2: Add a stage selector + lost-reason to the Details tab**

Under the Pipeline Stage row, add a control to change stage inline (writing `stage_timestamps` + activity, same as Task 4 Step 3 — extract that update into a local `updateStage(newStage)` helper and reuse it). When the selected stage is `LOST`, render a `LOST_REASONS` `<Select>` that saves to `leads.lost_reason`:
```tsx
{lead.pipeline_stage === 'LOST' && (
  <Form.Item label="سبب الخسارة (Lost reason)">
    <Select defaultValue={lead.lost_reason ?? undefined}
      options={LOST_REASONS.map((r) => ({ value: r.value, label: r.labelAr }))}
      onChange={async (v) => {
        await supabase.from('leads').update({ lost_reason: v }).eq('id', lead.id);
        onAssigned?.();
      }} />
  </Form.Item>
)}
```

- [ ] **Step 3: Make manual assign available to everyone; add claim; drop random RPC buttons**

Remove the two random-assign buttons (`handleRandomAssignToTech` / `handleRandomAssignToCS` and their JSX, lines 355–398 + 576–598) and the `assign_to_tech_team`/`assign_to_cs_team` calls. Move the manual assign `<Select team>/<Select user>/تعيين` block OUT of the `isFullAdmin`-only `<details>` so any user sees it (keep the existing `handleAssign`, which already logs activity + notifies). Add a top-level "استلام (Claim)" button when `!lead.assigned_to_user` that sets `assigned_to_user: user.id`.

- [ ] **Step 4: CRM page — Kanban default, drop legacy status filter**

In `app/(dashboard)/crm/page.tsx`: change `useState<'table' | 'kanban'>('table')` (line 55) to `('kanban')`. Remove the legacy status `<Select>` filter (lines 427–436) and the `statusFilter` state + its use in `fetchLeads` (lines 46, 120). Remove the `LEAD_STATUSES` import if no longer used and the `getStatusConfig` helper + the "الحالة (Status)" table column if it now references removed code — OR repoint that column to `PIPELINE_STAGES`. Prefer: replace the status column's render with the pipeline stage tag.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit` — Expected: PASS across the whole repo now (all old stage codes gone).
Run: `npm run build` — Expected: build succeeds.
Manual: `npm run dev`. CRM opens on the Pipeline board by default. Open a lead drawer: no "الحالة القديمة" anywhere; changing stage to "خسارة" reveals the lost-reason selector and saves it; the manual assign block is visible as a normal user; "استلام" claims the lead. No "(عشوائي)" buttons remain.

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/crm/LeadDrawer.tsx" "app/(dashboard)/crm/page.tsx"
git commit -m "feat(crm): manual assign/claim, lost reasons, Kanban default; retire legacy status UI

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Turn off automatic assignment on intake

**Files:**
- Modify: `lib/leads/intake.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `intakeLeads` inserts new scraped/Meta leads **unassigned** (`assigned_to_user: null`, `assigned_to_team: null`) in stage `NEW`, still de-duping by phone and still creating the org linkage. No round-robin cursor, no auto task, no per-rep notification.

- [ ] **Step 1: Remove the round-robin + auto-assignment logic**

In `intake.ts`, delete the CS-user fetch/`NoCsMembersError`/cursor logic (lines 27–44, 64–66) and the per-rep task + notification (lines 91–118). Replace the insert with an unassigned insert:
```ts
const { data: lead, error: insertErr } = await supabase
  .from('leads')
  .insert({
    name,
    phone: biz.phone,
    company: biz.company,
    email: biz.email,
    source,
    pipeline_stage: 'NEW',
    stage_timestamps: { NEW: now },
    assigned_to_user: null,
    assigned_to_team: null,
    org_id: null,
    notes: biz.website ? 'Website: ' + biz.website : undefined,
  })
  .select('id')
  .single();
if (insertErr || !lead) { errors += 1; continue; }
createdLeadIds.push(lead.id);
created += 1;
```
Keep the phone-dedup check. Drop `perRep` from the returned `IntakeResult` if it becomes unused, OR keep the key and always return `{}` — check callers first (Step 2).

- [ ] **Step 2: Fix callers**

Grep for `intakeLeads(` and `perRep`:
```bash
git grep -n "intakeLeads\|NoCsMembersError\|perRep"
```
Update any caller (e.g. `app/api/automation/intake/route.ts`, `app/api/scraper/cron/route.ts`) that reads `perRep` or catches `NoCsMembersError` so it still compiles. Keep `perRep: {}` in the return type if callers destructure it; otherwise remove it from the interface and callers.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` — Expected: PASS.
Run: `npm run build` — Expected: build succeeds.
Manual (if scraper is runnable): trigger an intake → new leads appear in CRM "جديد" column with NO owner. If not runnable locally, confirm by code review that the insert has `assigned_to_user: null`.

- [ ] **Step 4: Commit**

```bash
git add lib/leads/intake.ts app/api/automation/intake/route.ts app/api/scraper/cron/route.ts
git commit -m "feat(crm): fully manual intake — scraped/Meta leads land unassigned in NEW

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Unified 10-stage pipeline → Task 1 (constants/types) + Task 2 (DB). ✅
- Retire legacy `status` from UI, keep column → Tasks 3/5 (removed from form, drawer, page); migration keeps column. ✅
- Enhanced entry (project + value + owner + attachments) → Task 3. ✅
- Manual claim/assign, no auto round-robin → Tasks 4 (claim), 5 (assign block for all + drop RPC buttons), 6 (intake off). ✅
- Drag-drop Kanban grouped by zone, WhatsApp, stage age → Task 4; Kanban default → Task 5. ✅
- Lost reason field + UI → Task 1/2 (field), Task 5 (UI). ✅
- Notifications on assign → reuses existing `handleAssign` notify (Task 5). Hand-off/ follow-up-due notifications are covered by the existing bell system; no NEW notification wiring is in scope beyond assign (matches spec §3 "reuses existing bell system").

**Placeholder scan:** No TBD/TODO. Every code step shows real code. Migration constraint name is resolved in Task 2 Step 1 (explicit inspect-then-fill, not a blind placeholder).

**Type consistency:** `PipelineStage` codes used in Tasks 4–6 (`NEW`, `LOST`, etc.) match the Task 1 union exactly. `lost_reason`/`project_description` added in Task 1 types match Task 2 columns and Task 3/5 usage. `stage_timestamps` keyed by stage code is consistent across Tasks 3–5.

**Note for executor:** Tasks 1–2 are foundational and must land first. After Task 1, expect transient tsc errors in `KanbanView`/`LeadDrawer`/`page`/`intake` referencing old stage codes — these are resolved by Tasks 4–6. Full-repo `tsc --noEmit` is only guaranteed green at the end of Task 5 (UI) and Task 6 (intake).
