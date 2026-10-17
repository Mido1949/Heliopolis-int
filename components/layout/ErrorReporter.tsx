'use client';

import { useEffect } from 'react';
import { message } from 'antd';
import { createClient } from '@/lib/supabase/client';

const MAX_PER_PAGE_LOAD = 30;

/**
 * Records what went wrong for whoever is signed in, into app_errors, so a
 * rep's errors can be read later instead of remembered. Captures the red
 * toast the rep saw (antd message.error), the detailed console.error our
 * handlers log next to it, and uncaught errors. Reporting never throws.
 */
export default function ErrorReporter() {
  useEffect(() => {
    const supabase = createClient();
    let sent = 0;
    const recent = new Map<string, number>();

    const report = (kind: string, text: string, detail?: unknown) => {
      const msg = text.slice(0, 1000);
      const now = Date.now();
      // Same message twice within 10s is one error, not two.
      if (sent >= MAX_PER_PAGE_LOAD || now - (recent.get(msg) ?? 0) < 10_000) return;
      recent.set(msg, now);
      sent++;
      void supabase
        .from('app_errors')
        .insert({ kind, message: msg, detail: serialize(detail), path: window.location.pathname })
        .then(() => undefined, () => undefined);
    };

    const origConsoleError = console.error;
    console.error = (...args: unknown[]) => {
      origConsoleError(...args);
      try {
        report('console', args.map((a) => (typeof a === 'string' ? a : a instanceof Error ? a.message : '')).join(' ').trim() || 'console.error', args);
      } catch {}
    };

    const origToast = message.error;
    message.error = ((content: Parameters<typeof message.error>[0], ...rest: unknown[]) => {
      try {
        const text = typeof content === 'string' ? content : typeof (content as { content?: unknown })?.content === 'string' ? (content as { content: string }).content : 'toast';
        report('toast', text);
      } catch {}
      return (origToast as (...a: unknown[]) => ReturnType<typeof message.error>)(content, ...rest);
    }) as typeof message.error;

    const onError = (e: ErrorEvent) => report('uncaught', e.message, { src: e.filename, line: e.lineno, stack: e.error?.stack });
    const onRejection = (e: PromiseRejectionEvent) =>
      report('promise', e.reason instanceof Error ? e.reason.message : String(e.reason), e.reason);
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);

    return () => {
      console.error = origConsoleError;
      message.error = origToast;
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}

// Supabase errors are plain objects ({code, message, details, hint}); Errors
// lose their fields under JSON.stringify, so copy them out.
function serialize(v: unknown): unknown {
  try {
    return JSON.parse(
      JSON.stringify(v, (_k, x) => (x instanceof Error ? { name: x.name, message: x.message, stack: x.stack?.slice(0, 2000) } : x)),
    );
  } catch {
    return null;
  }
}
