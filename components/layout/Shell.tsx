'use client';

import { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import { createClient } from '@/lib/supabase/client';
import type { Profile } from '@/types';

interface ShellProps {
  children: React.ReactNode;
}

import { useLanguage } from '@/context/LanguageContext';

export default function Shell({ children }: ShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { lang, toggleLanguage } = useLanguage();
  const [profile, setProfile] = useState<Profile | null>(null);
  const supabase = createClient();

  // Load current user profile
  useEffect(() => {
    const loadProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();
        if (data) {
          setProfile(data as Profile);
        }
      }
    };
    loadProfile();
  }, [supabase]);

  const toggleLang = () => {
    toggleLanguage();
  };

  return (
    <div className="min-h-screen bg-[#F4F6F8] font-sans text-slate-900">
      <Sidebar
        collapsed={collapsed}
        onCollapse={setCollapsed}
        lang={lang}
        profile={profile}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
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
    </div>
  );
}
