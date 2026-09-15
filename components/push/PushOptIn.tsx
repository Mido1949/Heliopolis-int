'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, BellOff, Loader2 } from 'lucide-react';

type State = 'checking' | 'unsupported' | 'blocked' | 'off' | 'on';

// VAPID public keys travel as base64url; PushManager wants raw bytes.
// Returns an ArrayBuffer rather than a Uint8Array: lib.dom types
// applicationServerKey as ArrayBuffer-backed, and a Uint8Array is declared over
// ArrayBufferLike, which includes SharedArrayBuffer and so doesn't satisfy it.
function urlBase64ToArrayBuffer(base64: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buffer;
}

/**
 * Per-device opt-in for browser push. Each browser is its own subscription, so
 * a user who wants alerts on both phone and laptop turns this on in both.
 */
export default function PushOptIn() {
  const [state, setState] = useState<State>('checking');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !publicKey) {
      setState('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setState('blocked');
      return;
    }
    navigator.serviceWorker
      .register('/sw.js')
      .then(reg => reg.pushManager.getSubscription())
      .then(sub => setState(sub ? 'on' : 'off'))
      .catch(() => setState('unsupported'));
  }, [publicKey]);

  const enable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'blocked' : 'off');
        return;
      }

      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToArrayBuffer(publicKey!),
      });

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);

      setState('on');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطأ غير معروف');
    } finally {
      setBusy(false);
    }
  }, [publicKey]);

  const disable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState('off');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطأ غير معروف');
    } finally {
      setBusy(false);
    }
  }, []);

  if (state === 'checking') {
    return <div className="h-10 w-48 animate-pulse rounded-lg bg-slate-100" />;
  }

  if (state === 'unsupported') {
    return (
      <p className="text-sm text-slate-500">
        المتصفح ده مش بيدعم الإشعارات، أو مفاتيح الإشعارات مش متظبطة على السيرفر.
      </p>
    );
  }

  if (state === 'blocked') {
    return (
      <p className="text-sm text-amber-700">
        الإشعارات متمنوعة من إعدادات المتصفح. افتح إعدادات الموقع في المتصفح واسمح بالإشعارات، وبعدين
        حدّث الصفحة.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <button
        onClick={state === 'on' ? disable : enable}
        disabled={busy}
        className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-60 ${
          state === 'on'
            ? 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            : 'bg-[#0D2137] text-white hover:opacity-90'
        }`}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : state === 'on' ? (
          <BellOff className="h-4 w-4" />
        ) : (
          <Bell className="h-4 w-4" />
        )}
        {state === 'on' ? 'إيقاف الإشعارات على الجهاز ده' : 'فعّل الإشعارات على الجهاز ده'}
      </button>

      {state === 'on' && (
        <p className="text-xs text-emerald-600">
          ✓ الإشعارات شغالة على الجهاز ده — هتوصلك حتى لو البرنامج مقفول.
        </p>
      )}
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}
