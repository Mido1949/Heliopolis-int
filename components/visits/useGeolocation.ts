'use client';

import { useCallback, useState } from 'react';

export interface Fix {
  lat: number;
  lng: number;
  /** Metres. The browser always reports this; treat a large value with suspicion. */
  accuracy: number;
}

export type GeoError =
  | 'unsupported'
  | 'denied'
  | 'unavailable'
  | 'timeout'
  | 'insecure';

const MESSAGES: Record<GeoError, string> = {
  unsupported: 'الجهاز ده مش بيدعم تحديد الموقع.',
  denied: 'رفضت إذن الموقع. افتح إعدادات الموقع في المتصفح واسمح بالـ GPS، وبعدين حاول تاني.',
  unavailable: 'مش قادر يحدد الموقع دلوقتي. اتأكد إن الـ GPS مفتوح واطلع لمكان مكشوف.',
  timeout: 'أخد وقت طويل من غير ما يحدد الموقع. حاول تاني.',
  insecure: 'تحديد الموقع بيشتغل على HTTPS بس.',
};

export function geoErrorMessage(err: GeoError): string {
  return MESSAGES[err];
}

/**
 * One-shot GPS fix for a visit check-in.
 *
 * `enableHighAccuracy` is on deliberately: a network-positioned fix can be
 * kilometres out, which is worthless as evidence that a rep stood at a site.
 * The accuracy value comes back with the fix so the caller can say so.
 */
export function useGeolocation() {
  const [locating, setLocating] = useState(false);

  const locate = useCallback((): Promise<{ fix: Fix } | { error: GeoError }> => {
    return new Promise(resolve => {
      if (typeof window === 'undefined' || !('geolocation' in navigator)) {
        resolve({ error: 'unsupported' });
        return;
      }
      // Chrome and Safari both refuse geolocation outside a secure context.
      if (!window.isSecureContext) {
        resolve({ error: 'insecure' });
        return;
      }

      setLocating(true);
      navigator.geolocation.getCurrentPosition(
        pos => {
          setLocating(false);
          resolve({
            fix: {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
            },
          });
        },
        err => {
          setLocating(false);
          if (err.code === err.PERMISSION_DENIED) resolve({ error: 'denied' });
          else if (err.code === err.TIMEOUT) resolve({ error: 'timeout' });
          else resolve({ error: 'unavailable' });
        },
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
      );
    });
  }, []);

  return { locate, locating };
}
