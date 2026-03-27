'use client';

import { usePathname } from 'next/navigation';
import { Bell, Search, Globe, ChevronDown, Menu } from 'lucide-react';
import { NAV_ITEMS } from '@/lib/constants';

interface NavbarProps {
  lang: 'ar' | 'en';
  onToggleLang: () => void;
  collapsed: boolean;
  onToggleMobileMenu: () => void;
}

export default function Navbar({ lang, onToggleLang, collapsed, onToggleMobileMenu }: NavbarProps) {
  const pathname = usePathname();

  // Find current page title
  const currentNav = NAV_ITEMS.find(
    (item) => pathname === item.path || pathname?.startsWith(item.path + '/')
  );
  
  const pageTitle = currentNav
    ? lang === 'ar'
      ? `${currentNav.labelAr} (${currentNav.labelEn})`
      : currentNav.labelEn
    : 'LOOMARK';

  return (
    <header
      className={`fixed top-0 end-0 z-40 h-16 bg-white/80 backdrop-blur-md border-b border-slate-200 flex items-center justify-between px-4 md:px-6 transition-all duration-300 ${
        collapsed ? 'md:start-[72px] start-0' : 'md:start-[200px] start-0'
      }`}
    >
      <div className="flex items-center gap-2 md:gap-4">
        {/* Mobile menu button */}
        <button 
          onClick={onToggleMobileMenu}
          className="md:hidden p-2 -ms-2 text-slate-600 hover:text-[#0D2137] rounded-lg hover:bg-slate-50 transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Page Title */}
        <h2 className="text-lg md:text-xl font-bold text-[#0D2137] truncate">
          {pageTitle}
        </h2>
      </div>

      <div className="flex items-center gap-3 md:gap-6">
        {/* Search */}
        <div className="hidden md:flex relative items-center">
          <Search className="w-4 h-4 text-slate-400 absolute start-3" />
          <input 
            type="text" 
            placeholder={lang === 'ar' ? 'بحث...' : 'Search...'} 
            className="ps-9 pe-4 py-2 bg-slate-100 border-none rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-[#D72B2B]/20 w-64 transition-all"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 md:gap-4 border-s border-slate-200 ps-4 md:ps-6 ms-2 md:ms-0">
          <button 
            onClick={onToggleLang}
            className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-[#0D2137] transition-colors p-2 rounded-lg hover:bg-slate-50"
          >
            <Globe className="w-4 h-4" />
            <span className="hidden sm:inline-block">{lang === 'ar' ? 'English' : 'العربية'}</span>
          </button>
          
          <button className="relative p-2 text-slate-400 hover:text-[#0D2137] transition-colors rounded-full hover:bg-slate-50">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1 end-1.5 w-2 h-2 bg-[#D72B2B] rounded-full ring-2 ring-white"></span>
          </button>
          
          {/* Mobile Profile Dropdown trigger (Optional) */}
          <button className="md:hidden flex items-center gap-1 text-slate-400">
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
