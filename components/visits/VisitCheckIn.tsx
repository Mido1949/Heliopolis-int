'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, LogIn, LogOut, MapPin, AlertTriangle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useGeolocation, geoErrorMessage } from './useGeolocation';

interface OpenVisit {
  id: string;
  lead_id: string | null;
  check_in_at: string;
  check_in_lat: number | null;
  check_in_lng: number | null;
  check_in_accuracy: number | null;
}

interface VisitCheckInProps {
  /** Lead being visited. Null records a visit not tied to a CRM record. */
  leadId?: string | null;
  leadName?: string | null;
  onChange?: () => void;
}

const supabase = createClient();

function since(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} دقيقة`;
  const h = Math.floor(mins / 60);
  return `${h} ساعة و ${mins % 60} دقيقة`;
}

/**
 * GPS check-in / check-out for a site visit.
 *
 * A visit is only worth recording if it carries a position, so check-in
 * refuses to write a row without a fix rather than silently logging a visit
 * with null coordinates. Check-out is the opposite: the visit already
 * happened, so a failed fix still closes it.
 */
export default function VisitCheckIn({ leadId, leadName, onChange }: VisitCheckInProps) {
  const { user } = useAuth();
  const { locate, locating } = useGeolocation();

  const [open, setOpen] = useState<OpenVisit | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  const refresh = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from('field_visits')
      .select('id, lead_id, check_in_at, check_in_lat, check_in_lng, check_in_accuracy')
      .eq('user_id', user.id)
      .eq('status', 'in_progress')
      .maybeSingle();
    setOpen((data as OpenVisit) || null);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { void refresh(); }, [refresh]);

  const checkIn = useCallback(async () => {
    if (!user?.id) return;
    setBusy(true);
    setError(null);

    const res = await locate();
    if ('error' in res) {
      setError(geoErrorMessage(res.error));
      setBusy(false);
      return;
    }

    const { error: insErr } = await supabase.from('field_visits').insert({
      user_id: user.id,
      lead_id: leadId ?? null,
      purpose: leadName ? `زيارة ${leadName}` : 'زيارة ميدانية',
      check_in_lat: res.fix.lat,
      check_in_lng: res.fix.lng,
      check_in_accuracy: res.fix.accuracy,
    });

    if (insErr) {
      // The partial unique index is what enforces one open visit per person.
      setError(
        insErr.code === '23505'
          ? 'عندك زيارة مفتوحة بالفعل — اقفلها الأول.'
          : insErr.message,
      );
    } else {
      setNotes('');
      await refresh();
      onChange?.();
    }
    setBusy(false);
  }, [user?.id, leadId, leadName, locate, refresh, onChange]);

  const checkOut = useCallback(async () => {
    if (!open) return;
    setBusy(true);
    setError(null);

    const res = await locate();
    const fix = 'fix' in res ? res.fix : null;

    const { error: updErr } = await supabase
      .from('field_visits')
      .update({
        status: 'completed',
        check_out_at: new Date().toISOString(),
        check_out_lat: fix?.lat ?? null,
        check_out_lng: fix?.lng ?? null,
        notes: notes.trim() || null,
      })
      .eq('id', open.id);

    if (updErr) setError(updErr.message);
    else {
      setNotes('');
      await refresh();
      onChange?.();
    }
    setBusy(false);
  }, [open, notes, locate, refresh, onChange]);

  if (loading) return <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />;

  const working = busy || locating;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-[#0D2137]">
        <MapPin className="h-4 w-4 text-[#D72B2B]" />
        الزيارات الميدانية
      </h3>

      {open ? (
        <div className="space-y-3">
          <div className="rounded-xl bg-emerald-50 px-3 py-2.5">
            <p className="text-xs font-semibold text-emerald-800">
              زيارة شغالة من {since(open.check_in_at)}
            </p>
            {open.check_in_lat != null && open.check_in_lng != null && (
              <a
                href={`https://maps.google.com/?q=${open.check_in_lat},${open.check_in_lng}`}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block text-[11px] text-emerald-700 underline"
              >
                مكان الدخول على الخريطة
                {open.check_in_accuracy != null && ` (دقة ±${Math.round(open.check_in_accuracy)}م)`}
              </a>
            )}
          </div>

          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            placeholder="نتيجة الزيارة (اختياري)"
            className="w-full resize-none rounded-lg border border-slate-200 p-2 text-xs focus:border-slate-400 focus:outline-none"
          />

          <button
            onClick={checkOut}
            disabled={working}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0D2137] px-4 py-2.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
            {locating ? 'بيحدد الموقع…' : 'إنهاء الزيارة'}
          </button>
        </div>
      ) : (
        <button
          onClick={checkIn}
          disabled={working}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#D72B2B] px-4 py-2.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
        >
          {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
          {locating ? 'بيحدد الموقع…' : 'ابدأ زيارة (تسجيل الموقع)'}
        </button>
      )}

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 p-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <p className="text-[11px] leading-relaxed text-amber-900">{error}</p>
        </div>
      )}
    </div>
  );
}
