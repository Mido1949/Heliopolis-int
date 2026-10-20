'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

const REFRESH_LEAD_MS = 5 * 60 * 1000;  // refresh 5 min before expiry

export function useSessionManager(userId: string | null, orgId: string | null = null) {
  const supabase = createClient();
  const logIdRef = useRef<string | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Session timer ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId || !orgId) return;

    let logId: string | null = null;

    const startSession = async () => {
      const { data, error } = await supabase
        .from('time_logs')
        .insert({
          user_id: userId,
          org_id: orgId,
          task_type: 'Other',
          description: 'Auto Session',
          duration_seconds: 0,
          started_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (!error && data) {
        logId = data.id;
        logIdRef.current = data.id;
      }
    };

    const endSession = async () => {
      if (!logIdRef.current) return;

      const { data: row } = await supabase
        .from('time_logs')
        .select('started_at')
        .eq('id', logIdRef.current)
        .single();

      const durationSeconds = row
        ? Math.floor((Date.now() - new Date(row.started_at).getTime()) / 1000)
        : 0;

      await supabase
        .from('time_logs')
        .update({
          ended_at: new Date().toISOString(),
          duration_seconds: durationSeconds,
        })
        .eq('id', logIdRef.current);
    };

    startSession();

    const handleUnload = () => {
      endSession();
    };

    window.addEventListener('beforeunload', handleUnload);

    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      endSession();
    };
  }, [userId, supabase]);

  // ── Proactive token refresh (T033) ────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;

    const scheduleRefresh = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const expiresAt = data.session?.expires_at;
        if (!expiresAt) return;

        const msUntilRefresh = expiresAt * 1000 - Date.now() - REFRESH_LEAD_MS;
        const delay = Math.max(msUntilRefresh, 30_000); // floor at 30s

        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = setTimeout(async () => {
          await supabase.auth.refreshSession();
          scheduleRefresh();
        }, delay);
      } catch (err) {
        console.error('Proactive refresh failed:', err);
      }
    };

    scheduleRefresh();

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [userId, supabase]);

  // No idle logout: the team asked to stay signed in until they press Logout
  // (2026-10-20). Sessions still end on explicit sign-out.
}