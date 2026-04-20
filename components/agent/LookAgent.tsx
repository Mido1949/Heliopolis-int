'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { usePathname } from 'next/navigation';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Msg { role: 'user' | 'assistant'; content: string; }

// ── CSS ───────────────────────────────────────────────────────────────────────
const STYLES = `
  .lk-eye { transform-box:fill-box; transform-origin:center;
             animation:lkBlink 4s ease-in-out infinite; }
  .lk-eye-r { animation-delay:0.5s; }

  .lk-dot { display:inline-block; animation:lkDotBounce 1.1s ease-in-out infinite; }
  .lk-dot:nth-child(2) { animation-delay:0.18s; }
  .lk-dot:nth-child(3) { animation-delay:0.36s; }

  .lk-avatar-idle { animation:lkPulse 2.8s ease-in-out infinite; }
  .lk-avatar-idle:hover { transform:scale(1.08); transition:transform 0.15s; }

  .lk-pop { animation:lkFadeUp 0.26s cubic-bezier(.16,1,.3,1) forwards; }
  .lk-pop-down { animation:lkFadeDown 0.2s ease-in forwards; }

  @keyframes lkBlink    { 0%,86%,100%{transform:scaleY(1)} 90%{transform:scaleY(0.08)} }
  @keyframes lkDotBounce{ 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-5px)} }
  @keyframes lkPulse    { 0%,100%{box-shadow:0 4px 16px rgba(245,166,35,.35)}
                           50%{box-shadow:0 4px 24px rgba(245,166,35,.65)} }
  @keyframes lkFadeUp   { from{opacity:0;transform:translateY(10px) scale(.95)}
                           to{opacity:1;transform:translateY(0) scale(1)} }
  @keyframes lkFadeDown { from{opacity:1;transform:translateY(0) scale(1)}
                           to{opacity:0;transform:translateY(10px) scale(.95)} }
`;

// ── Female Call-Centre Agent Avatar SVG ───────────────────────────────────────
function AgentAvatar({ size = 56 }: { size?: number }) {
  return (
    <svg viewBox="0 0 56 56" width={size} height={size} style={{ display: 'block', borderRadius: '50%' }}>
      {/* Amber background */}
      <circle cx="28" cy="28" r="28" fill="#F5A623" />

      {/* Hair — black bob: top dome + side panels */}
      <path d="M12 27 Q12 8 28 8 Q44 8 44 27 L44 22 Q44 6 28 6 Q12 6 12 22 Z" fill="#1C1A17" />
      {/* Side hair left */}
      <rect x="11" y="21" width="5.5" height="17" rx="2.5" fill="#1C1A17" />
      {/* Side hair right */}
      <rect x="39.5" y="21" width="5.5" height="17" rx="2.5" fill="#1C1A17" />

      {/* Face / skin */}
      <ellipse cx="28" cy="33" rx="14" ry="16" fill="#FDCBA0" />

      {/* Headset band over hair */}
      <path d="M13 22 Q28 13 43 22" stroke="#2C2C2C" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      {/* Left ear cup */}
      <ellipse cx="12.5" cy="24.5" rx="4" ry="5" fill="#2C2C2C" />
      <ellipse cx="12.5" cy="24.5" rx="2.3" ry="3.2" fill="#555" />
      {/* Mic boom arm */}
      <path d="M12.5 30 Q8 35 9 40" stroke="#2C2C2C" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      {/* Mic capsule */}
      <ellipse cx="9.2" cy="41.5" rx="2.2" ry="2.8" fill="#2C2C2C" />

      {/* Eyes */}
      <ellipse cx="22.5" cy="31" rx="2.6" ry="2.8" fill="#2C2C2C" className="lk-eye" />
      <ellipse cx="33.5" cy="31" rx="2.6" ry="2.8" fill="#2C2C2C" className="lk-eye lk-eye-r" />
      {/* Eye shine */}
      <circle cx="23.4" cy="29.8" r="0.85" fill="white" />
      <circle cx="34.4" cy="29.8" r="0.85" fill="white" />

      {/* Rosy cheeks */}
      <circle cx="18"  cy="36" r="4.5" fill="#FFB3B3" opacity="0.38" />
      <circle cx="38"  cy="36" r="4.5" fill="#FFB3B3" opacity="0.38" />

      {/* Smile */}
      <path d="M22 39 Q28 45.5 34 39" stroke="#C07878" strokeWidth="1.8" fill="none" strokeLinecap="round" />

      {/* Collar / neckline hint */}
      <path d="M20 49 Q28 52 36 49" stroke="#D4A87A" strokeWidth="1.2" fill="none" />
    </svg>
  );
}

