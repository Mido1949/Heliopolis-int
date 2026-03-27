'use client';

import React from 'react';
import { ConfigProvider, App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/context/AuthContext';

import { LanguageProvider, useLanguage } from '@/context/LanguageContext';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
    },
  },
});

const theme = {
  token: {
    colorPrimary: '#0D2137',
    colorError: '#D72B2B',
    colorSuccess: '#52c41a',
    borderRadius: 8,
    fontFamily: "'Inter', 'Manrope', sans-serif",
    fontSize: 14,
    colorBgContainer: '#ffffff',
    colorBgLayout: '#F4F6F8',
  },
  components: {
    Button: {
      borderRadius: 8,
      controlHeight: 40,
    },
    Input: {
      borderRadius: 8,
      controlHeight: 40,
    },
    Card: {
      borderRadius: 12,
    },
    Table: {
      borderRadius: 12,
      headerBg: '#F4F6F8',
    },
  },
};

function AntdProvider({ children }: { children: React.ReactNode }) {
  const { dir } = useLanguage();
  return (
    <ConfigProvider theme={theme} direction={dir}>
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
