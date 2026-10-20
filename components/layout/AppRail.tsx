/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect } from 'react';
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
  X,
  Phone,
  BarChart2,
  Building2,
  CheckSquare,
  Wrench,
  Brain,
  Gauge,
  MapPin,
  MessageCircle,
  FolderOpen,
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
  whatsapp: <MessageCircle className="h-4 w-4" />,
  folder: <FolderOpen className="h-4 w-4" />,
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
  whatsapp:     null,
  files:        null,
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
  /** Phones: the page list lives in a drawer the navbar's ☰ opens. */
  menuOpen: boolean;
  onCloseMenu: () => void;
}

/**
 * The app's single navigation surface — a light rail that carries both the
 * current page's in-page sections (published through RailContext) and every
 * page the signed-in user is allowed to open. It replaces the dark sidebar, so
 * the whole app reads as one continuous card surface.
 *
 * Below `lg` the pages move into a side drawer opened from the navbar's ☰, so
 * the screen starts with the page itself; only the current page's own
 * sections stay on the page as a row of pills.
 */
export default function AppRail({ lang, profile, onLogout, menuOpen, onCloseMenu }: AppRailProps) {
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

  // Opening a page closes the drawer.
  useEffect(() => { onCloseMenu(); }, [pathname, onCloseMenu]);

  const sectionsHeading =
    (lang === 'ar' ? rail?.groupLabelAr : rail?.groupLabel) ??
    (lang === 'ar' ? 'أقسام الصفحة' : 'On this page');

  const sectionButton = (section: NonNullable<typeof rail>['sections'][number], full: boolean) => {
    const active = section.id === rail?.activeId;
    return (
      <button
        key={section.id}
        type="button"
        onClick={() => rail?.onSelect(section.id)}
        aria-current={active ? 'true' : undefined}
        className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-start text-xs font-semibold transition-colors ${full ? 'w-full' : ''} ${
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
  };

  // The full vertical menu: the desktop rail, and the phone drawer.
  const menu = (inDrawer: boolean) => (
    <>
      {/* Org identity */}
      <div className="flex items-center gap-2.5 px-1 pb-3">
        <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-slate-50">
          <img src={logoUrl} alt={orgName} className="h-full w-full object-contain" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold leading-tight text-[#0D2137]">{orgName}</p>
          <span
            className="truncate text-[9px] font-bold uppercase tracking-[2px]"
            style={{ color: primaryColor }}
          >
            {org?.industry ?? 'platform'}
          </span>
        </div>
        {inDrawer && (
          <button
            type="button"
            onClick={onCloseMenu}
            aria-label={lang === 'ar' ? 'اقفل القائمة' : 'Close menu'}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-[#0D2137]"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Group 1 — the current page's own sections (on phones they stay on the page) */}
      {!inDrawer && rail && rail.sections.length > 0 && (
        <>
          <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {sectionsHeading}
          </p>
          {rail.sections.map(section => sectionButton(section, true))}
          <div className="my-1 border-t border-slate-100 pt-3" />
        </>
      )}

      {/* Group 2 — every page the user can open */}
      <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
        {lang === 'ar' ? 'الصفحات' : 'Pages'}
      </p>
      {visibleNavItems.map(item => {
        const active = pathname === item.path || pathname?.startsWith(item.path + '/');
        const label = lang === 'ar' ? item.labelAr : item.labelEn;
        return (
          <Link
            key={item.key}
            href={item.path}
            data-tour={`nav-${item.key}`}
            aria-current={active ? 'page' : undefined}
            className={`flex w-full shrink-0 items-center gap-2 rounded-xl px-3 text-start font-semibold transition-colors ${
              inDrawer ? 'py-3 text-sm' : 'py-2 text-xs'
            } ${active ? 'text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-[#0D2137]'}`}
            style={active ? { backgroundColor: primaryColor } : undefined}
          >
            <span className={active ? 'text-white' : 'text-slate-400'}>{ICON_MAP[item.icon]}</span>
            <span className="whitespace-nowrap">{label}</span>
          </Link>
        );
      })}

      {/* Progress ring the page published — desktop only */}
      {!inDrawer && rail?.ring && (
        <div className="mt-3 border-t border-slate-100 pt-4">
          <StatusRing
            progress={rail.ring.progress}
            label={lang === 'ar' ? 'من الهدف' : 'of target'}
            caption={rail.ring.caption}
            size={104}
          />
        </div>
      )}

      {/* Profile + logout */}
      <div className="mt-auto pt-3">
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
    </>
  );

  return (
    <>
      <nav
        aria-label={lang === 'ar' ? 'التنقل' : 'Navigation'}
        className="sticky top-[4.5rem] hidden max-h-[calc(100vh-5.5rem)] w-[220px] shrink-0 flex-col gap-2 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-sm lg:flex"
      >
        {menu(false)}
      </nav>

      {/* Phones: the page's own sections stay on the page as a row of pills */}
      {rail && rail.sections.length > 0 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden">
          {rail.sections.map(section => sectionButton(section, false))}
        </div>
      )}

      {/* Phones: the drawer the navbar's ☰ opens, from the reading side */}
      <div
        className={`fixed inset-0 z-50 lg:hidden ${menuOpen ? '' : 'pointer-events-none'}`}
        aria-hidden={!menuOpen}
      >
        <div
          onClick={onCloseMenu}
          className={`absolute inset-0 bg-slate-900/40 transition-opacity duration-200 ${menuOpen ? 'opacity-100' : 'opacity-0'}`}
        />
        <nav
          aria-label={lang === 'ar' ? 'التنقل' : 'Navigation'}
          className={`absolute inset-y-0 start-0 flex w-[78vw] max-w-[300px] flex-col gap-1 overflow-y-auto bg-white p-4 shadow-xl transition-transform duration-200 ${
            menuOpen ? 'translate-x-0' : 'ltr:-translate-x-full rtl:translate-x-full'
          }`}
        >
          {menu(true)}
        </nav>
      </div>
    </>
  );
}
