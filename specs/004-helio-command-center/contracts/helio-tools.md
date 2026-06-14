# Contract: Helio Tool-Use Interface

Endpoint: `POST /api/agent/chat` (authenticated session required; rate-limited per D6).

## Request / Response (client ⇄ route)

Request body unchanged from current shape: `{ messages, system?, leadContext? }`.
Response: `{ content: string, actions?: AgentActionSummary[] }` — `actions` lists any tools executed during the turn so the UI can render confirmation chips. Existing special responses (`register_lead_start` flow) preserved unchanged.

## Model loop

1. Regex fast-paths first (register-lead, assign shortcuts) — exactly as today.
2. Otherwise: Anthropic messages call with `model: 'claude-sonnet-4-6'`, `max_tokens: 2048`, `system: <existing persona> + loadSystemApprovalContext() + <role context block>`, `tools: toolsForRole(callerRole)`.
3. Loop while `stop_reason === 'tool_use'` (max 6 iterations): execute tool server-side, append `tool_result`, continue.
4. On Anthropic error: fall back to `claude-haiku-4-5-20251001` text-only reply; on that failing too: existing FALLBACKS.

## Tools

Scope: `member` = available to everyone (RLS-limited to own data); `lead` = team leads + admin; `admin` = admin only.
**All read/write tools execute with the caller's session-bound Supabase client (RLS enforced). Only `nudge_user` and `generate_report_now` touch service-role internals via existing libs.**

| Tool | Scope | Input schema (JSON) | Behavior & output |
|---|---|---|---|
| `query_leads` | member | `{ stage?, assigned_to_name?, stuck_only?, search?, limit? (≤20) }` | SELECT on `leads` via caller client; returns compact rows (id, name, stage, assignee, last_contact, deal_value) |
| `pipeline_stats` | member | `{ period?: 'today'\|'week'\|'month' }` | counts by stage, conversion, pipeline value (own scope for members; org-wide resolves via RLS for leads/admin) |
| `team_performance` | lead | `{ period?: 'today'\|'week' }` | per-member: calls logged, leads touched, tasks done, won value (reuses queries from lib/reports/company-report.ts) |
| `assign_lead` | lead | `{ lead_id, to_team: 'tech'\|'cs', to_user_name? }` | calls existing `/api/automation/assign` logic; records `agent_actions` (origin='chat', payload=prior assignee) |
| `create_task` | member | `{ title, lead_id?, assigned_to_name?, due_date?, priority? }` | members may only assign to themselves; insert task; record action |
| `nudge_user` | lead | `{ user_name, message, lead_id? }` | createNotification(type='nudge') + record action; suppression window applies |
| `schedule_followup` | member | `{ lead_id, date, note? }` | task (auto_created=false) titled "متابعة" + updates lead follow-up fields if present; record action |
| `generate_report_now` | lead | `{ kind: 'personal'\|'company', user_name? }` | runs lib/reports generator immediately, returns summary text; company kind = admin only; record action |
| `queue_scrape_target` | admin | `{ query, region }` | INSERT scrape_targets(status='queued'); record action (type='queue_scrape') |
| `list_my_actions` | lead | `{ since?: 'today'\|'week', origin? }` | SELECT agent_actions; returns timeline rows for "what did you do today?" |

Name resolution (`*_name` inputs): match against `profiles.name` ILIKE; if 0 or >1 matches, the tool returns a disambiguation error string that the model relays as a question — never guesses.

## Action recording

Every state-changing tool inserts one `agent_actions` row before returning success. Tool results sent back to the model are compact JSON strings (≤2 KB) — never raw table dumps.

## Undo endpoint

`POST /api/agent/actions/[id]/undo` (admin or team-lead session):
- 404 unknown id; 409 `{ error, reason }` if already undone or current state ≠ recorded after-state;
- `assign_lead`: restore `payload.previous_assigned_to_user/team`; `create_task`/`schedule_followup`: set task status `cancelled`;
- on success: set `undone_at`, `undone_by`; 200 `{ ok: true }`.

## Autonomy engine actions (origin='autonomous')

Same recording rules; reasoning is templated Arabic, e.g. `"الليد {name} واقف في {stage} من {days} أيام — بعتت تذكير لـ {assignee}"`. Digest message to admin: notification `type='agent_digest'` + Telegram, listing each action's reasoning line, or "🧠 هيليو: مفيش إجراءات النهاردة" / "⏸️ الأوتونومي متوقف".
