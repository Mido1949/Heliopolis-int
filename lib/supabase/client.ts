import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

// Every call used to mint a fresh GoTrueClient against the same localStorage
// session key. Dozens of call sites call this in component render bodies
// (not useRef/useMemo), so re-renders at boot produced many concurrent
// GoTrueClient instances racing for the same auth-storage lock — a race that
// can deadlock (never resolves, never rejects) instead of just being slow.
// A module-level singleton means one GoTrueClient per tab, no contention.
let client: SupabaseClient | undefined;

const SUPABASE_URL = 'https://wrmqrvqixtrasajjfbge.supabase.co';

/**
 * Stand-in returned only while prerendering without a configured key.
 *
 * `next build` renders every client component once on the server. AuthProvider
 * sits in the root layout and calls createClient() in its render body, so a
 * build environment that has no NEXT_PUBLIC_SUPABASE_ANON_KEY — Vercel Preview,
 * where the var is set for Production only — threw here and failed the export
 * of every statically generated page (/login, /crm, /dashboard, /privacy, /,
 * /_not-found, …). Nothing queries Supabase during prerender: every call lives
 * in an effect or an event handler, neither of which runs there. So hand back a
 * stub that constructs fine and throws only if something actually uses it,
 * which would surface as a build failure naming this cause rather than a
 * silently broken page.
 */
function prerenderStub(): SupabaseClient {
  const fail = (): never => {
    throw new Error(
      'Supabase client was used during prerender, but NEXT_PUBLIC_SUPABASE_ANON_KEY ' +
        'is not set for this build environment. Set it on the Vercel project for ' +
        'every environment that builds the app (Production, Preview, Development).'
    );
  };
  return new Proxy({} as SupabaseClient, { get: fail, apply: fail });
}

export function createClient() {
  if (client) return client;

  const supabaseUrl = SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Server-side and unconfigured means we are inside `next build`'s prerender
  // pass — the browser always has the key inlined at build time. Don't cache
  // the stub, so a real client is still created once this runs in a browser.
  if (!supabaseKey) {
    if (typeof window === 'undefined') return prerenderStub();
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_ANON_KEY is missing — the app cannot reach Supabase.'
    );
  }

  client = createBrowserClient(
    supabaseUrl,
    supabaseKey
  );
  return client;
}
