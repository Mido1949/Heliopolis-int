'use client';

import type { TeamMember } from '../useCommandCenterData';

interface TeamMapCardProps {
  team: TeamMember[];
  lang: 'ar' | 'en';
}

/** Quadrant scatter: activity today (x) against output today (y). */
export default function TeamMapCard({ team, lang }: TeamMapCardProps) {
  if (team.length === 0) {
    return (
      <p className="py-8 text-center text-xs text-slate-400">
        {lang === 'ar' ? 'لا يوجد نشاط مسجل اليوم' : 'No activity recorded today'}
      </p>
    );
  }

  const maxActivity = Math.max(...team.map(m => m.activity), 1);
  const maxOutput = Math.max(...team.map(m => m.output), 1);

  return (
    <div>
      <div className="relative h-[160px] rounded-xl border border-slate-100 bg-slate-50/60">
        {/* Quadrant guides */}
        <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-slate-200" />
        <div className="absolute inset-y-0 left-1/2 border-l border-dashed border-slate-200" />

        {team.map(member => {
          const x = 6 + (member.activity / maxActivity) * 82;
          const y = 6 + (member.output / maxOutput) * 78;
          // Points past the midline label to their left, so a long name never
          // runs off the card at narrow widths.
          const labelBefore = x > 55;
          return (
            <div
              key={member.id}
              title={`${member.name} — ${member.activity} touches, ${member.output} BOQs`}
              className={`absolute flex -translate-x-1/2 translate-y-1/2 items-center gap-1 ${
                labelBefore ? 'flex-row-reverse' : ''
              }`}
              style={{ left: `${x}%`, bottom: `${y}%` }}
            >
              <span
                className={`h-2.5 w-2.5 rounded-full ring-2 ring-white ${
                  member.isTop ? 'bg-[#1D4ED8]' : 'bg-slate-400'
                }`}
              />
              <span
                className={`max-w-[84px] truncate text-[10px] font-medium ${
                  member.isTop ? 'text-[#1D4ED8]' : 'text-slate-500'
                }`}
              >
                {member.name}
              </span>
            </div>
          );
        })}

        <span className="absolute bottom-1 right-2 text-[9px] font-medium text-slate-400">
          {lang === 'ar' ? 'النشاط' : 'Activity →'}
        </span>
        <span className="absolute left-2 top-1 text-[9px] font-medium text-slate-400">
          {lang === 'ar' ? '↑ المخرجات' : '↑ Output'}
        </span>
      </div>

      <p className="mt-3 text-[11px] text-slate-400">
        {lang === 'ar'
          ? 'نشاط اليوم (عملاء + تحديثات + مكالمات) مقابل عروض الأسعار المنشأة'
          : "Today's touches (leads + updates + calls) against BOQs created"}
      </p>
    </div>
  );
}
