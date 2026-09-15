'use client';

import Link from 'next/link';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { CommandCenterData } from '../useCommandCenterData';

interface DecisionMemoCardProps {
  memo: CommandCenterData['memo'];
  lang: 'ar' | 'en';
  rtl: boolean;
}

export default function DecisionMemoCard({ memo, lang, rtl }: DecisionMemoCardProps) {
  const Arrow = rtl ? ArrowLeft : ArrowRight;

  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-[#D72B2B]">
        {lang === 'ar' ? 'التوصية' : 'Recommendation'}
      </p>
      <p className="mt-1 text-sm font-bold leading-snug text-[#0D2137]">{memo.recommendation}</p>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{memo.rationale}</p>
      <Link
        href={memo.href}
        className="mt-3 inline-flex items-center gap-1 rounded-lg bg-[#0D2137] px-3 py-1.5 text-[11px] font-semibold text-white hover:opacity-90"
      >
        {memo.cta}
        <Arrow className="h-3 w-3" />
      </Link>
    </div>
  );
}
