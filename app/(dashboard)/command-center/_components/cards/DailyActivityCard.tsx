'use client';

import { ClipboardList, FileText, Phone, Users } from 'lucide-react';
import type { ActivityRow } from '../useCommandCenterData';

interface DailyActivityCardProps {
  rows: ActivityRow[];
  lang: 'ar' | 'en';
}

// Ported from the old /dashboard daily report — same thresholds, same colours.
function progressBar(pct: number) {
  if (pct >= 80) return 'bg-emerald-500';
  if (pct >= 50) return 'bg-amber-400';
  return 'bg-red-500';
}

function progressText(pct: number) {
  if (pct >= 80) return 'text-emerald-600';
  if (pct >= 50) return 'text-amber-500';
  return 'text-red-500';
}

function progressLabel(pct: number, lang: 'ar' | 'en') {
  if (pct >= 80) return lang === 'ar' ? 'على المسار' : 'On track';
  if (pct >= 50) return lang === 'ar' ? 'متوسط' : 'Mid';
  return lang === 'ar' ? 'يحتاج متابعة' : 'Needs attention';
}

export default function DailyActivityCard({ rows, lang }: DailyActivityCardProps) {
  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-xs text-slate-400">
        {lang === 'ar' ? 'لا يوجد نشاط مسجل اليوم' : 'No activity recorded today'}
      </p>
    );
  }

  const withTargets = rows.filter(r => r.target !== null && r.target > 0);

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-2.5 text-start text-[11px] font-bold text-slate-500">
                {lang === 'ar' ? 'الموظف' : 'Member'}
              </th>
              <th className="px-3 py-2.5 text-center text-[11px] font-bold text-blue-600">
                <div className="flex flex-col items-center gap-0.5">
                  <Users className="h-3.5 w-3.5" />
                  <span>{lang === 'ar' ? 'ليدز' : 'Leads'}</span>
                </div>
              </th>
              <th className="px-3 py-2.5 text-center text-[11px] font-bold text-amber-600">
                <div className="flex flex-col items-center gap-0.5">
                  <ClipboardList className="h-3.5 w-3.5" />
                  <span>{lang === 'ar' ? 'تحديثات' : 'Updates'}</span>
                </div>
              </th>
              <th className="px-3 py-2.5 text-center text-[11px] font-bold text-green-600">
                <div className="flex flex-col items-center gap-0.5">
                  <Phone className="h-3.5 w-3.5" />
                  <span>{lang === 'ar' ? 'مكالمات' : 'Calls'}</span>
                </div>
              </th>
              <th className="px-3 py-2.5 text-center text-[11px] font-bold text-purple-600">
                <div className="flex flex-col items-center gap-0.5">
                  <FileText className="h-3.5 w-3.5" />
                  <span>BOQs</span>
                </div>
              </th>
              <th className="px-3 py-2.5 text-center text-[11px] font-bold text-slate-600">
                {lang === 'ar' ? 'الإجمالي' : 'Total'}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map(row => (
              <tr key={row.userId} className="transition-colors hover:bg-slate-50/60">
                <td className="px-4 py-2.5">
                  <p className="font-semibold text-[#0D2137]">{row.userName}</p>
                  <span className="text-[10px] text-slate-400">{row.userRole}</span>
                </td>
                <td className="px-3 py-2.5 text-center">
                  <span
                    className={`text-base font-black ${row.leadsCreated > 0 ? 'text-blue-600' : 'text-slate-200'}`}
                  >
                    {row.leadsCreated}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-center">
                  <span
                    className={`text-base font-black ${row.updatesDone > 0 ? 'text-amber-500' : 'text-slate-200'}`}
                  >
                    {row.updatesDone}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-center">
                  <span
                    className={`text-base font-black ${row.callsMade > 0 ? 'text-green-600' : 'text-slate-200'}`}
                  >
                    {row.callsMade}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-center">
                  <span
                    className={`text-base font-black ${row.boqsCreated > 0 ? 'text-purple-600' : 'text-slate-200'}`}
                  >
                    {row.boqsCreated}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-center">
                  <span
                    className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-sm font-black ${
                      row.total === 0
                        ? 'bg-slate-100 text-slate-400'
                        : row.total >= 10
                          ? 'bg-green-100 text-green-700'
                          : 'bg-amber-50 text-amber-700'
                    }`}
                  >
                    {row.total}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {withTargets.length > 0 && (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <p className="mb-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            {lang === 'ar' ? 'التقدم نحو هدف الشهر' : 'Progress to monthly target'}
          </p>
          <div className="space-y-4">
            {withTargets.map(row => {
              const capped = Math.min(row.progress, 100);
              return (
                <div key={row.userId}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-sm font-semibold text-[#0D2137]">{row.userName}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-500">
                        {row.actual} / {row.target} {lang === 'ar' ? 'ليد' : 'leads'}
                      </span>
                      <span className={`text-xs font-bold ${progressText(row.progress)}`}>
                        {capped}%
                      </span>
                    </div>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-3 rounded-full transition-all duration-700 ${progressBar(row.progress)}`}
                      style={{ width: `${capped}%` }}
                    />
                  </div>
                  <div className="mt-0.5 flex justify-end">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wide ${progressText(row.progress)}`}
                    >
                      {progressLabel(row.progress, lang)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
