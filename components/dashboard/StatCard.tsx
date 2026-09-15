'use client';

import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import Sparkline from './Sparkline';

export type StatTone = 'violet' | 'green' | 'amber' | 'blue';

const TONES: Record<StatTone, { surface: string; chip: string; label: string; line: string }> = {
  violet: { surface: 'bg-[#F4F1FE]', chip: 'bg-[#7C5CFC]', label: 'text-[#6D4AFF]', line: '#7C5CFC' },
  green:  { surface: 'bg-[#E9F9EF]', chip: 'bg-[#16A34A]', label: 'text-[#15803D]', line: '#16A34A' },
  amber:  { surface: 'bg-[#FFF4E6]', chip: 'bg-[#F59E0B]', label: 'text-[#C2710A]', line: '#F59E0B' },
  blue:   { surface: 'bg-[#EAF2FE]', chip: 'bg-[#2563EB]', label: 'text-[#1D4ED8]', line: '#2563EB' },
};

interface StatCardProps {
  tone: StatTone;
  icon: React.ReactNode;
  label: string;
  value: string;
  /** Percent change against the previous period. Omit to hide the delta row. */
  deltaPercent?: number | null;
  deltaCaption?: string;
  /** Oldest → newest trend. Mutually exclusive with `progress`. */
  trend?: number[];
  /** 0–100. Renders a progress bar in place of the trend line. */
  progress?: number | null;
  progressCaption?: string;
}

/**
 * One headline number in the welcome strip: tinted surface, solid icon chip,
 * then either a sparkline or a progress bar along the bottom.
 */
export default function StatCard({
  tone,
  icon,
  label,
  value,
  deltaPercent,
  deltaCaption,
  trend,
  progress,
  progressCaption,
}: StatCardProps) {
  const t = TONES[tone];
  const hasDelta = deltaPercent !== undefined && deltaPercent !== null && Number.isFinite(deltaPercent);
  const up = hasDelta && (deltaPercent as number) >= 0;

  return (
    <div className={`flex flex-col gap-3 rounded-2xl p-5 ${t.surface}`}>
      <div className={`flex h-11 w-11 items-center justify-center rounded-full text-white ${t.chip}`}>
        {icon}
      </div>

      <div>
        <p className={`text-sm font-semibold ${t.label}`}>{label}</p>
        <p className="mt-1 text-2xl font-extrabold tracking-tight text-[#0D2137]">{value}</p>
      </div>

      {hasDelta && (
        <p
          className={`flex items-center gap-1 text-xs font-semibold ${
            up ? 'text-emerald-600' : 'text-rose-600'
          }`}
        >
          {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
          {Math.abs(deltaPercent as number)}%
          {deltaCaption && <span className="font-medium text-slate-500">{deltaCaption}</span>}
        </p>
      )}

      {progress !== undefined && progress !== null ? (
        <div className="mt-auto">
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/70">
            <div
              className="h-full rounded-full transition-[width] duration-700"
              style={{ width: `${Math.max(0, Math.min(100, progress))}%`, backgroundColor: t.line }}
            />
          </div>
          {progressCaption && (
            <p className="mt-1.5 text-[11px] font-medium text-slate-500">{progressCaption}</p>
          )}
        </div>
      ) : (
        trend && trend.length > 1 && (
          <div className="mt-auto">
            <Sparkline points={trend} color={t.line} />
          </div>
        )
      )}
    </div>
  );
}
