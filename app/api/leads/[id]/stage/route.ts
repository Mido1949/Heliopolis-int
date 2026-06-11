import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { CookieOptions } from '@supabase/ssr';
import type { PipelineStage } from '@/types';

const VALID_STAGES: PipelineStage[] = [
  'NEW','CONTACTED','ASSIGNED_TECH','QUOTED','FOLLOW_UP',
  'WON','LOST_PRICE','GHOSTED','POSTPONED',
];

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { pipeline_stage?: PipelineStage; deal_value?: number | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { pipeline_stage, deal_value } = body;
  if (!pipeline_stage || !VALID_STAGES.includes(pipeline_stage)) {
    return NextResponse.json({ error: 'Invalid pipeline_stage' }, { status: 400 });
  }

  if (pipeline_stage === 'WON' && (deal_value === null || deal_value === undefined)) {
    return NextResponse.json(
      { error: 'deal_value is required when moving to WON' },
      { status: 400 }
    );
  }

  // Fetch current lead to merge stage_timestamps
  const { data: current, error: fetchErr } = await supabase
    .from('leads')
    .select('stage_timestamps, pipeline_stage')
    .eq('id', params.id)
    .single();

  if (fetchErr || !current) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  }

  const now = new Date().toISOString();
  const stage_timestamps = {
    ...((current.stage_timestamps as Record<string, string>) || {}),
    [pipeline_stage]: now,
  };

  const update: Record<string, unknown> = {
    pipeline_stage,
    stage_timestamps,
    updated_at: now,
  };
  if (pipeline_stage === 'WON') {
    update.deal_value = deal_value;
  }
  if (pipeline_stage === 'CONTACTED' || pipeline_stage === 'FOLLOW_UP') {
    update.last_contact_date = now;
  }
  // Backward compat: mirror into old status column
  update.status = legacyStatusFor(pipeline_stage);

  const { data, error } = await supabase
    .from('leads')
    .update(update)
    .eq('id', params.id)
    .select('id, pipeline_stage, deal_value, stage_timestamps, last_contact_date')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  return NextResponse.json(data);
}

function legacyStatusFor(stage: PipelineStage): string {
  switch (stage) {
    case 'NEW': return 'New';
    case 'CONTACTED': return 'Interested';
    case 'QUOTED': return 'Quote Sent';
    case 'WON': return 'Won';
    case 'LOST_PRICE': return 'Lost';
    default: return 'New';
  }
}
