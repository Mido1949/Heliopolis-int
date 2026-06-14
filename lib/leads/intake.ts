import { createClient } from '@supabase/supabase-js';
import { createNotification } from '@/lib/notifications/in-app';

export interface ScrapedBusiness {
  name?: string; phone?: string; company?: string; email?: string;
  source?: string; address?: string; category?: string; website?: string;
}

export class NoCsMembersError extends Error {
  constructor() { super('No active CS members'); this.name = 'NoCsMembersError'; }
}

export interface IntakeResult {
  created: number; duplicates: number; errors: number;
  perRep: Record<string, number>; createdLeadIds: string[];
}

export async function intakeLeads(
  businesses: ScrapedBusiness[],
  opts?: { dueDates?: string[] }
): Promise<IntakeResult> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: csUsers } = await supabase
    .from('profiles')
    .select('id, name, org_id')
    .eq('crm_team', 'cs')
    .order('name');
  if (!csUsers || csUsers.length === 0) throw new NoCsMembersError();

  const csUserIds = csUsers.map(u => u.id);
  const orgMap = new Map<string, string>();
  for (const u of csUsers) {
    if (u.org_id) orgMap.set(u.id, u.org_id);
  }

  const { count: existingCount } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .in('assigned_to_user', csUserIds);
  let cursor = (existingCount || 0) % csUserIds.length;

  let created = 0;
  let duplicates = 0;
  let errors = 0;
  let createdIdx = 0;
  const perRep: Record<string, number> = {};
  const createdLeadIds: string[] = [];

  for (const biz of businesses) {
    try {
      if (!biz.phone) { errors += 1; continue; }

      const { data: existing } = await supabase
        .from('leads')
        .select('id')
        .eq('phone', biz.phone)
        .maybeSingle();
      if (existing) { duplicates += 1; continue; }

      const assignedId = csUserIds[cursor];
      cursor = (cursor + 1) % csUserIds.length;
      const assigneeOrgId = orgMap.get(assignedId);

      const now = new Date().toISOString();
      const source = biz.source || 'Phone';
      const name = biz.name || biz.company || 'Unknown';
      const { data: lead, error: insertErr } = await supabase
        .from('leads')
        .insert({
          name,
          phone: biz.phone,
          company: biz.company,
          email: biz.email,
          source,
          status: 'New',
          pipeline_stage: 'NEW',
          stage_timestamps: { NEW: now },
          assigned_to_user: assignedId,
          assigned_to_team: 'cs',
          org_id: assigneeOrgId,
          notes: biz.website ? 'Website: ' + biz.website : undefined,
        })
        .select('id')
        .single();
      if (insertErr || !lead) { errors += 1; continue; }

      const dueDate = opts?.dueDates?.length
        ? opts.dueDates[createdIdx % opts.dueDates.length]
        : now.slice(0, 10);

      const { error: taskErr } = await supabase.from('tasks').insert({
        title: 'متابعة ليد جديد — ' + name,
        description: 'مكالمة أولى (First call)',
        assigned_to: assignedId,
        created_by: assignedId,
        lead_id: lead.id,
        due_date: dueDate,
        status: 'pending',
        priority: 'high',
        auto_created: true,
        org_id: assigneeOrgId,
      });
      if (taskErr) {
        console.error('Intake: failed to create task for lead', lead.id, taskErr);
      }

      await createNotification(
        assignedId,
        '🎯 ليد جديد معين لك: ' + (name || biz.phone),
        lead.id,
        { type: 'lead_intake' }
      );

      perRep[assignedId] = (perRep[assignedId] || 0) + 1;
      createdLeadIds.push(lead.id);
      created += 1;
      createdIdx += 1;
    } catch (err) {
      errors += 1;
      console.error('Intake item failed:', err);
    }
  }

  return { created, duplicates, errors, perRep, createdLeadIds };
}
