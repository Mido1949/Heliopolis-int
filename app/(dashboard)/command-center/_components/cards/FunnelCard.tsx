'use client';

import type { CommandCenterData } from '../useCommandCenterData';

interface FunnelCardProps {
  funnel: CommandCenterData['funnel'];
  lang: 'ar' | 'en';
}

const SHADES = ['#DBEAFE', '#93C5FD', '#3B82F6', '#1D4ED8'];

/** Concentric rings — the pipeline's answer to a TAM/SAM/SOM bubble. */
export default function FunnelCard({ funnel, lang }: FunnelCardProps) {
  const max = Math.max(...funnel.map(f => f.count), 1);
  const headline = funnel[0];

  return (
    <div>
      <p className="text-2xl font-extrabold text-[#1D4ED8]">{headline.count.toLocaleString('en-US')}</p>
      <p className="mb-3 text-[11px] text-slate-400">
        {lang === 'ar' ? headline.labelAr : headline.label}
      </p>

      <div className="flex items-center gap-4">
        <div className="relative h-[104px] w-[104px] shrink-0">
          {funnel.map((stage, i) => {
            const ratio = Math.sqrt(stage.count / max);
            const size = Math.max(22, Math.round(104 * ratio));
            return (
              <div
                key={stage.label}
                title={`${stage.label}: ${stage.count}`}
                className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full"
                style={{ width: size, height: size, backgroundColor: SHADES[i] ?? SHADES[3] }}
              />
            );
          })}
        </div>

        <ul className="min-w-0 flex-1 space-y-1.5">
          {funnel.map((stage, i) => (
            <li key={stage.label} className="flex items-center gap-2 text-[11px]">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: SHADES[i] ?? SHADES[3] }}
              />
              <span className="min-w-0 flex-1 truncate text-slate-500">
                {lang === 'ar' ? stage.labelAr : stage.label}
              </span>
              <span className="shrink-0 font-bold text-[#0D2137]">{stage.count}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
