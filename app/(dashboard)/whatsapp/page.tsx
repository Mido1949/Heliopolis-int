'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Empty, Select, Spin, message } from 'antd';
import dayjs from 'dayjs';
import { IBM_Plex_Sans_Arabic } from 'next/font/google';
import { createClient } from '@/lib/supabase/client';
import WhatsAppThread from '../crm/WhatsAppThread';
import { useAuth } from '@/context/AuthContext';
import { PIPELINE_STAGES } from '@/lib/constants';

const plex = IBM_Plex_Sans_Arabic({ subsets: ['arabic', 'latin'], weight: ['400', '500', '600', '700'], display: 'swap' });

interface Row {
  lead_id: string;
  direction: 'in' | 'out';
  body: string | null;
  sent_at: string;
  lead: {
    name: string | null;
    phone_normalized: string | null;
    assigned_to_user: string | null;
    pipeline_stage: string | null;
    source: string | null;
  } | null;
}

interface Conversation {
  leadId: string;
  name: string;
  phone: string;
  owner: string | null;
  stage: string | null;
  source: string | null;
  last: Row;
  lastInAt: string | null;
  firstAt: string;
}

type Tab = 'waiting' | 'mine' | 'all';

const WINDOW_MS = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;


/** Share of the 24-hour free-reply window still left, 0 when closed. */
function windowLeft(lastInAt: string | null): number {
  if (!lastInAt) return 0;
  return Math.max(0, WINDOW_MS - (Date.now() - new Date(lastInAt).getTime()));
}

/** "١٤ د" / "٣ س" style age, the way the team says it. */
function age(iso: string): string {
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} د`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} س`;
  return `${Math.round(hrs / 24)} يوم`;
}

/**
 * Team inbox for the 360dialog number: one row per lead, newest first.
 * "Waiting" = the customer wrote last. Lead RLS decides which chats a rep sees.
 * The ring around each avatar is the 24-hour window Meta allows free replies in,
 * read like a thermostat: cool while there is time, hot as it closes.
 */
