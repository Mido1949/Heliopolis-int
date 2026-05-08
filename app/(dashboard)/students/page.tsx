export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import StudentsClient from './_components/StudentsClient';

export default async function StudentsPage() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  const { data: students } = await supabase
    .from('students')
    .select('*')
    .order('created_at', { ascending: false });

  return <StudentsClient initialStudents={students ?? []} />;
}