'use client';

import Link from 'next/link';
import { LEAD_SOURCES } from '@/lib/constants';
import type { RecentLead } from '../useCommandCenterData';

interface RecentLeadsCardProps {
  leads: RecentLead[];
  lang: 'ar' | 'en';
}

function sourceColor(source: string): string {
  return LEAD_SOURCES.find(s => s.value === source)?.color ?? '#64748B';
}

export default function RecentLeadsCard({ leads, lang }: RecentLeadsCardProps) {
  if (leads.length === 0) {
    return (
      <p className="py-8 text-center text-xs text-slate-400">
        {lang === 'ar' ? 'لا يوجد عملاء بعد' : 'No leads yet'}
      </p>
    );
  }

  return (
    <ul className="space-y-2.5">
      {leads.map(lead => (
        <li key={lead.id}>
          <Link
            href="/crm"
            className="group flex items-center gap-3 rounded-xl border border-slate-100 p-2.5 transition-colors hover:bg-slate-50"
          >
            <span
              className="h-8 w-1 shrink-0 rounded-full"
              style={{ backgroundColor: sourceColor(lead.source) }}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-[#0D2137] group-hover:underline">
                {lead.name}
              </p>
              <p className="truncate text-[10px] text-slate-400">
                {lead.source} ·{' '}
                {new Date(lead.createdAt).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-EG', {
                  day: 'numeric',
                  month: 'short',
                })}
              </p>
            </div>
            <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
              {lead.status}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