// ── Speech Bubble (above avatar) ──────────────────────────────────────────────
function Bubble({ text, fading, onClose, isRtl }: {
  text: string; fading: boolean; onClose: () => void; isRtl: boolean;
}) {
  return (
    <div
      className={fading ? 'lk-pop-down' : 'lk-pop'}
      style={{
        position: 'absolute',
        bottom: 70,
        [isRtl ? 'right' : 'left']: 0,
        width: 210,
        background: '#0D2137',
        border: '1.5px solid #F5A623',
        borderRadius: 12,
        padding: '10px 30px 10px 12px',
        color: 'white',
        fontSize: 13,
        lineHeight: 1.5,
        direction: 'rtl',
        textAlign: 'right',
        boxShadow: '0 6px 24px rgba(0,0,0,0.25)',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        pointerEvents: 'auto',
        zIndex: 10002,
      }}
    >
      <button
        onClick={onClose}
        aria-label="إغلاق"
        style={{
          position: 'absolute', top: 6, left: 8,
          color: '#aaa', background: 'none', border: 'none',
          cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: 0,
        }}
      >×</button>
      {text}
      {/* Tail pointing down toward avatar */}
      <span style={{
        position: 'absolute',
        bottom: -7,
        [isRtl ? 'right' : 'left']: 20,
        width: 0, height: 0,
        borderLeft: '7px solid transparent',
        borderRight: '7px solid transparent',
        borderTop: '7px solid #F5A623',
        display: 'block',
      }} />
    </div>
  );
}

