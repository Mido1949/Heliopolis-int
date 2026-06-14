'use client';

import { useEffect } from 'react';
import { Button, Result } from 'antd';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[dashboard-error]', error);
  }, [error]);

  return (
    <div
      dir="rtl"
      style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <Result
        status="error"
        title="حصل خطأ في تحميل الصفحة"
        subTitle="Something went wrong loading this page. جرّب تاني، ولو المشكلة فضلت بلّغ الدعم."
        extra={[
          <Button type="primary" key="retry" danger onClick={reset}>
            إعادة المحاولة
          </Button>,
          <Button key="home" href="/dashboard">
            الرئيسية
          </Button>,
        ]}
      />
    </div>
  );
}
