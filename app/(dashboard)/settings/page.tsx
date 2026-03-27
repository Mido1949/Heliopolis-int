'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { User, Mail, Shield, Users, Trophy, Clock, Camera, Save, Loader2, Phone } from 'lucide-react';
import type { Profile } from '@/types';
import { formatDuration, getInitials } from '@/lib/utils';
import { App } from 'antd';

export default function SettingsPage() {
  const { message } = App.useApp();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [totalTime, setTotalTime] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Profile
        const { data: pData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();
        
        if (pData) {
          setProfile(pData as Profile);
          setName(pData.name);
          setPhone(pData.phone || '');
        }

        // Time Logs
        const { data: tData } = await supabase
            .from('time_logs')
            .select('duration_seconds')
            .eq('user_id', user.id);
        
        if (tData) {
            const total = tData.reduce((acc, log) => acc + (log.duration_seconds || 0), 0);
            setTotalTime(total);
        }
      } catch (err) {
        console.error('Error fetching settings:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [supabase]);

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ 
          name, 
          phone,
          updated_at: new Date().toISOString()
        })
        .eq('id', profile.id);

      if (error) throw error;
      
      message.success('Profile updated successfully');
      // Refresh local state if needed
      setProfile({ ...profile, name, phone });
    } catch (err) {
      console.error('Update error:', err);
      message.error('Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    if (file.size > 2 * 1024 * 1024) {
      message.error('Image must be less than 2MB');
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${profile.id}-${Math.random()}.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      // Upload image
      const { error: uploadError } = await supabase.storage
        .from('loomark') // Using the main bucket if it exists, or change to 'avatars'
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('loomark')
        .getPublicUrl(filePath);

      // Update profile
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', profile.id);

      if (updateError) throw updateError;

      setProfile({ ...profile, avatar_url: publicUrl });
      message.success('Avatar updated successfully');
    } catch (err) {
      console.error('Upload error:', err);
      message.error('Failed to upload image. Ensure the "loomark" storage bucket exists and is public.');
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="w-8 h-8 text-[#D72B2B] animate-spin" />
        <p className="text-slate-500 animate-pulse">Loading your settings...</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header */}
      <div className="relative overflow-hidden rounded-3xl bg-[#0D2137] p-8 md:p-12 text-white shadow-2xl">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-[#D72B2B]/20 to-transparent rounded-full -mr-32 -mt-32 blur-3xl"></div>
        <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
          <div className="relative group cursor-pointer" onClick={handleAvatarClick}>
            <div className="w-32 h-32 rounded-2xl bg-white/10 backdrop-blur-md border-2 border-white/20 overflow-hidden flex items-center justify-center transition-all duration-300 group-hover:border-[#D72B2B] group-hover:scale-105 shadow-xl">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt={profile.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-4xl font-bold text-white/40">
                  {getInitials(profile?.name || '')}
                </span>
              )}
              {uploading ? (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 text-white animate-spin" />
                </div>
              ) : (
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Camera className="w-8 h-8 text-white" />
                </div>
              )}
            </div>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              className="hidden" 
              accept="image/*"
            />
          </div>

          <div className="flex-1 text-center md:text-left space-y-2">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{profile?.name}</h1>
            <div className="flex flex-wrap justify-center md:justify-start gap-3">
              <span className="px-3 py-1 rounded-full bg-white/10 backdrop-blur-sm text-xs border border-white/10">
                {profile?.role || 'User'}
              </span>
              <span className="px-3 py-1 rounded-full bg-[#D72B2B]/20 backdrop-blur-sm text-xs border border-[#D72B2B]/30 text-[#FF6B6B]">
                {profile?.team || 'General Team'}
              </span>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/10 text-center min-w-[100px]">
              <Trophy className="w-5 h-5 text-yellow-500 mx-auto mb-1" />
              <p className="text-2xl font-bold leading-tight">{profile?.score || 0}</p>
              <p className="text-[10px] uppercase tracking-wider text-white/50">Score</p>
            </div>
            <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/10 text-center min-w-[100px]">
              <Clock className="w-5 h-5 text-blue-400 mx-auto mb-1" />
              <p className="text-2xl font-bold leading-tight">{formatDuration(totalTime)}</p>
              <p className="text-[10px] uppercase tracking-wider text-white/50">Worked</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
        {/* Main Content */}
        <div className="md:col-span-8 space-y-8">
          <Card className="border-none shadow-sm overflow-hidden bg-white/50 backdrop-blur-sm">
            <CardHeader className="border-b border-slate-100">
              <CardTitle className="text-xl">Profile Details</CardTitle>
              <CardDescription>Edit your public information and contact details.</CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Display Name</label>
                  <div className="group relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-[#D72B2B] transition-colors" />
                    <Input 
                      value={name} 
                      onChange={(e) => setName(e.target.value)}
                      className="pl-10 h-12 bg-slate-50 border-slate-200 focus:bg-white transition-all"
                      placeholder="Enter your name"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Phone Number</label>
                  <div className="group relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-[#D72B2B] transition-colors" />
                    <Input 
                      value={phone} 
                      onChange={(e) => setPhone(e.target.value)}
                      className="pl-10 h-12 bg-slate-50 border-slate-200 focus:bg-white transition-all"
                      placeholder="+20 1xx xxxx xxx"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t border-slate-100">
                <Button 
                  onClick={handleSave} 
                  disabled={saving}
                  className="bg-[#D72B2B] hover:bg-[#B71B1B] text-white px-8 h-12 rounded-xl transition-all shadow-lg shadow-[#D72B2B]/20"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Save Profile
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="border-none shadow-sm bg-indigo-600 text-white group cursor-default">
              <CardHeader>
                <CardTitle className="text-lg flex items-center justify-between">
                  Team Access
                  <Users className="w-5 h-5 text-white/60 group-hover:scale-110 transition-transform" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold mb-1">{profile?.team || 'Global'}</p>
                <p className="text-sm text-white/60">Assigned business unit</p>
              </CardContent>
            </Card>

            <Card className="border-none shadow-sm bg-slate-100 border border-slate-200 shadow-inner group cursor-default">
              <CardHeader>
                <CardTitle className="text-lg flex items-center justify-between text-[#0D2137]">
                  Account Status
                  <Shield className="w-5 h-5 text-slate-400 group-hover:rotate-12 transition-transform" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold mb-1 text-[#0D2137]">{profile?.role}</p>
                <p className="text-sm text-slate-500">System authorization level</p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Sidebar Info */}
        <div className="md:col-span-4 space-y-6">
           <Card className="border-none shadow-sm bg-white">
            <CardHeader>
              <CardTitle className="text-lg">Security Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Email</p>
                <div className="flex items-center gap-2 text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <Mail className="w-4 h-4 text-slate-400" />
                  <span className="text-sm truncate">{profile?.email}</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-2">Authenticated via Supabase Auth</p>
              </div>
            </CardContent>
          </Card>

          <div className="p-6 rounded-3xl bg-gradient-to-br from-yellow-400/10 to-transparent border border-yellow-400/20">
            <h4 className="font-bold text-[#0D2137] mb-2 flex items-center gap-2">
              <Trophy className="w-4 h-4 text-yellow-600" />
              GCHV Ranking
            </h4>
            <p className="text-sm text-slate-600 mb-4">You are currently in the top performance tier. Keep it up!</p>
            <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
              <div 
                className="bg-yellow-500 h-full rounded-full transition-all duration-1000" 
                style={{ width: `${Math.min((profile?.score || 0) / 100, 100)}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
