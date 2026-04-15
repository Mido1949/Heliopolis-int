'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import type { Profile } from '@/types';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  isAdmin: boolean;
  isManager: boolean;
  isStaff: boolean;
  refreshProfile: () => Promise<void>;
  dbStatus: 'online' | 'offline' | 'checking';
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [dbStatus, setDbStatus] = useState<'online' | 'offline' | 'checking'>('checking');
  const supabase = createClient();

  const checkConnection = async () => {
    try {
      const { error } = await supabase.from('profiles').select('count', { count: 'exact', head: true });
      if (error) {
        console.error('DB Connection Check Failed:', error);
        setDbStatus('offline');
      } else {
        setDbStatus('online');
      }
    } catch (e) {
      setDbStatus('offline');
    }
  };

  const fetchProfile = async (userId: string, email?: string) => {
    try {
      await checkConnection();
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (error && error.code === 'PGRST116') {
        // Profile doesn't exist, try to create it
        console.log('Profile missing, creating for user:', userId);
        const { data: newProfile, error: insertError } = await supabase
          .from('profiles')
          .insert({
            id: userId,
            name: email ? email.split('@')[0] : 'User',
            email: email || '',
            role: 'Sales Engineer'
          })
          .select()
          .single();
        
        if (!insertError && newProfile) {
          setProfile(newProfile);
        }
      } else if (data) {
        setProfile(data);
      }
    } catch (err) {
      console.error('Error in fetchProfile:', err);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        const u = session?.user ?? null;
        setUser(u);
        if (u) {
          await fetchProfile(u.id, u.email);
        } else {
          setProfile(null);
        }
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, [supabase]);

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id, user.email);
  };

  const isAdmin = profile?.role === 'admin';
  const isManager = profile?.role === 'Manager';
  const isStaff = profile?.role === 'admin' || profile?.role === 'Manager';

  useEffect(() => {
    checkConnection();
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading, isAdmin, isManager, isStaff, refreshProfile, dbStatus }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
