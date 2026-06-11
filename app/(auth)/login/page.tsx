'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import PasswordStep from '@/components/agent/PasswordStep';

// ── Types ──────────────────────────────────────────────────────────────────────

type Step =
  | 'greeting'
  | 'name_input'
  | 'looking_up'
  | 'not_found'
  | 'multiple_matches'
  | 'password'
  | 'success';

interface UserMatch {
  name: string;
  email: string;
  role: string;
}

interface ChatMsg {
  id: string;
  from: 'bot' | 'user';
  text?: string;
  widget?: 'password' | 'user_select';
  email?: string;
  matches?: UserMatch[];
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function HelioAvatar() {
  return (
    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white font-bold text-sm"
      style={{ background: 'linear-gradient(135deg, #D72B2B, #0D2137)' }}>
      H
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex items-start gap-2">
      <HelioAvatar />
      <div className="flex gap-1 items-center bg-white/10 rounded-2xl rounded-tl-sm px-4 py-3">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-1.5 h-1.5 bg-white/50 rounded-full"
            animate={{ y: [0, -5, 0] }}
            transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.12 }}
          />
        ))}
      </div>
    </div>
  );
}

function BotBubble({
  msg,
  onPasswordSuccess,
  onSelectUser,
  loginDone,
}: {
  msg: ChatMsg;
  onPasswordSuccess?: () => void;
  onSelectUser?: (user: UserMatch) => void;
  loginDone?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-2"
    >
      <HelioAvatar />
      <div className="max-w-[260px] space-y-2">
        {msg.text && (
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl rounded-tl-sm px-4 py-3 text-white text-sm leading-relaxed whitespace-pre-line">
            {msg.text}
          </div>
        )}

        {msg.widget === 'user_select' && msg.matches && onSelectUser && (
          <div className="space-y-1.5">
            {msg.matches.map((u) => (
              <button
                key={u.email}
                onClick={() => onSelectUser(u)}
                className="block w-full text-right px-4 py-2 bg-white/10 hover:bg-white/20 active:bg-white/30 rounded-xl text-white text-sm transition-colors border border-white/10"
              >
                {u.name}
                <span className="text-white/40 text-xs mr-2">({u.role})</span>
              </button>
            ))}
          </div>
        )}

        {msg.widget === 'password' && msg.email && !loginDone && onPasswordSuccess && (
          <PasswordStep email={msg.email} onSuccess={onPasswordSuccess} />
        )}
      </div>
    </motion.div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex justify-end"
    >
      <div
        className="rounded-2xl rounded-tr-sm px-4 py-3 text-white text-sm max-w-[220px]"
        style={{ background: 'rgba(215, 43, 43, 0.7)' }}
      >
        {text}
      </div>
    </motion.div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('greeting');
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserMatch | null>(null);
  const [loginDone, setLoginDone] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const pushMsg = useCallback((msg: Omit<ChatMsg, 'id'>) => {
    setMessages((prev) => [...prev, { id: `${Date.now()}-${Math.random()}`, ...msg }]);
  }, []);

  // Initial greeting
  useEffect(() => {
    const t = setTimeout(() => {
      pushMsg({ from: 'bot', text: 'مرحباً! 👋 أنا هيليو، مساعدك في HelioMax.\nإيه اسمك؟' });
      setStep('name_input');
    }, 700);
    return () => clearTimeout(t);
  }, [pushMsg]);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Focus input on name step
  useEffect(() => {
    if (step === 'name_input') {
      setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [step]);

  const handleNameSubmit = async () => {
    const name = input.trim();
    if (name.length < 2) return;

    pushMsg({ from: 'user', text: name });
    setInput('');
    setStep('looking_up');
    setIsTyping(true);

    try {
      const res = await fetch('/api/auth/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      setIsTyping(false);

      if (!data.found || !data.users?.length) {
        pushMsg({ from: 'bot', text: 'مش لاقيك في الفريق 🤔\nجرب تكتب اسمك الكامل أو تواصل مع الأدمن.' });
        setStep('name_input');
        return;
      }

      if (data.users.length === 1) {
        const user = data.users[0] as UserMatch;
        setSelectedUser(user);
        pushMsg({
          from: 'bot',
          text: `أهلاً ${user.name}! 👋\nأدخل كلمة مرورك:`,
          widget: 'password',
          email: user.email,
        });
        setStep('password');
      } else {
        pushMsg({
          from: 'bot',
          text: 'لقيت أكتر من شخص. اختار اسمك:',
          widget: 'user_select',
          matches: data.users,
        });
        setStep('multiple_matches');
      }
    } catch {
      setIsTyping(false);
      pushMsg({ from: 'bot', text: 'في مشكلة في الاتصال. حاول تاني.' });
      setStep('name_input');
    }
  };

  const handleSelectUser = (user: UserMatch) => {
    setSelectedUser(user);
    pushMsg({ from: 'user', text: user.name });
    pushMsg({
      from: 'bot',
      text: `أهلاً ${user.name}! 👋\nأدخل كلمة مرورك:`,
      widget: 'password',
      email: user.email,
    });
    setStep('password');
  };

  const handleLoginSuccess = useCallback(() => {
    setLoginDone(true);
    pushMsg({
      from: 'bot',
      text: `✅ أهلاً وسهلاً ${selectedUser?.name || ''}!\nبنقلك للوحة التحكم...`,
    });
    setStep('success');
    setTimeout(() => {
      window.location.href = '/dashboard';
    }, 1400);
  }, [selectedUser, pushMsg]);

  const showInput = step === 'name_input' || step === 'not_found';

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{ background: 'linear-gradient(145deg, #000917 0%, #0D2137 55%, #081A2B 100%)' }}
    >
      {/* Logo */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center mb-8 select-none"
      >
        <h1 className="text-white text-4xl font-bold tracking-tight">HELIOMAX</h1>
        <p className="font-bold tracking-[6px] text-xs mt-1" style={{ color: '#D72B2B' }}>
          GCHV EGYPT
        </p>
      </motion.div>

      {/* Chat card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.5 }}
        className="w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl border border-white/10"
        style={{ background: 'rgba(8, 26, 43, 0.85)', backdropFilter: 'blur(20px)' }}
      >
        {/* Chat header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
          <HelioAvatar />
          <div>
            <p className="text-white text-sm font-semibold">هيليو</p>
            <p className="text-white/40 text-xs">مساعد HelioMax · دايماً موجود</p>
          </div>
          <div className="mr-auto flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-emerald-400 text-xs">Online</span>
          </div>
        </div>

        {/* Messages */}
        <div className="p-5 space-y-4 min-h-[220px] max-h-[380px] overflow-y-auto">
          <AnimatePresence initial={false}>
            {messages.map((msg) =>
              msg.from === 'bot' ? (
                <BotBubble
                  key={msg.id}
                  msg={msg}
                  onPasswordSuccess={handleLoginSuccess}
                  onSelectUser={handleSelectUser}
                  loginDone={loginDone}
                />
              ) : (
                <UserBubble key={msg.id} text={msg.text || ''} />
              )
            )}
          </AnimatePresence>

          {isTyping && (
            <motion.div key="typing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <TypingDots />
            </motion.div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Text input (name step only) */}
        <AnimatePresence>
          {showInput && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="px-4 pb-4 overflow-hidden"
            >
              <div
                className="flex gap-2 items-center rounded-2xl p-1.5 border border-white/10"
                style={{ background: 'rgba(255,255,255,0.07)' }}
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleNameSubmit()}
                  placeholder="اكتب اسمك..."
                  dir="rtl"
                  autoComplete="off"
                  className="flex-1 bg-transparent text-white placeholder-white/30 text-sm px-3 outline-none"
                />
                <button
                  onClick={handleNameSubmit}
                  disabled={input.trim().length < 2}
                  className="shrink-0 text-white rounded-xl px-4 py-2 text-sm font-semibold transition-all disabled:opacity-30 hover:opacity-90 active:scale-95"
                  style={{ background: '#D72B2B' }}
                >
                  إرسال
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <p className="text-white/20 text-xs mt-8 select-none">
        GCHV Egypt · VRF & HVAC Solutions · 2026
      </p>
    </div>
  );
}
