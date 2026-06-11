'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';

const QUOTES = [
  'النجاح يبدأ بخطوة واحدة',
  'كل عميل هو فرصة جديدة',
  'الإصرار هو مفتاح الإنجاز',
  'تواصل، أقنع، انجز',
  'فريق قوي يصنع نتائج استثنائية',
  'السعى ليه وقت',
  'صلى على محمد',
  'الامل فى الداخل ينتظر الخروج',
  'فى اختلافنا رحمة',
  'مدد يا رب',
];

export default function LoadingScreen() {
  const quote = useMemo(() => QUOTES[Math.floor(Math.random() * QUOTES.length)], []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
      style={{ background: 'linear-gradient(135deg, #0D2137 0%, #1a3a5c 100%)' }}
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="mb-6 text-center"
      >
        <div className="text-white text-4xl font-bold tracking-tight">HELIOMAX</div>
        <div className="text-sm font-bold tracking-[4px] uppercase mt-1" style={{ color: '#D72B2B' }}>
          GCHV EGYPT
        </div>
      </motion.div>

      <motion.p
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="text-white/80 text-lg font-medium text-center px-8 mb-6"
        dir="rtl"
      >
        &ldquo;{quote}&rdquo;
      </motion.p>

      <motion.div
        animate={{ scaleX: [0, 1, 0] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
        className="h-0.5 w-24 bg-[#D72B2B] rounded-full origin-left"
      />
    </motion.div>
  );
}