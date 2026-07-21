import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

// Every call used to mint a fresh GoTrueClient against the same localStorage
// session key. Dozens of call sites call this in component render bodies
// (not useRef/useMemo), so re-renders at boot produced many concurrent
// GoTrueClient instances racing for the same auth-storage lock — a race that
// can deadlock (never resolves, never rejects) instead of just being slow.
// A module-level singleton means one GoTrueClient per tab, no contention.
let client: SupabaseClient | undefined;

export function createClient() {
  if (client) return client;

  const supabaseUrl = 'https://wrmqrvqixtrasajjfbge.supabase.co';
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  client = createBrowserClient(
    supabaseUrl,
    supabaseKey
  );
  return client;
}
