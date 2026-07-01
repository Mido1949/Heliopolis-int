import type { SupabaseClient } from '@supabase/supabase-js';
import { createNotification } from '@/lib/notifications/in-app';
import type { PipelineStage } from '@/types';

export interface ToolContext {
  callerClient: SupabaseClient;
  serviceClient: SupabaseClient;
  callerId: string;
  callerRole: string;
  origin: 'chat' | 'autonomous';
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  scope: 'member' | 'lead' | 'admin';
}

class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolError';
  }
}

async function resolveUserId(client: SupabaseClient, name: string): Promise<string> {
  const { data, error } = await client
    .from('profiles')
    .select('id, name')
    .ilike('name', name);
  if (error) throw new ToolError(`خطأ في البحث عن المستخدم: ${error.message}`);
  if (!data || data.length === 0) {
    throw new ToolError(`لم أجد مستخدمًا باسم "${name}".`);
  }
  if (data.length > 1) {
    const names = data.map((p: { name: string }) => p.name).join('، ');
    throw new ToolError(`هناك أكثر من مستخدم باسم "${name}": ${names}. يرجى تحديد الاسم بشكل أدق.`);
  }
  return data[0].id;
}

interface LeadRow {
  id: string; name: string; pipeline_stage: string | null;
  assigned_to_user: string | null; assigned_to_team: string | null;
  stage_timestamps: Record<string, string> | null;
  last_contact_date: string | null; deal_value: number | null; next_follow_up: string | null;
}

async function resolveOrgId(client: SupabaseClient, userId: string): Promise<string> {
  const { data, error } = await client
    .from('profiles')
    .select('org_id')
    .eq('id', userId)
    .single();
  if (error || !data?.org_id) {
    throw new ToolError('تعذّر تحديد المؤسسة (org) للمستخدم.');
  }
  return data.org_id as string;
}

async function resolveLeadId(client: SupabaseClient, id: string): Promise<LeadRow | null> {
  const { data } = await client
    .from('leads')
    .select('id, name, pipeline_stage, assigned_to_user, assigned_to_team, stage_timestamps, last_contact_date, deal_value, next_follow_up')
    .eq('id', id)
    .single();
  return (data as LeadRow | null) || null;
}

function compactResult(obj: unknown): string {
  return JSON.stringify(obj);
}

async function recordAction(
  serviceClient: SupabaseClient,
  params: {
    action_type: string;
    origin: 'chat' | 'autonomous';
    target_lead_id?: string | null;
    target_user_id?: string | null;
    task_id?: string | null;
    reasoning: string;
    payload: Record<string, unknown>;
    created_by?: string | null;
  }
): Promise<string> {
  const { data, error } = await serviceClient
    .from('agent_actions')
    .insert({
      action_type: params.action_type,
      origin: params.origin,
      target_lead_id: params.target_lead_id || null,
      target_user_id: params.target_user_id || null,
      task_id: params.task_id || null,
      reasoning: params.reasoning,
      payload: params.payload,
      created_by: params.created_by || null,
    })
    .select('id')
    .single();
  if (error) throw new ToolError(`فشل تسجيل الإجراء: ${error.message}`);
  return data.id;
}

const LEADER_ROLES = ['admin', 'Manager', 'CS Team Leader', 'Tech Team Leader'];
const ADMIN_ROLES = ['admin'];

