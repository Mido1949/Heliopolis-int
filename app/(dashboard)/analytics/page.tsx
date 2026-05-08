export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import AnalyticsClient from './_components/AnalyticsClient';

export default async function AnalyticsPage() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  );

  const { data: leadsByStatus } = await supabase
    .from('leads')
    .select('status')
    .then(({ data }) => {
      const counts: Record<string, number> = {};
      (data ?? []).forEach(l => { counts[l.status ?? 'unknown'] = (counts[l.status ?? 'unknown'] ?? 0) + 1; });
      return { data: counts };
    });

  return <AnalyticsClient leadsByStatus={leadsByStatus ?? {}} />;
}