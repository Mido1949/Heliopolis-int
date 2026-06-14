import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { CookieOptions } from '@supabase/ssr';
import Anthropic from '@anthropic-ai/sdk';

export interface CompanyReport {
  date: string;
  pipeline: {
    by_stage: Record<string, number>;
    conversion_rate: string;
    pipeline_value: number;
  };
  team: {
    cs: { user: string; calls: number; leads_assigned: number }[];
    tech: { user: string; boqs_sent: number }[];
  };
  won_today: { name: string; deal_value: number | null }[];
  flags: string[];
  ai_insight: string;
}

/**
 * T067: Generate daily company intelligence report.
 * Aggregates pipeline data, team performance, and AI insight.
 */
export async function generateCompanyReport(date: string): Promise<CompanyReport> {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set(name: string, value: string, options: CookieOptions) {
          try { cookieStore.set({ name, value, ...options }); } catch { /* noop */ }
        },
        remove(name: string, options: CookieOptions) {
          try { cookieStore.set({ name, value: '', ...options }); } catch { /* noop */ }
        },
      },
    }
  );

  const dayStart = `${date}T00:00:00.000Z`;
  const dayEnd = `${date}T23:59:59.999Z`;

  // 1. Pipeline stage counts (lifetime)
  const { data: leads } = await supabase
    .from('leads')
    .select('id, name, pipeline_stage, deal_value, stage_timestamps, assigned_to_user, assigned_to_team, updated_at');

  const by_stage: Record<string, number> = {};
  let pipeline_value = 0;
  let wonCount = 0;
  let newCount = 0;
  (leads || []).forEach((l: { pipeline_stage?: string; deal_value?: number | null }) => {
    const stage = l.pipeline_stage || 'NEW';
    by_stage[stage] = (by_stage[stage] || 0) + 1;
    if (['NEW', 'CONTACTED', 'ASSIGNED_TECH', 'QUOTED', 'FOLLOW_UP'].includes(stage)) {
      pipeline_value += Number(l.deal_value || 0);
    }
    if (stage === 'WON') wonCount += 1;
    if (stage === 'NEW') newCount += 1;
  });
  const conversion_rate = newCount > 0 ? ((wonCount / newCount) * 100).toFixed(2) + '%' : '0%';

  // 2. Per-user activity
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name, crm_team');

  const { data: callsToday } = await supabase
    .from('call_logs')
    .select('created_by')
    .gte('created_at', dayStart).lte('created_at', dayEnd);
  const { data: boqsToday } = await supabase
    .from('boqs')
    .select('created_by')
    .gte('created_at', dayStart).lte('created_at', dayEnd);
  const { data: leadsAssignedToday } = await supabase
    .from('leads')
    .select('assigned_to_user')
    .gte('created_at', dayStart).lte('created_at', dayEnd)
    .not('assigned_to_user', 'is', null);

  const profileMap: Record<string, { name: string; crm_team?: string }> = {};
  (profiles || []).forEach((p: { id: string; name: string; crm_team?: string }) => {
    profileMap[p.id] = { name: p.name, crm_team: p.crm_team };
  });

  const csActivity: Record<string, { calls: number; leads_assigned: number }> = {};
  const techActivity: Record<string, { boqs_sent: number }> = {};

  (callsToday || []).forEach((c: { created_by: string }) => {
    const u = profileMap[c.created_by];
    if (u?.crm_team === 'cs') {
      csActivity[c.created_by] = csActivity[c.created_by] || { calls: 0, leads_assigned: 0 };
      csActivity[c.created_by].calls += 1;
    }
  });
  (leadsAssignedToday || []).forEach((l: { assigned_to_user: string }) => {
    const u = profileMap[l.assigned_to_user];
    if (u?.crm_team === 'cs') {
      csActivity[l.assigned_to_user] = csActivity[l.assigned_to_user] || { calls: 0, leads_assigned: 0 };
      csActivity[l.assigned_to_user].leads_assigned += 1;
    }
  });
  (boqsToday || []).forEach((b: { created_by: string }) => {
    const u = profileMap[b.created_by];
    if (u?.crm_team === 'tech') {
      techActivity[b.created_by] = techActivity[b.created_by] || { boqs_sent: 0 };
      techActivity[b.created_by].boqs_sent += 1;
    }
  });

  const team = {
    cs: Object.entries(csActivity).map(([uid, v]) => ({
      user: profileMap[uid]?.name || 'Unknown',
      calls: v.calls,
      leads_assigned: v.leads_assigned,
    })),
    tech: Object.entries(techActivity).map(([uid, v]) => ({
      user: profileMap[uid]?.name || 'Unknown',
      boqs_sent: v.boqs_sent,
    })),
  };

  // 3. WON/LOST/GHOSTED/POSTPONED today
  const { data: wonToday } = await supabase
    .from('leads')
    .select('name, deal_value')
    .eq('pipeline_stage', 'WON')
    .gte('updated_at', dayStart).lte('updated_at', dayEnd);

  // 4. Stuck leads (in same stage > 3 days)
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const flags: string[] = [];
  (leads || []).forEach((l: { name: string; pipeline_stage?: string; stage_timestamps?: Record<string, string> }) => {
    if (!l.stage_timestamps || !l.pipeline_stage) return;
    const ts = l.stage_timestamps[l.pipeline_stage];
    if (!ts) return;
    if (new Date(ts).getTime() < new Date(threeDaysAgo).getTime() && ['NEW', 'CONTACTED', 'ASSIGNED_TECH', 'QUOTED', 'FOLLOW_UP'].includes(l.pipeline_stage)) {
      const days = Math.floor((Date.now() - new Date(ts).getTime()) / (24 * 60 * 60 * 1000));
      flags.push(`Lead "${l.name}" stuck in ${l.pipeline_stage} for ${days} days`);
    }
  });

  // 5. AI insight
  let ai_insight = 'AI insight unavailable.';
  try {
    if (process.env.ANTHROPIC_API_KEY) {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const prompt = `You are a sales operations analyst. Generate a 2-3 sentence insight paragraph for the daily company report.
Data:
- Date: ${date}
- Pipeline by stage: ${JSON.stringify(by_stage)}
- Won today: ${wonToday?.length || 0} ($${(wonToday || []).reduce((a, w: { deal_value: number | null }) => a + Number(w.deal_value || 0), 0)})
- CS team activity: ${team.cs.length} active users, ${team.cs.reduce((a, c) => a + c.calls, 0)} calls
- Tech team activity: ${team.tech.length} active users, ${team.tech.reduce((a, t) => a + t.boqs_sent, 0)} BOQs sent
- Stuck leads: ${flags.length}

Write a concise insight focused on the most important observation and one recommended action. Use Egyptian Arabic.`;

      const msg = await client.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      });
      const block = msg.content[0];
      if (block.type === 'text') ai_insight = block.text;
    }
  } catch (err) {
    console.error('AI insight failed:', err);
    ai_insight = 'تعذّر توليد ملاحظة الذكاء الاصطناعي اليوم.';
  }

  return {
    date,
    pipeline: { by_stage, conversion_rate, pipeline_value },
    team,
    won_today: (wonToday || []).map((w: { name: string; deal_value: number | null }) => ({
      name: w.name,
      deal_value: w.deal_value,
    })),
    flags,
    ai_insight,
  };
}