export function toolsForRole(role: string): ToolDefinition[] {
  const isAdmin = ADMIN_ROLES.includes(role);
  const isLead = isAdmin || role === 'Manager' || role === 'CS Team Leader' || role === 'Tech Team Leader';

  const memberTools: ToolDefinition[] = [
    {
      name: 'query_leads',
      description: 'بحث عن العملاء المتوقعين (leads) مع فلترة حسب المرحلة، المسؤول، أو نص البحث',
      input_schema: {
        type: 'object',
        properties: {
          stage: { type: 'string', description: 'مرحلة البايبلاين (NEW, CONTACTED, ASSIGNED_TECH, QUOTED, FOLLOW_UP, WON, LOST_PRICE, GHOSTED, POSTPONED)' },
          assigned_to_name: { type: 'string', description: 'اسم المستخدم المسؤول عن الليد' },
          stuck_only: { type: 'boolean', description: 'ليدة واقفة فقط (آخر تواصل من 3 أيام أو أكثر)' },
          search: { type: 'string', description: 'نص للبحث في الاسم أو الشركة' },
          limit: { type: 'number', description: 'أقصى عدد للنتائج (max 20)', maximum: 20 },
        },
      },
      scope: 'member',
    },
    {
      name: 'pipeline_stats',
      description: 'إحصائيات البايبلاين: التوزيع حسب المرحلة، معدل التحويل، إجمالي الصفقات',
      input_schema: {
        type: 'object',
        properties: {
          period: { type: 'string', enum: ['today', 'week', 'month'], description: 'الفترة (today, week, month)' },
        },
      },
      scope: 'member',
    },
    {
      name: 'create_task',
      description: 'إنشاء مهمة جديدة (الأعضاء العاديون يمكنهم التعيين لنفسهم فقط)',
      input_schema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'عنوان المهمة' },
          lead_id: { type: 'string', description: 'رقم الليد المرتبط (اختياري)' },
          assigned_to_name: { type: 'string', description: 'اسم المستخدم المكلف (للأعضاء العاديين: نفسك فقط)' },
          due_date: { type: 'string', description: 'تاريخ الاستحقاق بصيغة YYYY-MM-DD' },
          priority: { type: 'string', enum: ['high', 'medium', 'low'], description: 'الأولوية' },
        },
        required: ['title'],
      },
      scope: 'member',
    },
    {
      name: 'schedule_followup',
      description: 'جدولة متابعة لليد: ينشئ مهمة "متابعة" ويحدث تاريخ المتابعة',
      input_schema: {
        type: 'object',
        properties: {
          lead_id: { type: 'string', description: 'رقم الليد' },
          date: { type: 'string', description: 'تاريخ المتابعة بصيغة YYYY-MM-DD' },
          note: { type: 'string', description: 'ملاحظة للمتابعة' },
        },
        required: ['lead_id', 'date'],
      },
      scope: 'member',
    },
  ];

  const leadTools: ToolDefinition[] = [
    {
      name: 'team_performance',
      description: 'أداء الفريق: المكالمات، الليدة المتعامل معا، المهام المنجزة، قيمة الصفقات',
      input_schema: {
        type: 'object',
        properties: {
          period: { type: 'string', enum: ['today', 'week'], description: 'الفترة (today, week)' },
        },
      },
      scope: 'lead',
    },
    {
      name: 'assign_lead',
      description: 'تعيين ليد لعضو فريق معين أو فريق (tech/cs)',
      input_schema: {
        type: 'object',
        properties: {
          lead_id: { type: 'string', description: 'رقم الليد' },
          to_team: { type: 'string', enum: ['tech', 'cs'], description: 'الفريق المستهدف' },
          to_user_name: { type: 'string', description: 'اسم المستخدم المستهدف (اختياري — يتم التوزيع التلقائي إذا لم يُحدد)' },
        },
        required: ['lead_id', 'to_team'],
      },
      scope: 'lead',
    },
    {
      name: 'nudge_user',
      description: 'إرسال تذكير لمستخدم معين (مثلاً: تذكيره بالاتصال بليد)',
      input_schema: {
        type: 'object',
        properties: {
          user_name: { type: 'string', description: 'اسم المستخدم المراد تذكيره' },
          message: { type: 'string', description: 'نص التذكير' },
          lead_id: { type: 'string', description: 'رقم الليد المرتبط (اختياري)' },
        },
        required: ['user_name', 'message'],
      },
      scope: 'lead',
    },
    {
      name: 'generate_report_now',
      description: 'توليد تقرير فوري (شخصي أو الشركة) وعرض ملخصه',
      input_schema: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['personal', 'company'], description: 'نوع التقرير' },
          user_name: { type: 'string', description: 'اسم المستخدم (للتقرير الشخصي — اختياري، الافتراضي المتصل)' },
        },
        required: ['kind'],
      },
      scope: 'lead',
    },
    {
      name: 'list_my_actions',
      description: 'عرض الإجراءات التي قمت بها أو إجراءات الأوتونومي (لمشرفي الفرق)',
      input_schema: {
        type: 'object',
        properties: {
          since: { type: 'string', enum: ['today', 'week'], description: 'منذ متى (today, week)' },
          origin: { type: 'string', enum: ['chat', 'autonomous'], description: 'فلترة حسب المصدر' },
        },
      },
      scope: 'lead',
    },
  ];

  const adminTools: ToolDefinition[] = [
    {
      name: 'queue_scrape_target',
      description: 'إضافة هدف سحب أسبوعي للطابور (يشتغل يوم السبت)',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'كلمات البحث (مثال: شركات تكييف)' },
          region: { type: 'string', description: 'المنطقة (مثال: التجمع الخامس, القاهرة)' },
        },
        required: ['query', 'region'],
      },
      scope: 'admin',
    },
    {
      name: 'send_email',
      description: 'إرسال إيميل لعميل (عرض/متابعة) مع إمكانية إرفاق مستندات الشركة الرسمية (التفويض، المطابقة، قوائم الأسعار، البطاقة الضريبية، السجل التجاري)',
      input_schema: {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'إيميل المستقبِل' },
          subject: { type: 'string', description: 'عنوان الإيميل' },
          body: { type: 'string', description: 'نص الإيميل' },
          attach_docs: {
            type: 'array',
            items: { type: 'string' },
            description: 'مستندات للإرفاق (مثال: ["تفويض","مطابقة","اسعار خارجية","اسعار داخلية","بطاقة ضريبية","سجل تجاري","قيمة مضافة"])',
          },
        },
        required: ['to', 'subject', 'body'],
      },
      scope: 'admin',
    },
  ];

  const tools: ToolDefinition[] = [...memberTools];
  if (isLead) tools.push(...leadTools);
  if (isAdmin) tools.push(...adminTools);
  return tools;
}

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> {
  switch (name) {
    case 'query_leads': return queryLeads(input, ctx);
    case 'pipeline_stats': return pipelineStats(input, ctx);
    case 'team_performance': return teamPerformance(input, ctx);
    case 'assign_lead': return assignLead(input, ctx);
    case 'create_task': return createTask(input, ctx);
    case 'nudge_user': return nudgeUser(input, ctx);
    case 'schedule_followup': return scheduleFollowup(input, ctx);
    case 'generate_report_now': return generateReportNow(input, ctx);
    case 'queue_scrape_target': return queueScrapeTarget(input, ctx);
    case 'send_email': return sendEmailTool(input, ctx);
    case 'list_my_actions': return listMyActions(input, ctx);
    default:
      throw new ToolError(`أداة غير معروفة: "${name}".`);
  }
}

