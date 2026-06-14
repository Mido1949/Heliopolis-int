'use client';

import { useEffect } from 'react';

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[root-error]', error);
  }, [error]);

  return (
    <html lang="ar" dir="rtl">
      <body style={{ margin: 0, fontFamily: "'Inter','Tahoma',sans-serif" }}>
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#F4F6F8',
            padding: 24,
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 16,
              padding: '40px 32px',
              maxWidth: 440,
              textAlign: 'center',
              boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
            <h1 style={{ fontSize: 20, color: '#0F172A', margin: '0 0 8px' }}>
              حصل خطأ غير متوقع
            </h1>
            <p style={{ color: '#64748B', fontSize: 14, margin: '0 0 24px' }}>
              Something went wrong. حاول تاني، ولو استمرت المشكلة بلّغ الدعم.
            </p>
            <button
              onClick={reset}
              style={{
                background: '#D72B2B',
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                padding: '10px 24px',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              إعادة المحاولة / Retry
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
