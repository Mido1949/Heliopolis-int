'use client';

import Link from 'next/link';
import { ArrowLeft, ArrowRight } from 'lucide-react';

interface ModuleCardProps {
  title: string;
  titleAr: string;
  icon?: React.ReactNode;
  /** Small status pill in the card header (e.g. "FY25" or "This month"). */
  badge?: string;
  /** Deep link to the full module page — the "spoke" of the hub. */
  href?: string;
  linkLabel?: string;
  /** Grid span at lg and above. Mirrors the bento rhythm: 4 / 8 / 12 of 12. */
  span?: 'third' | 'half' | 'twoThirds' | 'full';
  rtl?: boolean;
  children: React.ReactNode;
}

const SPAN_CLASS: Record<NonNullable<ModuleCardProps['span']>, string> = {
  third: 'lg:col-span-4',
  half: 'lg:col-span-6',
  twoThirds: 'lg:col-span-8',
  full: 'lg:col-span-12',
};

export default function ModuleCard({
  title,
  titleAr,
  icon,
  badge,
  href,
  linkLabel = 'View full',
  span = 'third',
  rtl = false,
  children,
}: ModuleCardProps) {
  const Arrow = rtl ? ArrowLeft : ArrowRight;

  return (
    <section
      className={`${SPAN_CLASS[span]} col-span-1 flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md`}
    >
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {icon && <span className="text-[#0D2137] shrink-0">{icon}</span>}
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold text-[#0D2137]">{title}</h2>
            <p className="truncate text-[11px] text-slate-400">{titleAr}</p>
          </div>
        </div>
        {badge && (
          <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            {badge}
          </span>
        )}
      </header>

      <div className="flex-1">{children}</div>

      {href && (
        <Link
          href={href}
          className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[#1A6FD4] hover:underline"
        >
          {linkLabel}
          <Arrow className="h-3 w-3" />
        </Link>
      )}
    </section>
  );
}
