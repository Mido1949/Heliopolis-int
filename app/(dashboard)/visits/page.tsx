'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { MapPin, Clock, Users, Loader2, ExternalLink } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/context/AuthContext';
import VisitCheckIn from '@/components/visits/VisitCheckIn';

interface VisitRow {
  id: string;
  lead_id: string | null;
  user_id: string;
  purpose: string | null;
  status: string;
  country: string;
  check_in_at: string;
  check_in_lat: number | null;
  check_in_lng: number | null;
  check_in_accuracy: number | null;
  check_out_at: string | null;
  notes: string | null;
  lead?: { name: string | null } | null;
  visitor?: { name: string | null } | null;
}

const supabase = createClient();

const LEADER_ROLES = ['admin', 'Manager', 'CS Team Leader', 'Tech Team Leader'];

function duration(from: string, to: string | null): string {
  if (!to) return '— شغالة';
  const mins = Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60000));
  if (mins < 60) return `${mins} دقيقة`;
  return `${Math.floor(mins / 60)}س ${mins % 60}د`;
}

function fmt(iso: string): string {
  return new Intl.DateTimeFormat('ar-EG', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Cairo',
  }).format(new Date(iso));
}

export default function VisitsPage() {
  const { profile } = useAuth();
  const isLeader = LEADER_ROLES.includes(profile?.role || '');

  const [rows, setRows] = useState<VisitRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    // RLS decides the rest: a rep sees their own rows, a leader their market's.
    const { data } = await supabase
      .from('field_visits')
      .select('*, lead:leads(name), visitor:profiles!field_visits_user_id_fkey(name)')
      .order('check_in_at', { ascending: false })
      .limit(100);
    setRows((data as VisitRow[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-5 pb-8">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-[#0D2137]">
          <MapPin className="h-5 w-5 text-[#D72B2B]" />
          الزيارات الميدانية
        </h1>
        <p className="mt-1 text-xs text-slate-500">
          سجّل دخولك وخروجك من موقع العميل — الموقع بيتسجل بالـ GPS وقت الضغط.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <VisitCheckIn onChange={load} />
        </div>

        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-[#0D2137]">
              {isLeader ? <Users className="h-4 w-4 text-slate-400" /> : <Clock className="h-4 w-4 text-slate-400" />}
              {isLeader ? 'زيارات الفريق' : 'زياراتي'}
            </h2>

            {loading ? (
              <div className="flex h-32 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-[#D72B2B]" />
              </div>
            ) : rows.length === 0 ? (
              <p className="py-10 text-center text-xs text-slate-400">مفيش زيارات مسجّلة لسه</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-right text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400">
                      <th className="pb-2 font-medium">الزيارة</th>
                      {isLeader && <th className="pb-2 font-medium">الموظف</th>}
                      <th className="pb-2 font-medium">البداية</th>
                      <th className="pb-2 font-medium">المدة</th>
                      <th className="pb-2 font-medium">السوق</th>
                      <th className="pb-2 font-medium">الموقع</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(v => (
                      <tr key={v.id} className="border-b border-slate-50 last:border-0">
                        <td className="py-2.5">
                          {v.lead_id ? (
                            <Link href={`/my-leads?lead=${v.lead_id}`} className="font-semibold text-[#0D2137] hover:underline">
                              {v.lead?.name || v.purpose || 'زيارة'}
                            </Link>
                          ) : (
                            <span className="font-semibold text-[#0D2137]">{v.purpose || 'زيارة'}</span>
                          )}
                          {v.notes && <span className="block text-[11px] text-slate-400">{v.notes}</span>}
                        </td>
                        {isLeader && <td className="py-2.5 text-slate-600">{v.visitor?.name || '—'}</td>}
                        <td className="py-2.5 text-slate-500">{fmt(v.check_in_at)}</td>
                        <td className="py-2.5 font-semibold text-slate-700">
                          {duration(v.check_in_at, v.check_out_at)}
                        </td>
                        <td className="py-2.5">
                          <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                            v.country === 'SA' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'
                          }`}>
                            {v.country === 'SA' ? 'السعودية' : 'مصر'}
                          </span>
                        </td>
                        <td className="py-2.5">
                          {v.check_in_lat != null && v.check_in_lng != null ? (
                            <a
                              href={`https://maps.google.com/?q=${v.check_in_lat},${v.check_in_lng}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[#D72B2B] hover:underline"
                            >
                              خريطة <ExternalLink className="h-3 w-3" />
                              {v.check_in_accuracy != null && (
                                <span className="text-slate-400">±{Math.round(v.check_in_accuracy)}م</span>
                              )}
                            </a>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
