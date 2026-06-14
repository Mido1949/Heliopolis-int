'use client';

import React from 'react';
import { ConfigProvider, App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/context/AuthContext';
import { heliomaxTheme } from '@/components/theme/heliomaxTheme';

import { LanguageProvider, useLanguage } from '@/context/LanguageContext';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
    },
  },
});

function AntdProvider({ children }: { children: React.ReactNode }) {
  const { dir } = useLanguage();
  return (
    <ConfigProvider theme={heliomaxTheme} direction={dir}>
      <AntApp>
        {children}
      </AntApp>
    </ConfigProvider>
  );
}

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <LanguageProvider>
          <AntdProvider>
            {children}
          </AntdProvider>
        </LanguageProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
