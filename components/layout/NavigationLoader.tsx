'use client';

import { useEffect, useRef, useState } from 'react';
import LoadingScreen from '@/components/shared/LoadingScreen';

export default function NavigationLoader() {
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const link = (e.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null;
      if (!link) return;
      const href = link.getAttribute('href') ?? '';
      if (!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
      if (link.target === '_blank') return;

      if (timerRef.current) clearTimeout(timerRef.current);
      setLoading(true);
      timerRef.current = setTimeout(() => setLoading(false), 5000);
    };

    document.addEventListener('click', handleClick, true);
    return () => {
      document.removeEventListener('click', handleClick, true);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!loading) return null;
  return <LoadingScreen />;
}