async function queryLeads(input: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  let query = ctx.callerClient.from('leads').select('id, name, pipeline_stage, assigned_to_user, last_contact_date, deal_value');

  if (input.stage) {
    query = query.eq('pipeline_stage', input.stage as string);
  }
  if (input.assigned_to_name) {
    const userId = await resolveUserId(ctx.callerClient, input.assigned_to_name as string);
    query = query.eq('assigned_to_user', userId);
  }
  if (input.stuck_only) {
    query = query.not('last_contact_date', 'is', null);
  }
  if (input.search) {
    query = query.or(`name.ilike.%${input.search}%,company.ilike.%${input.search}%`);
  }
  const limit = Math.min(Math.max(1, (input.limit as number) || 10), 20);
  const { data, error } = await query.limit(limit);
  if (error) throw new ToolError(`خطأ في البحث: ${error.message}`);

  const rows = (data || []).map((r: Record<string, unknown>) => ({
    id: r.id,
    name: r.name,
    stage: r.pipeline_stage,
    last_contact: r.last_contact_date,
    deal_value: r.deal_value,
  }));

  return compactResult({ count: rows.length, leads: rows });
}

async function pipelineStats(input: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  const { data: leads, error } = await ctx.callerClient
    .from('leads')
    .select('pipeline_stage, deal_value');
  if (error) throw new ToolError(`خطأ في الإحصائيات: ${error.message}`);

  const byStage: Record<string, number> = {};
  let totalValue = 0;
  let newCount = 0;
  let wonCount = 0;
  (leads || []).forEach((l: { pipeline_stage?: string; deal_value?: number | null }) => {
    const stage = l.pipeline_stage || 'NEW';
    byStage[stage] = (byStage[stage] || 0) + 1;
    totalValue += Number(l.deal_value || 0);
    if (stage === 'NEW') newCount++;
    if (stage === 'WON') wonCount++;
  });

  const conversion = newCount > 0 ? ((wonCount / newCount) * 100).toFixed(1) + '%' : '0%';

  return compactResult({
    by_stage: byStage,
    pipeline_value: totalValue,
    conversion_rate: conversion,
    total_leads: (leads || []).length,
  });
}

