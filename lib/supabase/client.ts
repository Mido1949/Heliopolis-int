import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  const supabaseUrl = 'https://wrmqrvqixtrasajjfbge.supabase.co';
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createBrowserClient(
    supabaseUrl,
    supabaseKey
  );
}
