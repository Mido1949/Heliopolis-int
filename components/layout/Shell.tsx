'use client';

import { useState } from 'react';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import HelioAgent from '@/components/agent/HelioAgent';
import NormalUserShell from './NormalUserShell';
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

  // Stage 2: role-based shell — normal CS / Tech users get the AI-first 3-column layout.
  // Admin and Tech Team Leader keep the full sidebar + Navbar shell unchanged.
  const isNormalUser = !!profile && profile.role !== 'admin' && profile.role !== 'Tech Team Leader';

  if (isNormalUser) {
    return <NormalUserShell>{children}</NormalUserShell>;
  }

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

      {/* Floating AI agent — hidden for normal users (their chat is inside NormalUserShell) */}
      {!isNormalUser && <HelioAgent />}
    </div>
  );
}