async function teamPerformance(input: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  const period = (input.period as string) || 'today';
  const dayStart = new Date();
  if (period === 'week') dayStart.setDate(dayStart.getDate() - 7);
  else dayStart.setHours(0, 0, 0, 0);
  const dayStartISO = dayStart.toISOString();

  const { data: profiles, error: profErr } = await ctx.callerClient
    .from('profiles')
    .select('id, name, crm_team')
    .not('crm_team', 'is', null);
  if (profErr) throw new ToolError(`خطأ في تحميل الأعضاء: ${profErr.message}`);

  const profileMap: Record<string, { name: string; crm_team?: string }> = {};
  (profiles || []).forEach((p: { id: string; name: string; crm_team?: string }) => {
    profileMap[p.id] = p;
  });

  const [callsRes, leadsAssignedRes, tasksRes, wonRes] = await Promise.all([
    ctx.callerClient.from('call_logs').select('created_by').gte('created_at', dayStartISO),
    ctx.callerClient.from('leads').select('assigned_to_user').not('assigned_to_user', 'is', null).gte('created_at', dayStartISO),
    ctx.callerClient.from('tasks').select('assigned_to, status').gte('created_at', dayStartISO),
    ctx.callerClient.from('leads').select('assigned_to_user, deal_value').eq('pipeline_stage', 'WON').gte('updated_at', dayStartISO),
  ]);

  const activity: Record<string, { calls: number; leads_assigned: number; tasks_done: number; won_value: number }> = {};
  (callsRes.data || []).forEach((c: { created_by: string }) => {
    if (!activity[c.created_by]) activity[c.created_by] = { calls: 0, leads_assigned: 0, tasks_done: 0, won_value: 0 };
    activity[c.created_by].calls++;
  });
  (leadsAssignedRes.data || []).forEach((l: { assigned_to_user: string }) => {
    if (!activity[l.assigned_to_user]) activity[l.assigned_to_user] = { calls: 0, leads_assigned: 0, tasks_done: 0, won_value: 0 };
    activity[l.assigned_to_user].leads_assigned++;
  });
  (tasksRes.data || []).forEach((t: { assigned_to: string; status: string }) => {
    if (t.status === 'done') {
      if (!activity[t.assigned_to]) activity[t.assigned_to] = { calls: 0, leads_assigned: 0, tasks_done: 0, won_value: 0 };
      activity[t.assigned_to].tasks_done++;
    }
  });
  (wonRes.data || []).forEach((l: { assigned_to_user: string; deal_value: number | null }) => {
    if (!activity[l.assigned_to_user]) activity[l.assigned_to_user] = { calls: 0, leads_assigned: 0, tasks_done: 0, won_value: 0 };
    activity[l.assigned_to_user].won_value += Number(l.deal_value || 0);
  });

  // List every team member, including those with no activity yet (zeros) so the
  // model never says a real member is "not found".
  const members = Object.keys(profileMap).map((uid) => {
    const a = activity[uid] || { calls: 0, leads_assigned: 0, tasks_done: 0, won_value: 0 };
    return {
      user: profileMap[uid].name,
      team: profileMap[uid].crm_team || null,
      calls: a.calls,
      leads_assigned: a.leads_assigned,
      tasks_done: a.tasks_done,
      won_value: a.won_value,
    };
  });

  return compactResult({ period, members });
}

