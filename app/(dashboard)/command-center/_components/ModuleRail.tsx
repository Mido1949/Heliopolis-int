'use client';

import StatusRing from './StatusRing';

export interface RailSection {
  id: string;
  label: string;
  labelAr: string;
  icon: React.ReactNode;
}

interface ModuleRailProps {
  sections: RailSection[];
  activeId: string;
  onSelect: (id: string) => void;
  ring: { progress: number; caption: string };
  lang: 'ar' | 'en';
}

export default function ModuleRail({ sections, activeId, onSelect, ring, lang }: ModuleRailProps) {
  return (
    <nav
      aria-label={lang === 'ar' ? 'أقسام مركز القيادة' : 'Command center sections'}
      className="flex shrink-0 flex-row gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-sm lg:w-[190px] lg:flex-col lg:overflow-visible"
    >
      {sections.map(section => {
        const active = section.id === activeId;
        return (
          <button
            key={section.id}
            type="button"
            onClick={() => onSelect(section.id)}
            aria-current={active ? 'true' : undefined}
            className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-start text-xs font-semibold transition-colors lg:w-full ${
              active
                ? 'bg-[#0D2137] text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-[#0D2137]'
            }`}
          >
            <span className={active ? 'text-white' : 'text-slate-400'}>{section.icon}</span>
            <span className="whitespace-nowrap">
              {lang === 'ar' ? section.labelAr : section.label}
            </span>
          </button>
        );
      })}

      <div className="hidden border-t border-slate-100 pt-4 lg:mt-4 lg:block">
        <StatusRing
          progress={ring.progress}
          label={lang === 'ar' ? 'من الهدف' : 'of target'}
          caption={ring.caption}
        />
      </div>
    </nav>
  );
}
