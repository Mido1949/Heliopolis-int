'use client';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
export function useIdleLogout(timeoutMs = 20 * 60 * 1000) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const supabase = createClient();
    const logout = async () => { try { await supabase.auth.signOut(); } catch {} router.push('/login'); router.refresh(); };
    const reset = () => { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(logout, timeoutMs); };
    const events = ['mousemove','mousedown','keydown','scroll','touchstart','click'];
    events.forEach(e => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => { if (timer.current) clearTimeout(timer.current); events.forEach(e => window.removeEventListener(e, reset)); };
  }, [router, timeoutMs]);
}
