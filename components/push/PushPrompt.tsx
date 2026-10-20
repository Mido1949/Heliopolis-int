'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import PushOptIn from './PushOptIn';

const DISMISS_KEY = 'push-prompt-dismissed';

/**
 * Slim banner that asks each device once to turn on notifications, so nobody
 * has to find the switch in Settings. On an iPhone that hasn't installed the
 * app yet it explains Add to Home Screen first, since iOS only allows web push
 * from an installed app.
 */
export default function PushPrompt() {
  const [mode, setMode] = useState<'hidden' | 'ask' | 'ios-install'>('hidden');

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY)) return;
    } catch { /* storage blocked: still ask */ }

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;

    if (ios && !standalone) {
      setMode('ios-install');
      return;
    }
    if (!('Notification' in window) || !('PushManager' in window)) return;
    if (Notification.permission !== 'default') return;
    setMode('ask');
  }, []);

  if (mode === 'hidden') return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* noop */ }
    setMode('hidden');
  };

  return (
    <div dir="rtl" className="mb-3 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
      <div className="flex-1 space-y-2">
        {mode === 'ios-install' ? (
          <p>
            عشان توصلك إشعارات الواتساب على الآيفون: افتح البرنامج من <b>Safari</b> ← زرار المشاركة
            <span className="mx-1">⬆️</span> ← <b>Add to Home Screen</b>، وبعدين افتحه من الأيقونة وفعّل الإشعارات.
          </p>
        ) : (
          <>
            <p>فعّل الإشعارات عشان يوصلك صوت وتنبيه أول ما عميل يكتب أو حد يحوّلك محادثة.</p>
            <PushOptIn />
          </>
        )}
      </div>
      <button onClick={dismiss} aria-label="إخفاء" className="text-slate-400 hover:text-slate-600">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
