/* eslint-disable @next/next/no-img-element */
'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard,
  Users,
  FileText,
  Mail,
  Database,
  Clock,
  Search,
  Bot,
  LogOut,
  Phone,
  BarChart2,
  Building2,
  CheckSquare,
  Wrench,
  Brain,
  Gauge,
  MapPin,
} from 'lucide-react';
import { NAV_ITEMS } from '@/lib/constants';
import { getInitials } from '@/lib/utils';
import { useOrg } from '@/context/OrgContext';
import { useRailConfig } from '@/context/RailContext';
import StatusRing from './StatusRing';
import type { Profile } from '@/types';

const ICON_MAP: Record<string, React.ReactNode> = {
  dashboard: <LayoutDashboard className="h-4 w-4" />,
  gauge: <Gauge className="h-4 w-4" />,
  hub: <Building2 className="h-4 w-4" />,
  contacts: <Users className="h-4 w-4" />,
  fileText: <FileText className="h-4 w-4" />,
  mail: <Mail className="h-4 w-4" />,
  database: <Database className="h-4 w-4" />,
  clock: <Clock className="h-4 w-4" />,
  search: <Search className="h-4 w-4" />,
  robot: <Bot className="h-4 w-4" />,
  phone: <Phone className="h-4 w-4" />,
  barChart: <BarChart2 className="h-4 w-4" />,
  tasks: <CheckSquare className="h-4 w-4" />,
  wrench: <Wrench className="h-4 w-4" />,
  brain: <Brain className="h-4 w-4" />,
  mapPin: <MapPin className="h-4 w-4" />,
};

// Maps NAV_ITEMS key → module name in the DB (null = always visible)
const NAV_MODULE_MAP: Record<string, string | null> = {
  dashboard:    null,
  'command-center': null,
  hub:          'company_hub',
  crm:          'crm',
  'crm-ksa':    'crm',
  boq:          null,
  email:        'email_campaigns',
  inventory:    'inventory',
  scraper:      'maps_scraper',
  calls:        'calls_meetings',
  tasks:        null,
  visits:       null,
  'after-sales': 'after_sales',
  'ai-assistant': 'ai_assistant',
  helio:        null,
  reports:      'analytics',
};

// Nav items restricted to specific roles (in addition to module gating).
const ROLE_RESTRICTED: Record<string, string[]> = {
  helio: ['admin', 'Manager', 'CS Team Leader', 'Tech Team Leader'],
  'command-center': ['admin', 'Manager', 'CS Team Leader', 'Tech Team Leader'],
};

interface AppRailProps {
  lang: 'ar' | 'en';
  profile?: Profile | null;
  onLogout: () => void;
}

/**
 * The app's single navigation surface — a light rail that carries both the
 * current page's in-page sections (published through RailContext) and every
 * page the signed-in user is allowed to open. It replaces the dark sidebar, so
 * the whole app reads as one continuous card surface.
 *
 * Below `lg` it collapses to a horizontal scroller of nav pills; the org
 * header, ring and profile block are desktop-only (the navbar covers those).
 */