// ── Chat Panel ────────────────────────────────────────────────────────────────
function ChatPanel({ messages, input, setInput, onSend, sending, onClose, isRtl }: {
  messages: Msg[]; input: string; setInput: (v: string) => void;
  onSend: () => void; sending: boolean; onClose: () => void; isRtl: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  return (
    <div
      className="lk-pop"
      style={{
        position: 'fixed',
        bottom: 90,
        [isRtl ? 'right' : 'left']: 24,
        width: 300,
        maxHeight: 420,
        background: '#0D2137',
        border: '1.5px solid #F5A623',
        borderRadius: 18,
        overflow: 'hidden',
        boxShadow: '0 12px 48px rgba(0,0,0,0.45)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 10001,
        pointerEvents: 'auto',
      }}
    >
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #D72B2B 0%, #a01f1f 100%)',
        padding: '10px 14px',
        display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        borderBottom: '1px solid rgba(255,255,255,0.1)',
      }}>
        <div style={{ borderRadius: '50%', overflow: 'hidden', flexShrink: 0, border: '2px solid #F5A623' }}>
          <AgentAvatar size={36} />
        </div>
        <div style={{ flex: 1, direction: 'rtl' }}>
          <div style={{ color: 'white', fontWeight: 700, fontSize: 13 }}>لوك — المساعد الذكي</div>
          <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11 }}>LOOMARK · GCHV Egypt</div>
        </div>
        <button onClick={onClose} style={{
          color: 'rgba(255,255,255,0.7)', background: 'none', border: 'none',
          cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 0, flexShrink: 0,
        }}>×</button>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '12px 10px',
        display: 'flex', flexDirection: 'column', gap: 8,
        scrollbarWidth: 'thin', scrollbarColor: '#1a3a5c transparent',
      }}>
        {messages.map((m, i) => (
          <div key={i} style={{
            alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
            maxWidth: '86%',
            background: m.role === 'user' ? '#D72B2B' : '#1a3a5c',
            color: 'white',
            borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
            padding: '8px 12px',
            fontSize: 13,
            lineHeight: 1.5,
            direction: 'rtl',
            textAlign: 'right',
            wordBreak: 'break-word',
          }}>{m.content}</div>
        ))}

        {/* Thinking dots */}
        {sending && (
          <div style={{
            alignSelf: 'flex-start',
            background: '#1a3a5c',
            borderRadius: '14px 14px 14px 4px',
            padding: '10px 16px',
            display: 'flex', gap: 5, alignItems: 'center',
          }}>
            <span className="lk-dot" style={{ color: '#F5A623', fontSize: 20 }}>•</span>
            <span className="lk-dot" style={{ color: '#F5A623', fontSize: 20 }}>•</span>
            <span className="lk-dot" style={{ color: '#F5A623', fontSize: 20 }}>•</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div style={{
        display: 'flex', gap: 6, padding: '8px 10px',
        borderTop: '1px solid #1a3a5c', flexShrink: 0, background: '#0a1929',
      }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !sending && input.trim()) onSend(); }}
          placeholder="اكتب سؤالك هنا..."
          disabled={sending}
          style={{
            flex: 1, background: '#1a3a5c', border: '1px solid #2a4a6c',
            borderRadius: 10, padding: '8px 11px', color: 'white', fontSize: 13,
            outline: 'none', direction: 'rtl', textAlign: 'right',
            transition: 'border-color 0.15s',
          }}
          onFocus={e => (e.target.style.borderColor = '#F5A623')}
          onBlur={e => (e.target.style.borderColor = '#2a4a6c')}
        />
        <button
          onClick={onSend}
          disabled={sending || !input.trim()}
          style={{
            background: input.trim() && !sending ? '#F5A623' : '#1a3a5c',
            border: 'none', borderRadius: 10, padding: '0 12px',
            cursor: sending || !input.trim() ? 'not-allowed' : 'pointer',
            color: input.trim() && !sending ? '#0D2137' : '#555',
            transition: 'background 0.15s, color 0.15s',
            display: 'flex', alignItems: 'center', flexShrink: 0,
          }}
          aria-label="إرسال"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function LookAgent() {
  const { profile } = useAuth();
  const pathname    = usePathname();

  const [isRtl,       setIsRtl]       = useState(true);
  const [chatOpen,    setChatOpen]    = useState(false);
  const [bubble,      setBubble]      = useState<string | null>(null);
  const [bubbleFading,setBubbleFading]= useState(false);
  const [messages,    setMessages]    = useState<Msg[]>([]);
  const [input,       setInput]       = useState('');
  const [sending,     setSending]     = useState(false);

  const hasGreetedRef = useRef(false);

  // Detect page direction
  useEffect(() => {
    setIsRtl(document.documentElement.dir !== 'ltr');
  }, []);

  // ── Claude API ─────────────────────────────────────────────────────────────
  const callClaude = useCallback(async (msgs: Msg[], system: string): Promise<string> => {
    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: msgs, system }),
      });
      const data = await res.json();
      return data.content ?? 'عذراً، حصل خطأ!';
    } catch {
      return 'عذراً، مش قادر أوصل للسيرفر!';
    }
  }, []);

  // ── Greeting on profile load ───────────────────────────────────────────────
  useEffect(() => {
    if (!profile || hasGreetedRef.current) return;
    hasGreetedRef.current = true;

    const PAGE_LABELS: Record<string, string> = {
      '/dashboard':    'لوحة التحكم',
      '/crm':          'إدارة الليدات',
      '/boq':          'عروض الأسعار',
      '/reports':      'التقارير والأهداف',
      '/inventory':    'المخزون',
      '/email':        'حملات البريد',
      '/calls':        'المكالمات',
      '/time-tracker': 'تتبع الوقت',
      '/ai-assistant': 'المساعد الذكي',
    };
    const page = Object.entries(PAGE_LABELS).find(([k]) => pathname?.startsWith(k))?.[1] ?? 'النظام';

    const system = `أنت "لوك"، المساعدة الذكية لـ LOOMARK في شركة GCHV Egypt — متخصصة في HVAC والتكييف.
اتكلمي بالعربية المصرية العامية. ردودك ودية، موجزة، مفيدة (جملتين أو تلاتة بحد أقصى).
اسم المستخدم: ${profile.name} | دوره: ${profile.role} | الصفحة: ${page}.`;

    const greet: Msg = {
      role: 'user',
      content: `رحّبي بـ${profile.name} وسأليه بشكل ودود هيشتغل على إيه النهاردة. الصفحة الحالية: ${page}.`,
    };

    callClaude([greet], system).then(reply => {
      setBubble(reply);
      setBubbleFading(false);
      setMessages([{ role: 'assistant', content: reply }]);

      const t = setTimeout(() => {
        setBubbleFading(true);
        setTimeout(() => setBubble(null), 240);
      }, 7000);
      return () => clearTimeout(t);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  // ── Send chat message ──────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    if (!input.trim() || sending) return;

    const userMsg: Msg = { role: 'user', content: input.trim() };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput('');
    setSending(true);

    const system = `أنت "لوك"، المساعدة الذكية لـ LOOMARK / GCHV Egypt (HVAC وتكييف).
تكلمي بالعربية المصرية العامية. إجاباتك مفيدة وموجزة (3 جمل بحد أقصى).
الصفحة الحالية: ${pathname}. اسم المستخدم: ${profile?.name ?? 'زميل'}.`;

    const reply = await callClaude(next, system);
    setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    setSending(false);
  }, [input, sending, messages, pathname, profile?.name, callClaude]);

  // ── Toggle chat ────────────────────────────────────────────────────────────
  const toggleChat = useCallback(() => {
    if (chatOpen) {
      setChatOpen(false);
    } else {
      setBubble(null);
      setChatOpen(true);
    }
  }, [chatOpen]);

  const closeBubble = useCallback(() => {
    setBubbleFading(true);
    setTimeout(() => setBubble(null), 240);
  }, []);

  const side = isRtl ? 'right' : 'left';

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />

      {/* Chat panel — rendered outside avatar container so it doesn't clip */}
      {chatOpen && (
        <ChatPanel
          messages={messages}
          input={input}
          setInput={setInput}
          onSend={handleSend}
          sending={sending}
          onClose={toggleChat}
          isRtl={isRtl}
        />
      )}

      {/* Avatar container — fixed bottom corner */}
      <div
        style={{
          position: 'fixed',
          bottom: 24,
          [side]: 24,
          zIndex: 10000,
          pointerEvents: 'none',
          display: 'flex',
          flexDirection: 'column',
          alignItems: side === 'right' ? 'flex-end' : 'flex-start',
        }}
      >
        {/* Speech bubble (only when chat is closed) */}
        {bubble && !chatOpen && (
          <Bubble text={bubble} fading={bubbleFading} onClose={closeBubble} isRtl={isRtl} />
        )}

        {/* Avatar button */}
        <button
          onClick={toggleChat}
          aria-label="تحدث مع لوك"
          className={!chatOpen ? 'lk-avatar-idle' : ''}
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            border: `2.5px solid ${chatOpen ? '#D72B2B' : '#F5A623'}`,
            padding: 0,
            cursor: 'pointer',
            overflow: 'hidden',
            background: 'transparent',
            pointerEvents: 'auto',
            transition: 'border-color 0.2s, transform 0.15s',
            display: 'block',
            flexShrink: 0,
          }}
        >
          <AgentAvatar size={56} />
        </button>
      </div>
    </>
  );
}
