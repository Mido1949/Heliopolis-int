'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

interface Step {
  /** Page the step lives on; the tour navigates there first. */
  path?: string;
  /** CSS selector of the element to point at; none = a centred note. */
  target?: string;
  title: string;
  text: string;
  /** "التالي" taps the element for the user (opens a lead, a tab, a page…). */
  click?: boolean;
  /** Skipped when the element isn't there (no leads yet, chat window closed…). */
  optional?: boolean;
}

const T = (name: string) => `[data-tour="${name}"]`;

const STEPS: Step[] = [
  { path: '/my-leads', title: 'أهلاً بيك في HelioMax 👋', text: 'جولة سريعة (دقيقتين) في أهم حاجات هتستخدمها كل يوم. تقدر تتخطاها في أي وقت.' },
  { path: '/my-leads', target: T('myday'), title: 'يومي', text: 'هنا العملاء اللي محتاجين منك إجراء النهارده: متأخرين في مرحلتهم أو ليهم متابعة مستحقة. ابدأ يومك من هنا.' },
  { path: '/my-leads', target: T('lead-search'), title: 'دوّر على عميل', text: 'ابحث بالاسم أو الرقم أو الشركة، أو فلتر بالمرحلة والمنطقة.' },
  { path: '/my-leads', target: T('lead-view'), click: true, optional: true, title: 'كارت العميل', text: 'اضغط على العين 👁 عشان تفتح كارت العميل. يلا نفتح واحد سوا.' },
  { target: T('lead-details'), optional: true, title: 'مرحلة العميل', text: 'من «مرحلة القمع» غيّر مرحلة العميل كل ما يتحرك: جديد ← تواصل ← تفاوض ← تم البيع. ده اللي بيقيس شغلك.' },
  { target: T('tab-whatsapp'), click: true, optional: true, title: 'واتساب العميل', text: 'محادثة العميل كلها هنا، وتقدر ترد عليه من غير ما تمسك الموبايل.' },
  { target: T('tab-activity'), click: true, optional: true, title: 'النشاط والملاحظات', text: 'سجّل كل مكالمة أو ملاحظة هنا، عشان أي حد في الفريق يعرف وصلنا مع العميل لفين.' },
  { target: '.ant-drawer-open .ant-drawer-close', click: true, optional: true, title: 'اقفل الكارت', text: 'من هنا تقفل الكارت وترجع للقائمة.' },
  { path: '/my-leads', target: T('new-lead'), title: 'عميل جديد', text: 'سجّل أي عميل جديد من هنا. لو الرقم متسجل قبل كده السيستم هينبهك، فمتعملش عميل مكرر.' },
  { target: T('nav-whatsapp'), click: true, title: 'صندوق واتساب', text: 'كل محادثات واتساب الشركة في مكان واحد. يلا نفتحه.' },
  { path: '/whatsapp', target: T('wa-list'), title: 'المحادثات', text: 'الأحدث فوق. النقطة الخضرا = العميل مستني رد، و«مستني رد» بيعرض دول بس.' },
  { path: '/whatsapp', target: T('wa-chat'), click: true, optional: true, title: 'افتح محادثة', text: 'اضغط على أي محادثة تفتحها.' },
  { path: '/whatsapp', target: T('wa-menu'), optional: true, title: 'رد وإعادة توجيه', text: 'السهم ▾ على أي رسالة: رد على رسالة معينة، إعادة توجيه لعميل تاني، نسخ أو تحميل. ودبل كليك على الرسالة = رد سريع.' },
  { path: '/whatsapp', target: T('wa-composer'), optional: true, title: 'اكتب ردك', text: 'اكتب هنا و Enter للإرسال، و📎 للصور والملفات. الرد مجاني لمدة 24 ساعة من آخر رسالة من العميل؛ بعدها ابعتله من الموبايل.' },
  { target: T('nav-files'), click: true, title: 'الملفات', text: 'كتالوجات، قوائم أسعار، رسومات DWG وملفات RAR، كلها في مكان واحد للفريق كله.' },
  { path: '/files', target: T('files-upload'), title: 'ارفع ملف', text: 'اختار التصنيف وبعدين «Upload File». بيقبل PDF وصور وExcel وWord وDWG وRAR.' },
  { path: '/files', target: T('files-table'), title: 'افتح ملف', text: 'اضغط على اسم الملف: الصور والـ PDF بتتفتح هنا، وباقي الملفات بتتحمل على جهازك.' },
  { target: T('tour-help'), title: 'خلصنا 🎉', text: 'تقدر تعيد الجولة في أي وقت من زرار ❓ ده.' },
];

