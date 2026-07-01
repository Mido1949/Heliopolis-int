import { createClient } from '@supabase/supabase-js';

export interface ScrapedBusiness {
  name?: string; phone?: string; company?: string; email?: string;
  source?: string; address?: string; category?: string; website?: string;
}

export interface IntakeResult {
  created: number; duplicates: number; errors: number;
  perRep: Record<string, number>; createdLeadIds: string[];
}

export async function intakeLeads(
  businesses: ScrapedBusiness[]
): Promise<IntakeResult> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  let created = 0;
  let duplicates = 0;
  let errors = 0;
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
    } catch (err) {
      errors += 1;
      console.error('Intake item failed:', err);
    }
  }

  return { created, duplicates, errors, perRep, createdLeadIds };
}
