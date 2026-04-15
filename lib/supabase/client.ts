import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  const supabaseUrl = 'https://wrmqrvqixtrasajjfbge.supabase.co';
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createBrowserClient(
    supabaseUrl,
    supabaseKey,
    {
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) => {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
          return fetch(input, { ...init, signal: controller.signal })
            .finally(() => clearTimeout(timeoutId));
        }
      }
    }
  );
}
