'use client';

import AppRail from './AppRail';
import Navbar from './Navbar';
import HelioAgent from '@/components/agent/HelioAgent';
import NavigationLoader from './NavigationLoader';
import { RailProvider } from '@/context/RailContext';
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
  const { lang, toggleLanguage } = useLanguage();
  const { profile, user } = useAuth();
  const { currentOrgId } = useOrg();
  const router = useRouter();
  const supabase = createClient();

  // Hooks must run unconditionally on every render — call session manager first.
  useSessionManager(user?.id ?? null, currentOrgId);
  useIdleLogout();

  // Feature 006: every authenticated role now gets the full app shell (rail +
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
    // RailProvider must sit above both the rail and the page, so a page can
    // publish its own sections into the shared rail.
    <RailProvider>
      <div className="min-h-screen bg-[#F4F6F8] font-sans text-slate-900">
        <NavigationLoader />

        <Navbar lang={lang} onToggleLang={toggleLang} />

        <main className="min-h-screen pt-16">
          {/* `items-start` is what lets the rail stick while the page scrolls. */}
          <div className="mx-auto flex max-w-[1600px] flex-col gap-5 p-4 md:p-6 lg:flex-row lg:items-start">
            <AppRail lang={lang} profile={profile} onLogout={handleLogout} />

            <div className="min-w-0 flex-1 overflow-x-hidden">{children}</div>
          </div>
        </main>

        {/* Floating AI agent — Helio, available to every role as an optional assistant */}
        <HelioAgent />
      </div>
    </RailProvider>
  );
}
