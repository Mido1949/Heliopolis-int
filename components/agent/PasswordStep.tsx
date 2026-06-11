'use client';

import { useState } from 'react';
import { Button, Input, message } from 'antd';
import { LockOutlined, EyeInvisibleOutlined, EyeTwoTone } from '@ant-design/icons';
import { createClient } from '@/lib/supabase/client';

interface PasswordStepProps {
  email: string;
  onSuccess: () => void;
}

/**
 * T058: Masked password capture.
 * The password NEVER leaves this component as a plain string to any parent or AI.
 * It goes directly to Supabase Auth via signInWithPassword.
 */
export default function PasswordStep({ email, onSuccess }: PasswordStepProps) {
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const supabase = createClient();

  const handleSubmit = async () => {
    if (!email || !password) {
      message.error('يرجى إدخال كلمة المرور');
      return;
    }
    setSubmitting(true);
    // Clear the password field immediately after submission so it never lingers in DOM
    const pwd = password;
    setPassword('');
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password: pwd });
      if (error) {
        message.error('كلمة المرور غير صحيحة');
        return;
      }
      onSuccess();
    } catch (err) {
      console.error('Login error:', err);
      message.error('فشل تسجيل الدخول');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white/5 backdrop-blur-md rounded-2xl p-4 border border-white/10 max-w-sm">
      <div className="flex items-center gap-2 mb-3 text-white/80 text-xs">
        <LockOutlined />
        <span>أدخل كلمة المرور (Enter your password)</span>
      </div>
      <Input.Password
        autoFocus
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onPressEnter={handleSubmit}
        placeholder="••••••••"
        iconRender={(visible) => (visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />)}
        className="mb-2"
      />
      <Button
        type="primary"
        block
        loading={submitting}
        onClick={handleSubmit}
        style={{ backgroundColor: '#D72B2B', borderColor: '#D72B2B' }}
      >
        تسجيل الدخول (Sign In)
      </Button>
      <p className="text-[10px] text-white/40 mt-2 text-center">
        كلمة مرورك لا تُمرَّر إلى المساعد الذكي — تذهب مباشرة إلى Supabase Auth
      </p>
    </div>
  );
}
