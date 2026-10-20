'use client';

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

const MINE = process.env.NEXT_PUBLIC_BUILD_ID || 'dev';
const SEEN_KEY = 'update-prompt-seen';
const EVERY_MS = 5 * 60 * 1000;

/**
 * After a deploy, tabs that stay open keep running the old code. This checks
 * the server's build every few minutes and when the tab comes back into view,
 * and asks once, in the middle of the screen, for a refresh. "Later" hides it
 * for that version only.
 */
export default function UpdatePrompt() {
  const [latest, setLatest] = useState<string | null>(null);

  useEffect(() => {
    if (MINE === 'dev') return;
    const check = async () => {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        const { build } = await res.json();
        if (!build || build === 'dev' || build === MINE) return;
        if (localStorage.getItem(SEEN_KEY) === build) return;
        setLatest(build);
      } catch { /* offline: try again later */ }
    };
    check();
    const timer = setInterval(check, EVERY_MS);
    const onShow = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onShow);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onShow);
    };
  }, []);

  if (!latest) return null;

  const later = () => {
    try { localStorage.setItem(SEEN_KEY, latest); } catch { /* noop */ }
    setLatest(null);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0D2137]/60 p-4 backdrop-blur-sm" dir="rtl">
      <div role="dialog" aria-modal="true" aria-labelledby="update-title" className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#E4EEF7] text-[#0D2137]">
          <RefreshCw className="h-7 w-7" />
        </div>
        <h2 id="update-title" className="text-lg font-bold text-[#0D2137]">نزل تحديث جديد للسيستم</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          شاشة الواتساب اتجددت وفيها ردود جاهزة جديدة. اعمل تحديث للصفحة عشان تشتغل على النسخة الجديدة.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mt-5 w-full rounded-xl bg-[#0D2137] py-3 text-sm font-bold text-white hover:bg-[#16314F] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0D2137]"
        >
          تحديث دلوقتي
        </button>
        <button onClick={later} className="mt-2 w-full py-2 text-xs text-slate-500 hover:text-slate-700">
          بعدين
        </button>
      </div>
    </div>
  );
}
