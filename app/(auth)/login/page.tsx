'use client';

import { useState } from 'react';
import { Form, Input, Button, Typography, message, Space } from 'antd';
import { MailOutlined, LockOutlined } from '@ant-design/icons';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

const { Title, Text } = Typography;

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

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
      {/* Left Panel — Branding */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12"
        style={{
          background: 'linear-gradient(135deg, #000917 0%, #0D2137 50%, #1a3a5c 100%)',
        }}
      >
        <div>
          <h1 className="text-white text-4xl font-heading font-bold tracking-tight">
            LOOMARK
          </h1>
          <p className="text-white/60 mt-2 text-lg">GCHV Egypt</p>
        </div>

        <div className="space-y-6">
          <div className="bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10">
            <h3 className="text-white/90 text-xl font-semibold mb-2">
              نظام إدارة المبيعات الذكي
            </h3>
            <p className="text-white/50 leading-relaxed">
              إدارة العملاء، عروض الأسعار، المخزون، وحملات البريد الإلكتروني — كل ذلك في مكان واحد مع مساعد ذكاء اصطناعي متكامل.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'VRF Systems', labelAr: 'أنظمة VRF' },
              { label: 'Heat Pumps', labelAr: 'مضخات حرارية' },
              { label: 'AC Solutions', labelAr: 'حلول تكييف' },
            ].map((item) => (
              <div
                key={item.label}
                className="bg-white/5 backdrop-blur rounded-lg p-3 text-center border border-white/10"
              >
                <p className="text-white/70 text-xs">{item.labelAr}</p>
                <p className="text-white/40 text-[10px] mt-1">{item.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="text-white/30 text-sm">
          © {new Date().getFullYear()} GCHV Egypt — Powered by LOOMARK
        </div>
      </div>

      {/* Right Panel — Login Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-bg">
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
            GCHV Egypt — VRF &amp; HVAC Solutions
          </p>
        </div>
      </div>
    </div>
  );
}
