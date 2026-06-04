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

  const wfRes = await fetch(`${n8nBase}/workflows?limit=100`, { headers }).catch(() => null);
  if (!wfRes?.ok) return NextResponse.json({ workflows: [] });

  const wfData = await wfRes.json();
  const allWorkflows: N8nWorkflow[] = wfData.data ?? [];

  const orgWorkflows = allWorkflows.filter(wf =>
    wf.tags?.some(t => t.name.toLowerCase() === orgSlug.toLowerCase())
  );

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