export default function AppRail({ lang, profile, onLogout }: AppRailProps) {
  const pathname = usePathname();
  const { org, orgModules, isSuperAdmin } = useOrg();
  const rail = useRailConfig();

  const primaryColor = org?.brand_colors?.primary ?? '#D72B2B';
  const logoUrl = org?.logo_url || '/logo.png';
  const orgName = org?.name ?? 'HelioMax';

  const enabledModuleNames = new Set(orgModules.map(m => m.module.name));

  const visibleNavItems = NAV_ITEMS.filter(item => {
    // Role-restricted items (e.g. Helio control center) — gate before module logic.
    const allowedRoles = ROLE_RESTRICTED[item.key];
    if (allowedRoles && !(profile?.role && allowedRoles.includes(profile.role))) {
      return false;
    }
    const moduleName = NAV_MODULE_MAP[item.key];
    // Always show if no module required
    if (moduleName === null) return true;
    // Super admin sees everything
    if (isSuperAdmin) return true;
    // Regular user: check enabled modules
    return enabledModuleNames.has(moduleName);
  });

  const sectionsHeading =
    (lang === 'ar' ? rail?.groupLabelAr : rail?.groupLabel) ??
    (lang === 'ar' ? 'أقسام الصفحة' : 'On this page');

  return (
    <nav
      aria-label={lang === 'ar' ? 'التنقل' : 'Navigation'}
      className="flex shrink-0 flex-row gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-sm lg:sticky lg:top-[4.5rem] lg:max-h-[calc(100vh-5.5rem)] lg:w-[220px] lg:flex-col lg:overflow-x-visible lg:overflow-y-auto"
    >
      {/* Org identity — desktop only */}
      <div className="hidden items-center gap-2.5 px-1 pb-3 lg:flex">
        <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-slate-50">
          <img src={logoUrl} alt={orgName} className="h-full w-full object-contain" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold leading-tight text-[#0D2137]">{orgName}</p>
          <span
            className="truncate text-[9px] font-bold uppercase tracking-[2px]"
            style={{ color: primaryColor }}
          >
            {org?.industry ?? 'platform'}
          </span>
        </div>
      </div>

      {/* Group 1 — the current page's own sections */}
      {rail && rail.sections.length > 0 && (
        <>
          <p className="hidden px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 lg:block">
            {sectionsHeading}
          </p>
          {rail.sections.map(section => {
            const active = section.id === rail.activeId;
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => rail.onSelect(section.id)}
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

          <div className="hidden border-t border-slate-100 pt-3 lg:my-1 lg:block" />
        </>
      )}

      {/* Group 2 — every page the user can open */}
      <p className="hidden px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 lg:block">
        {lang === 'ar' ? 'الصفحات' : 'Pages'}
      </p>
      {visibleNavItems.map(item => {
        const active = pathname === item.path || pathname?.startsWith(item.path + '/');
        const label = lang === 'ar' ? item.labelAr : item.labelEn;
        return (
          <Link
            key={item.key}
            href={item.path}
            aria-current={active ? 'page' : undefined}
            className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-start text-xs font-semibold transition-colors lg:w-full ${
              active ? 'text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-[#0D2137]'
            }`}
            style={active ? { backgroundColor: primaryColor } : undefined}
          >
            <span className={active ? 'text-white' : 'text-slate-400'}>{ICON_MAP[item.icon]}</span>
            <span className="whitespace-nowrap">{label}</span>
          </Link>
        );
      })}

      {/* Progress ring the page published — desktop only */}
      {rail?.ring && (
        <div className="hidden border-t border-slate-100 pt-4 lg:mt-3 lg:block">
          <StatusRing
            progress={rail.ring.progress}
            label={lang === 'ar' ? 'من الهدف' : 'of target'}
            caption={rail.ring.caption}
            size={104}
          />
        </div>
      )}

      {/* Profile + logout — desktop only */}
      <div className="mt-auto hidden pt-3 lg:block">
        <div className="border-t border-slate-100 pt-3">
          <div
            className={`flex items-center justify-between gap-2 rounded-xl p-2 transition-colors ${
              pathname === '/settings' ? 'bg-slate-100' : 'hover:bg-slate-50'
            }`}
          >
            <Link href="/settings" className="flex min-w-0 flex-1 items-center gap-2">
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-slate-100"
                style={{ borderColor: pathname === '/settings' ? primaryColor : '#E2E8F0' }}
              >
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt={profile.name} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-[11px] font-bold text-slate-600">
                    {profile ? getInitials(profile.name) : '?'}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-[#0D2137]">
                  {profile?.name || '...'}
                </p>
                <p className="truncate text-[10px] text-slate-400">{profile?.role || ''}</p>
              </div>
            </Link>
            <button
              onClick={onLogout}
              className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-200 hover:text-[#0D2137]"
              title={lang === 'ar' ? 'تسجيل الخروج' : 'Logout'}
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
