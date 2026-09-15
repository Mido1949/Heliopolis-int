'use client';

import Link from 'next/link';
import type { CommandCenterData } from '../useCommandCenterData';

interface OperationsCardProps {
  ops: CommandCenterData['ops'];
  lang: 'ar' | 'en';
}

export default function OperationsCard({ ops, lang }: OperationsCardProps) {
  const tiles = [
    {
      href: '/calls',
      label: lang === 'ar' ? 'مكالمات اليوم' : 'Calls today',
      value: `${ops.callsToday}`,
      note: lang === 'ar' ? `${ops.answeredToday} تم الرد` : `${ops.answeredToday} answered`,
      alert: false,
    },
    {
      href: '/tasks',
      label: lang === 'ar' ? 'مهام مفتوحة' : 'Open tasks',
      value: `${ops.tasksOpen}`,
      note: lang === 'ar' ? `${ops.tasksOverdue} متأخرة` : `${ops.tasksOverdue} overdue`,
      alert: ops.tasksOverdue > 0,
    },
    {
      href: '/scraper',
      label: lang === 'ar' ? 'قائمة الاستخراج' : 'Scrape queue',
      value: `${ops.scrapeQueued}`,
      note: lang === 'ar' ? `${ops.scrapeFailed} فشلت` : `${ops.scrapeFailed} failed`,
      alert: ops.scrapeFailed > 0,
    },
    {
      href: '/helio',
      label: lang === 'ar' ? 'إجراءات هيليو (٧ أيام)' : 'Helio actions (7d)',
      value: `${ops.agentActions7d}`,
      note:
        lang === 'ar'
          ? `${ops.agentActionsUndone7d} تم التراجع عنها`
          : `${ops.agentActionsUndone7d} undone`,
      alert: ops.agentActionsUndone7d > 0,
    },
    {
      href: '/inventory',
      label: lang === 'ar' ? 'مخزون منخفض' : 'Low stock',
      value: `${ops.lowStock.length}`,
      note:
        ops.lowStock.length > 0
          ? ops.lowStock.map(p => p.name).join(', ')
          : lang === 'ar'
            ? 'كل الأصناف متوفرة'
            : 'All items stocked',
      alert: ops.lowStock.length > 0,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {tiles.map(tile => (
        <Link
          key={tile.href}
          href={tile.href}
          className={`rounded-xl border p-3 transition-colors ${
            tile.alert
              ? 'border-amber-200 bg-amber-50/60 hover:bg-amber-50'
              : 'border-slate-100 bg-slate-50/60 hover:bg-slate-100'
          }`}
        >
          <p className="truncate text-[10px] font-medium text-slate-500">{tile.label}</p>
          <p className="mt-1 text-xl font-extrabold text-[#0D2137]">{tile.value}</p>
          <p className="truncate text-[10px] text-slate-400" title={tile.note}>
            {tile.note}
          </p>
        </Link>
      ))}
    </div>
  );
}
