'use client';

import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import type { ListItem } from '../useCommandCenterData';

interface SignalListProps {
  items: ListItem[];
  emptyLabel: string;
}

const TONE = {
  good: { icon: CheckCircle2, color: 'text-emerald-600' },
  warn: { icon: Info, color: 'text-amber-500' },
  bad: { icon: AlertTriangle, color: 'text-red-500' },
} as const;

export default function SignalList({ items, emptyLabel }: SignalListProps) {
  if (items.length === 0) {
    return <p className="py-8 text-center text-xs text-slate-400">{emptyLabel}</p>;
  }

  return (
    <ul className="space-y-3">
      {items.map(item => {
        const { icon: Icon, color } = TONE[item.tone];
        return (
          <li key={item.id}>
            <Link href={item.href} className="group flex items-start gap-2">
              <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${color}`} />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#0D2137] group-hover:underline">
                  {item.title}
                </p>
                <p className="text-[11px] leading-snug text-slate-500">{item.detail}</p>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
