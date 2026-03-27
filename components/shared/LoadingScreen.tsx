'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import { Typography } from 'antd';
import { APP_NAME } from '@/lib/constants';

const { Text } = Typography;

export default function LoadingScreen() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white"
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ 
          scale: [0.8, 1.1, 1],
          opacity: 1 
        }}
        transition={{ 
          duration: 0.8,
          repeat: Infinity,
          repeatType: "reverse"
        }}
        className="relative w-32 h-32 mb-6"
      >
        <Image
          src="/logo.png"
          alt="Heliopolis Logo"
          fill
          className="object-contain"
          priority
        />
      </motion.div>
      
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="text-center"
      >
        <Text strong style={{ fontSize: 24, color: '#0D2137', letterSpacing: '2px' }}>
          {APP_NAME}
        </Text>
        <div className="flex justify-center mt-4">
          <motion.div
            animate={{
              scaleX: [0, 1, 0],
              originX: [0, 0, 1],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: "easeInOut"
            }}
            className="h-1 w-32 bg-[#D72B2B] rounded-full"
          />
        </div>
      </motion.div>
    </motion.div>
  );
}
