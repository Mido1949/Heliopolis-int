'use client';

import { useState } from 'react';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import HelioAgent from '@/components/agent/HelioAgent';
import NavigationLoader from './NavigationLoader';
import { useAuth } from '@/context/AuthContext';
import { useSessionManager } from '@/hooks/useSessionManager';
import { useOrg } from '@/context/OrgContext';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/context/LanguageContext';
import { useIdleLogout } from '@/lib/hooks/useIdleLogout';

interface ShellProps {
  children: React.ReactNode;
}

export default function Shell({ children }: ShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { lang, toggleLanguage } = useLanguage();
  const { profile, user } = useAuth();
  const { currentOrgId } = useOrg();
  const router = useRouter();
  const supabase = createClient();

  // Hooks must run unconditionally on every render — call session manager first.
  useSessionManager(user?.id ?? null, currentOrgId);
  useIdleLogout();

  // Feature 006: every authenticated role now gets the full app shell (Sidebar +
  // Navbar + board access). The chat-only NormalUserShell is retired as the forced
  // container; the guided-capture flow it held is preserved in the repo and Helio
  // remains available as the floating assistant below. Manual guarantees (atomic
  // claim, reminders-only autonomy) are unchanged — this is a visibility change only.
  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const toggleLang = () => {
    toggleLanguage();
  };

  return (
    <div className="min-h-screen bg-[#F4F6F8] font-sans text-slate-900">
      <NavigationLoader />
      <Sidebar
        collapsed={collapsed}
        onCollapse={setCollapsed}
        lang={lang}
        profile={profile}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        onLogout={handleLogout}
      />
      
      <Navbar
        lang={lang}
        onToggleLang={toggleLang}
        collapsed={collapsed}
        onToggleMobileMenu={() => setMobileMenuOpen(!mobileMenuOpen)}
      />
      
      <main
        className={`transition-all duration-300 min-h-screen pt-16 ${
          collapsed ? 'md:ml-[72px] ml-0' : 'md:ml-[200px] ml-0'
        }`}
      >
        <div className="p-4 md:p-8 max-w-[1600px] mx-auto overflow-x-hidden">
          {children}
        </div>
      </main>

      {/* Floating AI agent — Helio, available to every role as an optional assistant */}
      <HelioAgent />
    </div>
  );
}