async function assignLead(input: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  const leadId = input.lead_id as string;
  const toTeam = input.to_team as string;
  const toUserName = input.to_user_name as string | undefined;

  const current = await resolveLeadId(ctx.callerClient, leadId);
  if (!current) throw new ToolError(`ليد برقم "${leadId}" غير موجود.`);

  const priorState = {
    previous_assigned_to_user: current.assigned_to_user,
    previous_assigned_to_team: current.assigned_to_team,
    previous_pipeline_stage: current.pipeline_stage,
  };

  let targetUserId: string = current.assigned_to_user || '';
  if (toUserName) {
    targetUserId = await resolveUserId(ctx.callerClient, toUserName);
  }
  if (!targetUserId) {
    const { data: users } = await ctx.callerClient
      .from('profiles')
      .select('id')
      .eq('crm_team', toTeam)
      .limit(1);
    if (!users || users.length === 0) throw new ToolError(`لا يوجد أعضاء في فريق "${toTeam}".`);
    targetUserId = users[0].id;
  }

  const newStage: PipelineStage = toTeam === 'tech' ? 'INTERESTED' : 'NEGOTIATION';
  const now = new Date().toISOString();

  const { error: updateErr } = await ctx.callerClient
    .from('leads')
    .update({
      assigned_to_team: toTeam,
      assigned_to_user: targetUserId,
      assigned_by: ctx.callerId,
      pipeline_stage: newStage,
      stage_timestamps: { ...((current.stage_timestamps as Record<string, string>) || {}), [newStage]: now },
      last_contact_date: now,
      updated_at: now,
    })
    .eq('id', leadId);
  if (updateErr) throw new ToolError(`فشل التعيين: ${updateErr.message}`);

  await createNotification(
    targetUserId,
    `📥 تم تعيين ليد لك: ${current.name}`,
    leadId,
    { type: 'assignment', from: ctx.callerId, to_team: toTeam }
  );

  await recordAction(ctx.serviceClient, {
    action_type: 'assign_lead',
    origin: ctx.origin,
    target_lead_id: leadId,
    target_user_id: targetUserId,
    reasoning: `تعيين ليد "${current.name}" إلى ${toUserName || `فريق ${toTeam}`}`,
    payload: priorState,
    created_by: ctx.callerId,
  });

  return compactResult({
    ok: true,
    lead: { id: leadId, name: current.name, stage: newStage, assigned_to_user: targetUserId },
  });
}

async function createTask(input: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  const title = input.title as string;
  const leadId = input.lead_id as string | undefined;
  const dueDate = input.due_date as string | undefined;
  const priority = (input.priority as string) || 'medium';

  let assignedTo = ctx.callerId;
  if (input.assigned_to_name) {
    const resolvedId = await resolveUserId(ctx.callerClient, input.assigned_to_name as string);
    const isAdmin = ADMIN_ROLES.includes(ctx.callerRole);
    const isLead = LEADER_ROLES.includes(ctx.callerRole);
    if (!isAdmin && !isLead && resolvedId !== ctx.callerId) {
      throw new ToolError('يمكنك التعيين لنفسك فقط. تواصل مع مشرف الفريق لتعيين مهمة لشخص آخر.');
    }
    assignedTo = resolvedId;
  }

  const orgId = await resolveOrgId(ctx.callerClient, ctx.callerId);
  const { data: task, error } = await ctx.callerClient
    .from('tasks')
    .insert({
      title,
      lead_id: leadId || null,
      assigned_to: assignedTo,
      created_by: ctx.callerId,
      due_date: dueDate ? new Date(dueDate).toISOString() : null,
      priority,
      status: 'pending',
      auto_created: false,
      org_id: orgId,
    })
    .select('id, title, assigned_to, lead_id, due_date, priority')
    .single();
  if (error) throw new ToolError(`فشل إنشاء المهمة: ${error.message}`);

  await recordAction(ctx.serviceClient, {
    action_type: 'create_task',
    origin: ctx.origin,
    target_lead_id: leadId || null,
    target_user_id: assignedTo,
    task_id: task.id,
    reasoning: `إنشاء مهمة "${title}"${leadId ? ` لليد ${leadId}` : ''}`,
    payload: {},
    created_by: ctx.callerId,
  });

  return compactResult({ ok: true, task: { id: task.id, title: task.title } });
}

async function nudgeUser(input: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  const userName = input.user_name as string;
  const message = input.message as string;
  const leadId = input.lead_id as string | undefined;

  const targetUserId = await resolveUserId(ctx.callerClient, userName);

  await createNotification(
    targetUserId,
    `⏰ تذكير من ${ctx.callerId}: ${message}`,
    leadId || undefined,
    { type: 'nudge', from: ctx.callerId }
  );

  await recordAction(ctx.serviceClient, {
    action_type: 'nudge',
    origin: ctx.origin,
    target_lead_id: leadId || null,
    target_user_id: targetUserId,
    reasoning: `تذكير "${userName}": ${message}`,
    payload: {},
    created_by: ctx.callerId,
  });

  return compactResult({ ok: true, message: `تم إرسال التذكير إلى ${userName}.` });
}

