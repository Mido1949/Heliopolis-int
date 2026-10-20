import type { Metadata, Viewport } from 'next';
import { Inter, Manrope } from 'next/font/google';
import Providers from '@/components/Providers';
import './globals.css';
import { cn } from "@/lib/utils";

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'HelioMax — HVAC Operations Platform',
  description:
    'HelioMax — internal management platform for HVAC operations: CRM, BOQ, Inventory, Email Campaigns, AI Assistant, and Time Tracking for VRF & HVAC Solutions.',
  icons: { icon: '/logo.png', apple: '/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'Heliopolis', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  themeColor: '#0D2137',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning className={cn("font-sans", inter.variable)}>
      <body
        className={`${inter.variable} ${manrope.variable} font-sans antialiased bg-bg text-primary`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
