'use client';

import type { MetricRow } from '../useCommandCenterData';

interface MetricTableProps {
  rows: MetricRow[];
  lang: 'ar' | 'en';
}

function deltaTone(delta: number, invert?: boolean): string {
  const good = invert ? delta < 0 : delta > 0;
  if (delta === 0) return 'text-slate-400';
  return good ? 'text-emerald-600' : 'text-red-500';
}

/** The P&L-style read: label on one side, value and month-over-month delta on the other. */
export default function MetricTable({ rows, lang }: MetricTableProps) {
  return (
    <dl className="divide-y divide-slate-100">
      {rows.map(row => (
        <div key={row.label} className="flex items-center justify-between gap-3 py-2">
          <dt className="min-w-0 truncate text-xs text-slate-500">
            {lang === 'ar' ? row.labelAr : row.label}
          </dt>
          <dd className="flex shrink-0 items-baseline gap-2">
            <span className="text-sm font-bold text-[#0D2137]">{row.value}</span>
            {row.delta !== null && (
              <span className={`text-[11px] font-semibold ${deltaTone(row.delta, row.invertDelta)}`}>
                {row.delta > 0 ? '+' : ''}
                {row.delta}%
              </span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