async function scheduleFollowup(input: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  const leadId = input.lead_id as string;
  const date = input.date as string;
  const note = input.note as string | undefined;

  const current = await resolveLeadId(ctx.callerClient, leadId);
  if (!current) throw new ToolError(`ليد برقم "${leadId}" غير موجود.`);

  const orgId = await resolveOrgId(ctx.callerClient, ctx.callerId);
  const { data: task, error: taskErr } = await ctx.callerClient
    .from('tasks')
    .insert({
      title: 'متابعة',
      description: note || null,
      lead_id: leadId,
      assigned_to: current.assigned_to_user || ctx.callerId,
      created_by: ctx.callerId,
      due_date: new Date(date).toISOString(),
      status: 'pending',
      priority: 'medium',
      auto_created: false,
      org_id: orgId,
    })
    .select('id')
    .single();
  if (taskErr) throw new ToolError(`فشل إنشاء مهمة المتابعة: ${taskErr.message}`);

  const { error: updateErr } = await ctx.callerClient
    .from('leads')
    .update({ next_follow_up: new Date(date).toISOString() })
    .eq('id', leadId);
  if (updateErr) throw new ToolError(`فشل تحديث تاريخ المتابعة: ${updateErr.message}`);

  await recordAction(ctx.serviceClient, {
    action_type: 'schedule_followup',
    origin: ctx.origin,
    target_lead_id: leadId,
    task_id: task.id,
    reasoning: `جدولة متابعة لليد "${current.name}" في ${date}${note ? `: ${note}` : ''}`,
    payload: { previous_next_follow_up: current.next_follow_up },
    created_by: ctx.callerId,
  });

  return compactResult({ ok: true, task_id: task.id, date });
}

async function generateReportNow(input: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  const kind = input.kind as string;
  const userName = input.user_name as string | undefined;

  if (kind === 'company') {
    const isAdmin = ADMIN_ROLES.includes(ctx.callerRole);
    if (!isAdmin) {
      throw new ToolError('تقرير الشركة متاح للمديرين فقط.');
    }
  }

  const date = new Date().toISOString().slice(0, 10);

  if (kind === 'personal') {
    let userId = ctx.callerId;
    if (userName) {
      userId = await resolveUserId(ctx.callerClient, userName);
    }
    const { getPersonalReportData } = await import('@/lib/reports/personal-report');
    const report = await getPersonalReportData(userId, date);

    await recordAction(ctx.serviceClient, {
      action_type: 'generate_report',
      origin: ctx.origin,
      target_user_id: userId,
      reasoning: `توليد تقرير شخصي لـ ${userName || ctx.callerId} — ${date}`,
      payload: { kind, user_id: userId },
      created_by: ctx.callerId,
    });

    return compactResult({
      ok: true,
      summary: `تقرير ${date}: ${report.activity.calls_made} مكالمات، ${report.activity.leads_entered} ليد جديد، ${report.outcomes.won.length} فوز.`,
    });
  }

  if (kind === 'company') {
    const { generateCompanyReport } = await import('@/lib/reports/company-report');
    const report = await generateCompanyReport(date);

    await recordAction(ctx.serviceClient, {
      action_type: 'generate_report',
      origin: ctx.origin,
      reasoning: `توليد تقرير الشركة — ${date}`,
      payload: { kind, date },
      created_by: ctx.callerId,
    });

    const stageSummary = Object.entries(report.pipeline.by_stage)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');

    return compactResult({
      ok: true,
      summary: `تقرير الشركة ${date}: ${stageSummary} — القيمة ${report.pipeline.pipeline_value} — تحويل ${report.pipeline.conversion_rate}.`,
    });
  }

  throw new ToolError(`نوع تقرير غير معروف: "${kind}".`);
}

async function queueScrapeTarget(input: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  const query = input.query as string;
  const region = input.region as string;

  const { data, error } = await ctx.callerClient
    .from('scrape_targets')
    .insert({
      query,
      region,
      status: 'queued',
      requested_by: ctx.callerId,
    })
    .select('id, query, region, status')
    .single();
  if (error) throw new ToolError(`فشل إضافة هدف السحب: ${error.message}`);

  await recordAction(ctx.serviceClient, {
    action_type: 'queue_scrape',
    origin: ctx.origin,
    reasoning: `إضافة هدف سحب "${query}" في ${region}`,
    payload: {},
    created_by: ctx.callerId,
  });

  return compactResult({ ok: true, target: { id: data.id, query: data.query, region: data.region } });
}

