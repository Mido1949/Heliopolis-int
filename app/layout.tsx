import type { Metadata } from 'next';
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
  title: 'Heliopolis INT — GCHV Egypt HVAC Platform',
  description:
    'Internal management platform for Heliopolis INT (GCHV Egypt) — CRM, BOQ, Inventory, Email Campaigns, AI Assistant, and Time Tracking for VRF & HVAC Solutions.',
  icons: { icon: '/logo.png' }, // Using logo as favicon draft
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
