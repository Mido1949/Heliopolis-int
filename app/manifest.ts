import type { MetadataRoute } from 'next';

// Makes the CRM installable from the phone browser (Android "Install app",
// iPhone Share → Add to Home Screen). iOS only allows web push from an
// installed app, so this is also what unlocks notifications on iPhones.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Heliopolis CRM',
    short_name: 'Heliopolis',
    start_url: '/whatsapp',
    scope: '/',
    display: 'standalone',
    dir: 'rtl',
    lang: 'ar',
    background_color: '#ffffff',
    theme_color: '#0D2137',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