const COMPANY_DOCS: { keys: string[]; filename: string; url: string }[] = [
  { keys: ['تفويض', 'authorization', 'ضمان', 'warranty'], filename: 'Authorization-Letter-5yr.pdf', url: 'https://wrmqrvqixtrasajjfbge.supabase.co/storage/v1/object/public/company-docs/authorization-letter-5yr.pdf' },
  { keys: ['مطابقة', 'compliance'], filename: 'Compliance-Sheet.pdf', url: 'https://wrmqrvqixtrasajjfbge.supabase.co/storage/v1/object/public/company-docs/compliance-sheet.pdf' },
  { keys: ['خارجية', 'outdoor'], filename: 'VRF-Outdoor-PriceList.pdf', url: 'https://wrmqrvqixtrasajjfbge.supabase.co/storage/v1/object/public/company-docs/vrf-outdoor-price-list.pdf' },
  { keys: ['داخلية', 'indoor'], filename: 'VRF-Indoor-PriceList.pdf', url: 'https://wrmqrvqixtrasajjfbge.supabase.co/storage/v1/object/public/company-docs/vrf-indoor-price-list.pdf' },
  { keys: ['بطاقة ضريبية', 'tax'], filename: 'Tax-Card.pdf', url: 'https://wrmqrvqixtrasajjfbge.supabase.co/storage/v1/object/public/company-docs/tax-card.pdf' },
  { keys: ['سجل تجاري', 'commercial'], filename: 'Commercial-Register.pdf', url: 'https://wrmqrvqixtrasajjfbge.supabase.co/storage/v1/object/public/company-docs/commercial-register.pdf' },
  { keys: ['قيمة مضافة', 'مضاف', 'vat'], filename: 'VAT-Certificate.pdf', url: 'https://wrmqrvqixtrasajjfbge.supabase.co/storage/v1/object/public/company-docs/vat-certificate.pdf' },
];

async function sendEmailTool(input: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  const to = input.to as string;
  const subject = input.subject as string;
  const body = input.body as string;
  const attachDocs = (input.attach_docs as string[] | undefined) || [];

  if (!process.env.RESEND_API_KEY) {
    throw new ToolError('خدمة الإيميل لسه مش مفعّلة — محتاج إضافة RESEND_API_KEY و EMAIL_FROM (دومين مُوثّق) في إعدادات النظام.');
  }

  const attachments = attachDocs
    .map(want => {
      const w = String(want).toLowerCase();
      return COMPANY_DOCS.find(d => d.keys.some(k => w.includes(k.toLowerCase()) || k.includes(w)));
    })
    .filter((d): d is { keys: string[]; filename: string; url: string } => !!d)
    .map(d => ({ filename: d.filename, path: d.url }));

  const from = process.env.EMAIL_FROM || 'HelioMax <onboarding@resend.dev>';

  try {
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from,
      to,
      subject,
      text: body,
      ...(attachments.length ? { attachments } : {}),
    });
    if (error) throw new ToolError(`فشل إرسال الإيميل: ${error.message}`);
  } catch (err) {
    if (err instanceof ToolError) throw err;
    throw new ToolError(`فشل إرسال الإيميل: ${err instanceof Error ? err.message : 'unknown'}`);
  }

  await recordAction(ctx.serviceClient, {
    action_type: 'send_email',
    origin: ctx.origin,
    reasoning: `إرسال إيميل إلى ${to} — "${subject}"${attachments.length ? ` مع ${attachments.length} مرفق` : ''}`,
    payload: { to, subject, attachments: attachments.map(a => a.filename) },
    created_by: ctx.callerId,
  });

  return compactResult({
    ok: true,
    sent_to: to,
    attachments: attachments.map(a => a.filename),
  });
}

async function listMyActions(input: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  let query = ctx.callerClient
    .from('agent_actions')
    .select('id, action_type, origin, target_lead_id, target_user_id, reasoning, created_at, undone_at')
    .order('created_at', { ascending: false });

  const since = (input.since as string) || 'today';
  if (since === 'today') {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    query = query.gte('created_at', todayStart.toISOString());
  } else {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    query = query.gte('created_at', weekAgo.toISOString());
  }

  if (input.origin) {
    query = query.eq('origin', input.origin as string);
  }

  query = query.limit(50);

  const { data, error } = await query;
  if (error) throw new ToolError(`خطأ في تحميل الإجراءات: ${error.message}`);

  const actions = (data || []).map((a: Record<string, unknown>) => ({
    id: a.id,
    action: a.action_type,
    origin: a.origin,
    reasoning: a.reasoning,
    created_at: a.created_at,
    undone: a.undone_at !== null,
  }));

  return compactResult({ count: actions.length, actions });
}
