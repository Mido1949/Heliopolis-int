'use client';

import type { CommandCenterData } from '../useCommandCenterData';

interface TopPerformersCardProps {
  performers: CommandCenterData['performers'];
  lang: 'ar' | 'en';
}

export default function TopPerformersCard({ performers, lang }: TopPerformersCardProps) {
  if (performers.length === 0) {
    return (
      <p className="py-8 text-center text-xs text-slate-400">
        {lang === 'ar' ? 'لا يوجد أعضاء فريق بعد' : 'No team members yet'}
      </p>
    );
  }

  return (
    <ol className="space-y-2.5">
      {performers.map((person, i) => (
        <li key={person.id} className="flex items-center gap-3">
          <span
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
              i === 0 ? 'bg-[#0D2137] text-white' : 'bg-slate-100 text-slate-500'
            }`}
          >
            {i + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-[#0D2137]">{person.name}</p>
            <p className="truncate text-[10px] text-slate-400">
              {person.role} · {person.note}
            </p>
          </div>
          <span className="shrink-0 text-xs font-bold text-slate-500">{person.score}</span>
        </li>
      ))}
    </ol>
  );
}