export default function WhatsAppInboxPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('waiting');
  const [q, setQ] = useState('');
  const { user } = useAuth();
  const [people, setPeople] = useState<{ id: string; name: string }[]>([]);
  const [transferring, setTransferring] = useState(false);
  const [, setTick] = useState(0);

  const load = useCallback(async () => {
    const { data } = await createClient()
      .from('wa_messages')
      .select('lead_id, direction, body, sent_at, lead:leads(name, phone_normalized, assigned_to_user, pipeline_stage, source)')
      .not('lead_id', 'is', null)
      .order('sent_at', { ascending: false })
      .limit(500);
    setRows((data as unknown as Row[]) ?? []);
  }, []);

  // A push or bell link can open a chat directly: /whatsapp?lead=<id>
  useEffect(() => {
    const lead = new URLSearchParams(window.location.search).get('lead');
    if (lead) setSelected(lead);
  }, []);

  // Rings and "waiting" ages move with the clock, not only with new messages.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!user) return;
    createClient()
      .from('profiles')
      .select('id, name')
      .order('name')
      .then(({ data }) => setPeople(((data ?? []) as { id: string; name: string | null }[])
        .filter((p) => p.name)
        .map((p) => ({ id: p.id, name: p.name as string }))));
  }, [user]);

  useEffect(() => {
    const supabase = createClient();
    load();
    // Each open inbox re-ran the full query on every insert and exhausted the
    // Nano disk-IO budget (2026-10-18). Coalesce bursts; skip hidden tabs.
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stale = false;
    const schedule = () => {
      if (document.hidden) { stale = true; return; }
      if (timer) return;
      timer = setTimeout(() => { timer = null; load(); }, 5000);
    };
    const onVisible = () => {
      if (!document.hidden && stale) { stale = false; load(); }
    };
    document.addEventListener('visibilitychange', onVisible);
    const channel = supabase
      .channel('wa-inbox')
      .on('broadcast', { event: 'wa_insert' }, schedule)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      supabase.removeChannel(channel);
    };
  }, [load]);

  const conversations = useMemo(() => {
    const byLead = new Map<string, Conversation>();
    for (const r of rows ?? []) {
      let c = byLead.get(r.lead_id);
      if (!c) {
        c = {
          leadId: r.lead_id,
          name: r.lead?.name || r.lead?.phone_normalized || '—',
          phone: r.lead?.phone_normalized ?? '',
          owner: r.lead?.assigned_to_user ?? null,
          stage: r.lead?.pipeline_stage ?? null,
          source: r.lead?.source ?? null,
          last: r,
          lastInAt: null,
          firstAt: r.sent_at,
        };
        byLead.set(r.lead_id, c);
      }
      if (!c.lastInAt && r.direction === 'in') c.lastInAt = r.sent_at;
      c.firstAt = r.sent_at; // rows run newest first, so the last one seen is the oldest
    }
    return Array.from(byLead.values());
  }, [rows]);

  const nameOf = (id: string | null) => (id ? people.find((p) => p.id === id)?.name ?? '—' : null);

  const waitingCount = conversations.filter((c) => c.last.direction === 'in').length;
  const visible = conversations.filter((c) => {
    if (tab === 'waiting' && c.last.direction !== 'in') return false;
    if (tab === 'mine' && c.owner !== user?.id) return false;
    if (!q) return true;
    const s = q.toLowerCase();
    return c.name.toLowerCase().includes(s) || c.phone.includes(s);
  });
  const current = conversations.find((c) => c.leadId === selected) ?? null;

  // Opened from a lead card before the customer ever wrote: no inbox row yet,
  // so read the name and number from the lead itself.
  const [bare, setBare] = useState<{ name: string; phone: string } | null>(null);
  useEffect(() => {
    setBare(null);
    if (!selected || current || rows === null) return;
    createClient()
      .from('leads')
      .select('name, phone_normalized')
      .eq('id', selected)
      .maybeSingle()
      .then(({ data }) => data && setBare({ name: data.name ?? '', phone: data.phone_normalized ?? '' }));
  }, [selected, current, rows]);
  const headName = current?.name ?? bare?.name ?? '';
  const headPhone = current?.phone ?? bare?.phone;

  const transfer = async (to: string) => {
    if (!selected) return;
    setTransferring(true);
    try {
      const res = await fetch(`/api/leads/${selected}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || res.statusText);
      message.success(`اتحولت لـ ${json.name ?? ''}`);
      setSelected(null);
      load();
    } catch (e) {
      message.error(`فشل التحويل: ${(e as Error).message}`);
    } finally {
      setTransferring(false);
    }
  };

  // Phones: an open chat is a screen of its own, so the phone's back button
  // closes it instead of leaving the inbox.
  const openChat = (id: string) => {
    if (window.matchMedia('(max-width: 767px)').matches && !history.state?.waChat) {
      history.pushState({ ...history.state, waChat: true }, '');
    }
    setSelected(id);
  };
  const closeChat = () => {
    if (history.state?.waChat) history.back();
    else setSelected(null);
  };
  // The floating Helio button would sit on the send button of a full-screen chat.
  useEffect(() => {
    document.body.classList.toggle('wa-chat-open', !!selected);
    return () => document.body.classList.remove('wa-chat-open');
  }, [selected]);
  useEffect(() => {
    const onPop = () => { if (!history.state?.waChat) setSelected(null); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const transferOptions = people.filter((p) => p.id !== user?.id).map((p) => ({ value: p.id, label: p.name }));

  return (
    <div className={`${plex.className} flex h-[calc(100dvh-6rem)] overflow-hidden rounded-xl md:h-[calc(100vh-4rem)] border border-[#E1E7EC] bg-white text-[#18232F]`} dir="rtl">
      {/* Chat list */}
      <aside data-tour="wa-list" className={`${selected ? 'hidden md:flex' : 'flex'} w-full md:w-[340px] shrink-0 flex-col border-e border-[#E1E7EC]`}>
        <div className="space-y-3 px-4 pb-3 pt-4">
          <h1 className="hidden text-xl font-bold text-[#0D2137] md:block">واتساب</h1>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="دوّر باسم أو رقم"
            className="w-full rounded-xl border border-[#E1E7EC] bg-[#F3F6F8] px-3 py-2.5 text-[16px] outline-none focus:border-[#1B3A5C] md:rounded-lg md:py-2 md:text-sm"
          />
          <div role="tablist" className="flex gap-1 rounded-lg bg-[#F3F6F8] p-1">
            {([
              ['waiting', 'مستني رد'],
              ['mine', 'بتوعي'],
              ['all', 'الكل'],
            ] as [Tab, string][]).map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={`flex-1 rounded-md py-2 text-[14px] md:py-1.5 md:text-[13px] ${tab === key ? 'bg-white font-semibold text-[#0D2137] shadow-sm' : 'text-[#6B7A88]'}`}
              >
                {label}
                {key === 'waiting' && waitingCount > 0 && (
                  <span className="ms-1.5 inline-block min-w-[20px] rounded-full bg-[#C9423A] px-1.5 text-[11px] font-semibold text-white">{waitingCount}</span>
                )}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {rows === null ? (
            <div className="py-8 text-center"><Spin /></div>
          ) : visible.length === 0 ? (
            <Empty className="py-8" description={tab === 'waiting' ? 'مفيش حد مستني رد' : 'مفيش محادثات'} />
          ) : (
            visible.map((c) => {
              const waiting = c.last.direction === 'in';
              const owner = nameOf(c.owner);
              return (
                <button
                  data-tour="wa-chat"
                  key={c.leadId}
                  onClick={() => openChat(c.leadId)}
                  className={`flex w-full items-center gap-3 border-b border-[#F0F3F6] px-4 py-3 text-right hover:bg-[#F8FAFB] md:py-2.5 ${
                    selected === c.leadId ? 'bg-[#EEF4FA] shadow-[inset_-3px_0_0_#0D2137]' : ''
                  }`}
                >
                  <Dial name={c.name} msLeft={windowLeft(c.lastInAt)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={`truncate text-[16px] md:text-sm ${waiting ? 'font-semibold' : 'font-medium'}`}>{c.name}</span>
                      {waiting ? (
                        <span className="shrink-0 text-[11px] font-semibold text-[#C9423A]">مستني {age(c.last.sent_at)}</span>
                      ) : (
                        <span className="shrink-0 text-[11px] text-[#6B7A88]">{dayjs(c.last.sent_at).format('DD/MM HH:mm')}</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[14px] text-[#6B7A88] md:text-[12.5px]">
                        {c.last.direction === 'out' ? 'إنت: ' : ''}{c.last.body ?? '—'}
                      </span>
                      {owner ? (
                        <span className="shrink-0 rounded-md bg-[#EDF2F7] px-1.5 text-[11px] text-[#1B3A5C]">{owner}</span>
                      ) : (
                        <span className="shrink-0 rounded-md bg-[#FFF4E0] px-1.5 text-[11px] text-[#8A5A00]">مش متوزع</span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* Thread */}
      <section className={`${selected ? 'fixed inset-0 z-[60] flex md:static md:z-auto' : 'hidden md:flex'} min-h-0 flex-1 flex-col bg-[#EAF0F4]`}>
        {selected ? (
          <>
            <div className="flex items-center gap-2 border-b border-[#E1E7EC] bg-[#0D2137] px-2 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] text-white md:gap-3 md:bg-white md:px-5 md:pt-2.5 md:text-inherit">
              <button className="flex h-11 w-11 shrink-0 items-center justify-center text-2xl md:hidden" onClick={closeChat} aria-label="رجوع">→</button>
              <Dial name={headName} msLeft={windowLeft(current?.lastInAt ?? null)} />
              <div className="min-w-0">
                <div className="truncate text-[16px] font-semibold md:text-sm">{headName}</div>
                {headPhone && <div className="text-xs text-white/75 md:text-[#6B7A88]" dir="ltr">+{headPhone}</div>}
              </div>
              <div className="ms-auto flex items-center gap-2">
                <WindowPill msLeft={windowLeft(current?.lastInAt ?? null)} />
                <Select
                  data-tour="wa-transfer"
                  className="w-28 md:w-32 xl:hidden"
                  placeholder="تحويل لـ"
                  value={null}
                  loading={transferring}
                  disabled={transferring}
                  showSearch
                  optionFilterProp="label"
                  options={transferOptions}
                  onChange={(v) => v && transfer(v as string)}
                />
              </div>
            </div>
            <div className="min-h-0 flex-1">
              <WhatsAppThread key={selected} leadId={selected} fill />
            </div>
          </>
        ) : (
          <Empty className="m-auto" description="اختار محادثة" />
        )}
      </section>

      {/* Customer card, wide screens only */}
      {current && (
        <aside className="hidden w-[280px] shrink-0 flex-col gap-1 overflow-y-auto border-s border-[#E1E7EC] p-5 xl:flex">
          <h2 className="mb-2 text-[15px] font-semibold text-[#0D2137]">بيانات العميل</h2>
          <Field label="المسؤول">
            <Select
              className="w-full"
              value={current.owner ?? undefined}
              placeholder="مش متوزع"
              loading={transferring}
              disabled={transferring}
              showSearch
              optionFilterProp="label"
              options={people.map((p) => ({ value: p.id, label: p.name, disabled: p.id === user?.id }))}
              onChange={(v) => v && v !== current.owner && transfer(v as string)}
            />
          </Field>
          <Field label="المرحلة">
            <span className="inline-block rounded-md bg-[#EAF6FB] px-2 py-0.5 text-[12.5px] font-semibold text-[#1F6F8B]">
              {PIPELINE_STAGES.find((st) => st.value === current.stage)?.labelAr ?? current.stage ?? '—'}
            </span>
          </Field>
          <Field label="جاي منين">{current.source ?? '—'}</Field>
          <Field label="أول رسالة">{dayjs(current.firstAt).format('DD/MM/YYYY HH:mm')}</Field>
          <a
            href={`/my-leads?lead=${current.leadId}`}
            className="mt-3 block rounded-lg bg-[#0D2137] py-2 text-center text-sm text-white hover:opacity-90"
          >
            افتح العميل في الـ CRM
          </a>
          <p className="mt-4 text-xs leading-6 text-[#6B7A88]">
            الدايرة حوالين الصورة = الوقت الباقي من الـ 24 ساعة اللي ينفع نرد فيهم ببلاش.
            <br />
            <Dot color="#2E9CC0" /> وقت كفاية
            <Dot color="#E3962B" className="ms-3" /> قرب
            <Dot color="#C9423A" className="ms-3" /> هتتقفل
          </p>
        </aside>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-[#F0F3F6] py-2.5 text-sm">
      <small className="mb-1 block text-xs text-[#6B7A88]">{label}</small>
      {children}
    </div>
  );
}

function Dot({ color, className = '' }: { color: string; className?: string }) {
  return <i className={`me-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle ${className}`} style={{ background: color }} />;
}

function ringColor(msLeft: number): string {
  if (msLeft > 6 * HOUR) return '#2E9CC0';
  if (msLeft > 2 * HOUR) return '#E3962B';
  return '#C9423A';
}

/** Avatar inside a ring that empties as the 24-hour reply window runs out. */
function Dial({ name, msLeft }: { name: string; msLeft: number }) {
  const colors = ['#4F7CAC', '#2E8B6E', '#8A6BB8', '#C27C2C', '#3E8FB0', '#5E7487'];
  const hash = Array.from(name).reduce((h, ch) => h + ch.charCodeAt(0), 0);
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('') || '?';
  const share = msLeft / WINDOW_MS;
  const closed = msLeft <= 0;
  return (
    <span
      className="relative h-[46px] w-[46px] shrink-0 rounded-full"
      style={{ background: closed ? '#E3E9EE' : `conic-gradient(${ringColor(msLeft)} ${share * 360}deg, #E3E9EE 0)` }}
      title={closed ? 'المحادثة مقفولة' : `باقي ${Math.floor(msLeft / HOUR)} ساعة`}
    >
      <span
        className={`absolute inset-[3px] flex items-center justify-center rounded-full border-2 border-white text-sm font-semibold text-white ${closed ? 'opacity-70 grayscale' : ''}`}
        style={{ background: colors[hash % colors.length] }}
      >
        {initials}
      </span>
    </span>
  );
}

function WindowPill({ msLeft }: { msLeft: number }) {
  if (msLeft <= 0) {
    return <span className="rounded-full bg-[#EEF1F4] px-3 py-1 text-xs text-[#6B7A88]">المحادثة مقفولة</span>;
  }
  const h = Math.floor(msLeft / HOUR);
  const m = Math.floor((msLeft % HOUR) / 60000);
  const color = ringColor(msLeft);
  return (
    <span className="flex items-center gap-2 rounded-full border border-[#F3DDB5] bg-[#FDF5E8] px-3 py-1 text-xs">
      <i className="h-2 w-2 rounded-full" style={{ background: color }} />
      <span className="hidden lg:inline">المحادثة تتقفل بعد {h} ساعة و{m} دقيقة</span>
      <span className="lg:hidden" dir="ltr">{h}:{String(m).padStart(2, '0')}</span>
    </span>
  );
}
