export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import CoursesClient from './_components/CoursesClient';

export default async function CoursesPage() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  const { data: courses } = await supabase
    .from('courses')
    .select('*')
    .order('start_date', { ascending: true });

  return <CoursesClient initialCourses={courses ?? []} />;
}