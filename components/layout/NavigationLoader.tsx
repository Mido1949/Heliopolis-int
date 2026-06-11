'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import LoadingScreen from '@/components/shared/LoadingScreen';

export default function NavigationLoader() {
  const pathname = usePathname();
  const isInitialMount = useRef(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => setLoading(false), 400);
    return () => clearTimeout(timer);
  }, [pathname]);

  if (!loading) return null;
  return <LoadingScreen />;
}