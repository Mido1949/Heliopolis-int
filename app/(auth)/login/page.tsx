'use client';

import { useState, useEffect } from 'react';
import { Form, Input, Button, Typography, message, Space } from 'antd';
import { MailOutlined, LockOutlined } from '@ant-design/icons';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';

const { Title, Text } = Typography;

const QUOTES = [
  'النجاح يبدأ بخطوة واحدة',
  'كل عميل هو فرصة جديدة',
  'الإصرار هو مفتاح الإنجاز',
  'تواصل، أقنع، انجز',
  'فريق قوي يصنع نتائج استثنائية',
  'السعى ليه وقت',
  'صلى على محمد',
  'الاملفى الداخل ينتظر الخروج',
  'فى اختلافنا رحمة',
  'مدد يا رب',
];

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [quoteIndex, setQuoteIndex] = useState(0);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const interval = setInterval(() => {
      setQuoteIndex((i) => (i + 1) % QUOTES.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const onFinish = async (values: { email: string; password: string }) => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: values.email,
        password: values.password,
      });

      if (error) {
        message.error(error.message);
        return;
      }

      message.success('تم تسجيل الدخول بنجاح');
      router.push('/dashboard');
      router.refresh();
    } catch {
      message.error('حدث خطأ غير متوقع');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Panel — Animated Branding */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12"
        style={{
          background: 'linear-gradient(135deg, #000917 0%, #0D2137 50%, #1a3a5c 100%)',
        }}
      >
        <div>
          <motion.h1
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-white text-4xl font-bold tracking-tight"
          >
            LOOMARK
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mt-1 text-lg font-bold tracking-[4px] uppercase"
            style={{ color: '#D72B2B' }}
          >
            GCHV EGYPT
          </motion.p>
        </div>

        <div className="space-y-6">
          <div
            className="rounded-xl p-6 border"
            style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)' }}
          >
            <AnimatePresence mode="wait">
              <motion.p
                key={quoteIndex}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.5 }}
                className="text-white/90 text-xl font-semibold leading-relaxed text-right"
                dir="rtl"
              >
                &ldquo;{QUOTES[quoteIndex]}&rdquo;
              </motion.p>
            </AnimatePresence>

            <div className="flex gap-1.5 mt-4 justify-end">
              {QUOTES.map((_, i) => (
                <motion.div
                  key={i}
                  animate={{
                    width: i === quoteIndex ? 18 : 6,
                    background: i === quoteIndex ? '#D72B2B' : '#334155',
                  }}
                  transition={{ duration: 0.3 }}
                  className="h-1.5 rounded-full"
                />
              ))}
            </div>
          </div>
        </div>

        <p className="text-white/20 text-xs">© 2026 GCHV Egypt. All rights reserved.</p>
      </div>

      {/* Right Panel — Login Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden text-center mb-8">
            <h1
              className="text-3xl font-heading font-bold"
              style={{ color: '#0D2137' }}
            >
              LOOMARK
            </h1>
            <p className="text-gray-500 mt-1">GCHV Egypt</p>
          </div>

          <div className="bg-white rounded-xl p-8 shadow-sm">
            <Space direction="vertical" size="small" className="w-full mb-8">
              <Title level={3} style={{ margin: 0, color: '#0D2137' }}>
                تسجيل الدخول (Login)
              </Title>
              <Text type="secondary">
                أدخل بيانات حسابك للوصول إلى لوحة التحكم
              </Text>
            </Space>

            <Form
              name="login"
              layout="vertical"
              onFinish={onFinish}
              autoComplete="off"
              requiredMark={false}
              size="large"
            >
              <Form.Item
                label="البريد الإلكتروني (Email)"
                name="email"
                rules={[
                  { required: true, message: 'يرجى إدخال البريد الإلكتروني' },
                  { type: 'email', message: 'بريد إلكتروني غير صالح' },
                ]}
              >
                <Input
                  prefix={<MailOutlined className="text-gray-400" />}
                  placeholder="you@gchvegypt.com"
                />
              </Form.Item>

              <Form.Item
                label="كلمة المرور (Password)"
                name="password"
                rules={[
                  { required: true, message: 'يرجى إدخال كلمة المرور' },
                  { min: 6, message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' },
                ]}
              >
                <Input.Password
                  prefix={<LockOutlined className="text-gray-400" />}
                  placeholder="••••••••"
                />
              </Form.Item>

              <Form.Item className="mb-0 mt-6">
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={loading}
                  block
                  style={{
                    backgroundColor: '#D72B2B',
                    borderColor: '#D72B2B',
                    height: '48px',
                    fontWeight: 600,
                  }}
                >
                  {loading ? 'جاري تسجيل الدخول...' : 'تسجيل الدخول (Sign In)'}
                </Button>
              </Form.Item>
            </Form>
          </div>

          <p className="text-center text-gray-400 text-sm mt-6">
            GCHV Egypt — VRF & HVAC Solutions
          </p>
        </div>
      </div>
    </div>
  );
}