const DONE_KEY = 'hm-tour-v1:';
const PAD = 6;
const CARD_W = 320;

function visible(el: Element | null): el is HTMLElement {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

function find(selector: string): HTMLElement | null {
  const all = Array.from(document.querySelectorAll(selector));
  return (all.find(visible) as HTMLElement | undefined) ?? null;
}

/**
 * First-run walkthrough: the screen dims except the element being explained,
 * a hand glides to it and taps, and a note says what it is for. Runs once per
 * user per browser; the ❓ in the navbar replays it.
 */
export default function ProductTour() {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [index, setIndex] = useState<number | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [searching, setSearching] = useState(false);
  const [tapping, setTapping] = useState(false);
  const dir = useRef<1 | -1>(1);
  const el = useRef<HTMLElement | null>(null);

  const finish = useCallback(() => {
    try { if (user) localStorage.setItem(DONE_KEY + user.id, '1'); } catch { /* private mode */ }
    setIndex(null);
    setRect(null);
  }, [user]);

  // Start on first visit, and whenever the ❓ button asks.
  useEffect(() => {
    if (!user) return;
    let seen = true;
    try { seen = localStorage.getItem(DONE_KEY + user.id) === '1'; } catch { /* private mode */ }
    const timer = seen ? null : setTimeout(() => { dir.current = 1; setIndex(0); }, 1500);
    const replay = () => { dir.current = 1; setIndex(0); };
    window.addEventListener('heliomax:tour', replay);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('heliomax:tour', replay);
    };
  }, [user]);

  const step = index === null ? null : STEPS[index];

  // Go to the step's page, then wait for its element to render.
  useEffect(() => {
    if (index === null || !step) return;
    el.current = null;
    setRect(null);
    if (step.path && pathname !== step.path) {
      router.push(step.path);
      return;
    }
    if (!step.target) return;
    setSearching(true);
    let tries = 0;
    const timer = setInterval(() => {
      const found = find(step.target!);
      if (found) {
        clearInterval(timer);
        setSearching(false);
        found.scrollIntoView({ block: 'center', behavior: 'smooth' });
        el.current = found;
        setTimeout(() => setRect(found.getBoundingClientRect()), 350);
      } else if (++tries > 30) {
        clearInterval(timer);
        setSearching(false);
        // Nothing to show here (no leads yet, closed chat…): move on.
        if (step.optional) {
          const next = index + dir.current;
          if (next < 0 || next >= STEPS.length) finish();
          else setIndex(next);
        }
      }
    }, 150);
    return () => clearInterval(timer);
  }, [index, step, pathname, router, finish]);

  // Follow the element while the page scrolls or resizes.
  useEffect(() => {
    if (index === null) return;
    const follow = () => { if (el.current?.isConnected) setRect(el.current.getBoundingClientRect()); };
    window.addEventListener('resize', follow);
    window.addEventListener('scroll', follow, true);
    const timer = setInterval(follow, 400);
    return () => {
      window.removeEventListener('resize', follow);
      window.removeEventListener('scroll', follow, true);
      clearInterval(timer);
    };
  }, [index]);

  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') finish(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, finish]);

  if (index === null || !step) return null;

  const last = index === STEPS.length - 1;
  const next = () => {
    dir.current = 1;
    if (last) return finish();
    if (step.click && el.current) {
      // Show the tap, then do it for them.
      setTapping(true);
      const target = el.current;
      setTimeout(() => {
        target.click();
        setTapping(false);
        setTimeout(() => setIndex(index + 1), 500);
      }, 600);
      return;
    }
    setIndex(index + 1);
  };
  const back = () => {
    dir.current = -1;
    // Steps before a tap assume the page as it was; restart that part from its page.
    setIndex(Math.max(0, index - 1));
  };

  const vw = typeof window === 'undefined' ? 1200 : window.innerWidth;
  const vh = typeof window === 'undefined' ? 800 : window.innerHeight;
  const centred = !step.target || !rect;

  // The note sits under the element, or above it when there's no room.
  let cardTop = vh / 2 - 90;
  let cardLeft = vw / 2 - Math.min(CARD_W, vw - 32) / 2;
  if (!centred && rect) {
    const below = rect.bottom + PAD + 70;
    cardTop = below + 170 < vh ? below : Math.max(16, rect.top - PAD - 200);
    cardLeft = Math.min(Math.max(16, rect.left + rect.width / 2 - CARD_W / 2), vw - Math.min(CARD_W, vw - 32) - 16);
  }
  const handX = rect ? rect.left + rect.width / 2 - 14 : vw / 2;
  const handY = rect ? rect.top + rect.height / 2 : vh / 2;

  return (
    <div dir="rtl" style={{ position: 'fixed', inset: 0, zIndex: 10050 }}>
      <style>{`
        @keyframes hm-tour-tap { 0%,100% { transform: translateY(0) scale(1) } 50% { transform: translateY(-6px) scale(1.05) } }
        @keyframes hm-tour-press { 0% { transform: scale(1) } 40% { transform: scale(.8) translateY(4px) } 100% { transform: scale(1) } }
        @keyframes hm-tour-ring { 0% { transform: scale(.3); opacity: .9 } 100% { transform: scale(2.2); opacity: 0 } }
        @keyframes hm-tour-in { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
      `}</style>

      {/* Blocks stray clicks during the tour; the dimming comes from the spotlight. */}
      <div style={{ position: 'absolute', inset: 0, background: centred ? 'rgba(15,23,42,.6)' : 'transparent' }} />

      {!centred && rect && (
        <div
          style={{
            position: 'fixed',
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            borderRadius: 12,
            boxShadow: '0 0 0 9999px rgba(15,23,42,.6), 0 0 0 3px #25D366',
            transition: 'all .45s ease',
            pointerEvents: 'none',
          }}
        />
      )}

      {!centred && rect && (
        <div
          style={{
            position: 'fixed',
            top: handY,
            left: handX,
            transition: 'top .7s cubic-bezier(.4,1.4,.6,1), left .7s cubic-bezier(.4,1.4,.6,1)',
            pointerEvents: 'none',
          }}
        >
          <span
            style={{
              position: 'absolute', top: -10, left: 4, width: 22, height: 22, borderRadius: '50%',
              border: '3px solid #25D366', animation: 'hm-tour-ring 1.4s ease-out infinite',
            }}
          />
          <span
            style={{
              display: 'block', fontSize: 34, lineHeight: 1, filter: 'drop-shadow(0 3px 4px rgba(0,0,0,.35))',
              animation: tapping ? 'hm-tour-press .5s ease' : 'hm-tour-tap 1.4s ease-in-out infinite',
            }}
          >
            👆
          </span>
        </div>
      )}

      <div
        key={index}
        style={{
          position: 'fixed', top: cardTop, left: cardLeft, width: Math.min(CARD_W, vw - 32),
          transition: 'top .45s ease, left .45s ease', animation: 'hm-tour-in .35s ease',
        }}
        className="rounded-2xl bg-white p-4 shadow-2xl"
      >
        <div className="mb-1 flex items-center justify-between">
          <span className="text-base font-bold text-[#0D2137]">{step.title}</span>
          <span className="text-[11px] text-slate-400" dir="ltr">{index + 1} / {STEPS.length}</span>
        </div>
        <p className="mb-3 text-sm leading-relaxed text-slate-600">
          {searching ? 'لحظة…' : step.text}
        </p>
        <div className="mb-3 h-1 overflow-hidden rounded bg-slate-100">
          <div className="h-full bg-[#25D366] transition-all" style={{ width: `${((index + 1) / STEPS.length) * 100}%` }} />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={finish} className="text-xs text-slate-400 hover:text-slate-600">تخطي الجولة</button>
          <span className="flex-1" />
          {index > 0 && (
            <button onClick={back} disabled={tapping} className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
              السابق
            </button>
          )}
          <button
            onClick={next}
            disabled={tapping || searching}
            className="rounded-lg bg-[#25D366] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#1fb857] disabled:opacity-60"
          >
            {index === 0 ? 'يلا نبدأ' : last ? 'تمام' : 'التالي'}
          </button>
        </div>
      </div>
    </div>
  );
}
