/* eslint-disable @next/next/no-img-element */
'use client';

import { usePathname, useRouter } from 'next/navigation';
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
  ChevronLeft,
  ChevronRight,
  BarChart2,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { NAV_ITEMS } from '@/lib/constants';
import { getInitials } from '@/lib/utils';
import type { Profile } from '@/types';

const ICON_MAP: Record<string, React.ReactNode> = {
  dashboard: <LayoutDashboard className="w-5 h-5" />,
  contacts: <Users className="w-5 h-5" />,
  fileText: <FileText className="w-5 h-5" />,
  mail: <Mail className="w-5 h-5" />,
  database: <Database className="w-5 h-5" />,
  clock: <Clock className="w-5 h-5" />,
  search: <Search className="w-5 h-5" />,
  robot: <Bot className="w-5 h-5" />,
  phone: <Phone className="w-5 h-5" />,
  barChart: <BarChart2 className="w-5 h-5" />,
};

interface SidebarProps {
  collapsed: boolean;
  onCollapse: (collapsed: boolean) => void;
  lang: 'ar' | 'en';
  profile?: Profile | null;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
}

export default function Sidebar({ collapsed, onCollapse, lang, profile, mobileMenuOpen, setMobileMenuOpen }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <>
      {/* Mobile Overlay */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
      
      <aside
        className={`fixed top-0 left-0 h-screen z-50 flex flex-col transition-transform duration-300 bg-[#0D2137] border-r border-slate-800 ${
          collapsed ? 'w-[72px]' : 'w-[200px]'
        } ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}
      >
      {/* Logo Area */}
      <div className="flex items-center justify-between px-4 h-20 border-b border-white/10 shrink-0">
        {!collapsed && (
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10 overflow-hidden">
              <img
                src="/logo.png"
                alt="Heliopolis Logo"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="flex flex-col">
              <h1 className="text-white text-lg font-bold tracking-tight leading-tight">
                Heliopolis
              </h1>
              <span className="text-[#D72B2B] text-[10px] font-bold tracking-[3px] uppercase mt-[-2px]">
                International
              </span>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="relative w-10 h-10 mx-auto">
            <img
              src="/logo.png"
              alt="Heliopolis Logo"
              className="w-full h-full object-contain"
            />
          </div>
        )}
        <button
          onClick={() => onCollapse(!collapsed)}
          className={`text-slate-400 hover:text-white transition-colors ${collapsed ? 'absolute -right-3 top-7 bg-[#0D2137] border border-slate-700 rounded-full p-0.5' : ''}`}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-5 h-5" />}
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 py-6 overflow-y-auto overflow-x-hidden no-scrollbar">
        <ul className="space-y-2 px-3">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.path || pathname?.startsWith(item.path + '/');
            const label = lang === 'ar' ? item.labelAr : item.labelEn;

            return (
              <li key={item.key}>
                <Link
                  href={item.path}
                  title={collapsed ? label : undefined}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group ${
                    isActive
                      ? 'bg-[#D72B2B] text-white'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span className={`${isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'} transition-colors ${collapsed ? 'mx-auto' : ''}`}>
                    {ICON_MAP[item.icon]}
                  </span>
                  {!collapsed && (
                    <span className="font-medium text-sm whitespace-nowrap overflow-hidden">{label}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User Profile */}
      <div className="p-4 border-t border-white/10 shrink-0">
        <Link 
          href="/settings"
          className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'} gap-3 p-2 rounded-lg transition-all duration-200 group ${
            pathname === '/settings' ? 'bg-white/10 ring-1 ring-white/20' : 'hover:bg-white/5'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center shrink-0 border border-slate-600 overflow-hidden group-hover:border-[#D72B2B] transition-colors">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt={profile.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-white font-bold text-sm">
                  {profile ? getInitials(profile.name) : '?'}
                </span>
              )}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="text-white text-sm font-semibold truncate group-hover:text-[#D72B2B] transition-colors">
                  {profile?.name || 'Loading...'}
                </p>
                <p className="text-slate-400 text-xs truncate">
                  {profile?.role || ''}
                </p>
              </div>
            )}
          </div>
          {!collapsed && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleLogout();
              }}
              className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors shrink-0"
              title={lang === 'ar' ? 'تسجيل الخروج' : 'Logout'}
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </Link>
      </div>
      </aside>
    </>
  );
}
