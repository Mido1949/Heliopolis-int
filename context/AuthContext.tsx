'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { withTimeout } from '@/lib/utils';
import type { User } from '@supabase/supabase-js';
import type { Profile } from '@/types';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  isAdmin: boolean;
  isManager: boolean;
  isStaff: boolean;
  isTeamLeader: boolean;
  isCSLead: boolean;
  isTechLead: boolean;
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
      const { error } = await withTimeout(
        supabase.from('profiles').select('count', { count: 'exact', head: true }),
        8000,
        'Connection check'
      );
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

  const fetchProfile = async (userId: string, email?: string, attempt = 0): Promise<void> => {
    try {
      await checkConnection();
      const { data, error } = await withTimeout(
        supabase.from('profiles').select('*').eq('id', userId).single(),
        8000,
        'Profile fetch'
      );

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
      } else if (error) {
        // Non-"missing row" errors (e.g. transient 503) must not be swallowed:
        // a null profile silently demotes admins/leaders to rep-level UI.
        throw error;
      } else if (data) {
        setProfile(data);
      }
    } catch (err) {
      console.error('Error in fetchProfile:', err);
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        return fetchProfile(userId, email, attempt + 1);
      }
    }
  };

  useEffect(() => {
    // supabase-js deadlocks if an async Supabase call is awaited directly
    // inside onAuthStateChange: the callback runs inside the auth client's
    // internal lock, and fetchProfile's queries try to re-acquire that same
    // lock to attach the session token, so they never resolve (see
    // https://supabase.com/docs/guides/troubleshooting/why-is-my-supabase-api-call-not-returning-PGzXw0).
    // Deferring with setTimeout(0) runs the Supabase calls after the callback
    // (and its lock) has returned.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // T034: handle each event explicitly
        switch (event) {
          case 'TOKEN_REFRESHED':
            // Session is updated automatically by the SDK; just sync state.
            setUser(session?.user ?? null);
            break;
          case 'SIGNED_OUT':
            setUser(null);
            setProfile(null);
            setLoading(false);
            if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
              window.location.assign('/login');
            }
            break;
          case 'USER_UPDATED': {
            setUser(session?.user ?? null);
            const u = session?.user;
            if (u) setTimeout(() => { fetchProfile(u.id, u.email); }, 0);
            break;
          }
          case 'SIGNED_IN':
          case 'INITIAL_SESSION':
          default: {
            const u = session?.user ?? null;
            setUser(u);
            if (u) {
              setTimeout(() => {
                fetchProfile(u.id, u.email).finally(() => setLoading(false));
              }, 0);
            } else {
              setProfile(null);
              setLoading(false);
            }
            break;
          }
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [supabase]);

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id, user.email);
  };

  // profiles has no is_admin column — role is the single source of truth
  const isAdmin = profile?.role === 'admin';
  const isManager = profile?.role === 'Manager';
  const isCSLead = profile?.role === 'CS Team Leader';
  const isTechLead = profile?.role === 'Tech Team Leader';
  const isTeamLeader = isCSLead || isTechLead;
  const isStaff = isAdmin || isManager || isTeamLeader;

  useEffect(() => {
    checkConnection();
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading, isAdmin, isManager, isStaff, isTeamLeader, isCSLead, isTechLead, refreshProfile, dbStatus }}>
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
