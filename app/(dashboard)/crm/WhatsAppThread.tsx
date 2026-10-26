'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Dropdown, Empty, Image, Input, Modal, Spin, Switch, Typography, message } from 'antd';
import {
  PaperClipOutlined, CloseOutlined, SendOutlined, DownOutlined, FileOutlined, DownloadOutlined,
  CaretRightFilled, PauseOutlined,
} from '@ant-design/icons';
import { createClient } from '@/lib/supabase/client';
import dayjs from 'dayjs';

const { Text } = Typography;

interface WaMessage {
  id: string;
  wamid: string;
  direction: 'in' | 'out';
  origin: 'customer' | 'app' | 'api' | 'history';
  body: string | null;
  status: string | null;
  referral: { headline?: string; source_url?: string } | null;
  sent_at: string;
  business_phone: string;
  msg_type: string;
  media_id: string | null;
  is_bot: boolean;
  ctx: { id?: string } | null;
  doc: { filename?: string } | null;
  sender: { name: string | null } | null;
}

const WINDOW_MS = 24 * 60 * 60 * 1000;
const WEBSITE = 'https://heliomax.co/ar/eg';

// Buttons above the reply box. A text one fills the box so the rep can adjust
// it before sending; a preset one sends a fixed file (see PRESETS in
// /api/whatsapp/send).
const QUICK: { label: string; text?: string; preset?: string }[] = [
  { label: 'حجز معاينة', text: 'يسعدنا نحدد لحضرتك معاد معاينة مجانية في الموقع. ممكن تبعتلنا العنوان واليوم والوقت اللي يناسبك؟' },
  { label: '📘 كتالوج Mini', preset: 'catalog' },
  { label: '📗 كتالوج VRF', preset: 'catalog_vrf' },
  { label: 'طلب رقم للمكالمة', text: 'ممكن رقم تليفون حضرتك والوقت المناسب، عشان مهندس من عندنا يكلمك ويشرحلك كل التفاصيل؟' },
  { label: '🎤 فويس الشرح', preset: 'explainer' },
  { label: '🔗 لينك الويبسايت', text: `تقدر تشوف أنظمتنا ومشاريعنا على الويبسايت: ${WEBSITE}` },
];
// WhatsApp takes videos and voice notes up to 16 MB and documents up to 100 MB;
// 16 MB keeps the server hop quick.
const MAX_FILE = 16 * 1024 * 1024;
const COLUMNS =
  'id, wamid, direction, origin, body, status, referral, sent_at, business_phone, msg_type, media_id, is_bot, ' +
  'ctx:raw->context, doc:raw->document, sender:profiles!wa_messages_sent_by_fkey(name)';

/**
 * The lead's WhatsApp conversation, both sides, as captured by
 * /api/whatsapp/webhook, with a reply box that sends through
 * /api/whatsapp/send. Replies from the phone or WhatsApp Web still show up
 * here as echoes. Laid out like WhatsApp itself: day separators, quoted
 * replies, and a per-message menu to reply, forward, copy or download.
 *
 * fill = take the parent's full height (the inbox); otherwise the messages
 * scroll inside a fixed box (the lead drawer).
 */
export default function WhatsAppThread({ leadId, fill = false }: { leadId: string; fill?: boolean }) {
  const [rows, setRows] = useState<WaMessage[] | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  // The attached file is the lead's quote: saved to its files, lead → QUOTED.
  const [asQuote, setAsQuote] = useState(false);
  const [replyTo, setReplyTo] = useState<WaMessage | null>(null);
  const [forwarding, setForwarding] = useState<WaMessage | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLTextAreaElement | null>(null);

  const load = useCallback(async () => {
    const { data } = await createClient()
      .from('wa_messages')
      .select(COLUMNS)
      .eq('lead_id', leadId)
      .order('sent_at', { ascending: true })
      .limit(500);
    setRows((data as unknown as WaMessage[]) ?? []);
  }, [leadId]);

  useEffect(() => {
    const supabase = createClient();
    load();
    // New messages and status ticks appear while the thread is open. A DB
    // trigger broadcasts on wa-lead:<id> — postgres_changes kept the Nano DB
    // busy polling the WAL (2026-10-19). Bursts of ticks coalesce into one load.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) return;
      timer = setTimeout(() => { timer = null; load(); }, 1500);
    };
    const channel = supabase
      .channel(`wa-lead:${leadId}`)
      .on('broadcast', { event: 'wa_change' }, schedule)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [leadId, load]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [rows?.length]);

  const pick = (f: File | undefined) => {
    if (!f) return;
    if (f.size > MAX_FILE) {
      message.error('الملف أكبر من 16 ميجا');
      return;
    }
    setFile(f);
    setAsQuote(false);
  };

  const startReply = (m: WaMessage) => {
    setReplyTo(m);
    box.current?.focus();
  };

  const jumpTo = (wamid: string) => {
    const el = document.getElementById(`wa-${wamid}`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setFlash(wamid);
    setTimeout(() => setFlash(null), 1500);
  };

  const sendPreset = async (preset: string) => {
    setSending(true);
    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, preset }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        message.error(out.message ?? out.error ?? 'الرسالة متبعتتش');
        return;
      }
      load();
    } finally {
      setSending(false);
    }
  };

  const quick = (q: (typeof QUICK)[number]) => {
    if (q.preset) {
      sendPreset(q.preset);
      return;
    }
    setText((t) => (t.trim() ? `${t.trim()}
${q.text}` : q.text ?? ''));
    box.current?.focus();
  };

  const send = async () => {
    const body = text.trim();
    if (!body && !file) return;
    setSending(true);
    try {
      let attachment: { path: string; name: string; type: string } | undefined;
      if (file) {
        // Straight to Storage through a signed slot: Vercel caps request bodies at 4.5 MB.
        const slot = await fetch('/api/whatsapp/upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ leadId, filename: file.name }),
        });
        const s = await slot.json().catch(() => ({}));
        if (!slot.ok) {
          message.error(s.error ?? 'الملف مترفعش');
          return;
        }
        const { error } = await createClient().storage.from('wa-media').uploadToSignedUrl(s.path, s.token, file, { contentType: file.type || undefined });
        if (error) {
          console.error('[wa-thread] upload failed', error);
          message.error('الملف مترفعش، جرّب تاني');
          return;
        }
        attachment = { path: s.path, name: file.name, type: file.type };
      }
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, text: body, file: attachment, replyTo: replyTo?.wamid, asQuote: !!attachment && asQuote }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        message.error(out.message ?? out.error ?? 'الرسالة متبعتتش');
        return;
      }
      if (attachment && asQuote) {
        if (out.quoteSaved) message.success('عرض السعر اتحفظ في ملف العميل');
        else message.warning('الرسالة اتبعتت بس عرض السعر ماتحفظش في ملف العميل، ارفعه من تبويب الملفات');
      }
      setText('');
      setFile(null);
      setAsQuote(false);
      setReplyTo(null);
      load();
    } finally {
      setSending(false);
    }
  };

  if (rows === null) return <div className="py-8 text-center"><Spin /></div>;

  const ad = rows.find((r) => r.referral)?.referral;
  const lastIn = [...rows].reverse().find((r) => r.direction === 'in');
  const msLeft = lastIn ? WINDOW_MS - (Date.now() - new Date(lastIn.sent_at).getTime()) : -1;
  const open = msLeft > 0;
  const byWamid = new Map(rows.map((r) => [r.wamid, r]));

  return (
    <div className={fill ? 'flex h-full min-h-0 flex-col' : 'space-y-2'}>
      <div className={fill ? 'space-y-2 px-3 pt-2 empty:hidden' : 'space-y-2'}>
        <BotSwitch leadId={leadId} />
        {ad && (
          <div className="overflow-hidden rounded-xl border border-[#E1E7EC] bg-white text-xs">
            <div className="h-1.5 bg-gradient-to-l from-[#0D2137] to-[#B8913A]" />
            <div className="px-3 py-2">
              <b className="block text-[#0D2137]">جاي من إعلان: {ad.headline ?? 'Click-to-WhatsApp'}</b>
              {ad.source_url && <a href={ad.source_url} target="_blank" rel="noreferrer" className="text-[#6B7A88] underline">افتح الإعلان</a>}
            </div>
          </div>
        )}
      </div>

      <div className={`flex flex-col gap-1 overflow-y-auto bg-[#EAF0F4] px-3 py-3 md:px-[6%] ${fill ? 'flex-1 min-h-0' : 'max-h-[55vh] rounded-lg'}`}>
        {rows.length === 0 ? (
          <Empty className="m-auto" description="لا توجد رسائل واتساب لهذا الليد بعد" />
        ) : (
          rows.map((r, i) => {
            const ours = r.direction === 'out';
            const newDay = i === 0 || !dayjs(rows[i - 1].sent_at).isSame(r.sent_at, 'day');
            const quoted = r.ctx?.id ? byWamid.get(r.ctx.id) : undefined;
            return (
              <div key={r.id}>
                {newDay && (
                  <div className="my-2 flex justify-center">
                    <span className="rounded-lg bg-white px-3 py-1 text-[11px] text-[#6B7A88]">{dayLabel(r.sent_at)}</span>
                  </div>
                )}
                <div id={`wa-${r.wamid}`} className={`group flex ${ours ? 'justify-start' : 'justify-end'}`}>
                  <div
                    className={`relative max-w-[85%] md:max-w-[62%] rounded-xl px-2.5 pb-1 pt-1.5 text-[15px] leading-relaxed md:text-sm shadow-[0_1px_1px_rgba(13,33,55,.06)] ${
                      ours ? 'bg-[#E4EEF7] rounded-ss-sm' : 'bg-white rounded-se-sm'
                    } ${flash === r.wamid ? 'ring-2 ring-[#B8913A]' : ''}`}
                    onDoubleClick={() => open && startReply(r)}
                  >
                    <MessageMenu m={r} canReply={open} onReply={() => startReply(r)} onForward={() => setForwarding(r)} />
                    {ours && r.origin === 'api' && (
                      <div className="mb-0.5 pe-4 text-[11px] font-semibold text-[#1B3A5C]">{r.is_bot ? '🤖 البوت' : r.sender?.name ?? 'الـ CRM'}</div>
                    )}
                    {r.ctx?.id && <Quote m={quoted} onClick={quoted ? () => jumpTo(quoted.wamid) : undefined} />}
                    {r.media_id ? <Media m={r} /> : <div className="whitespace-pre-wrap break-words pe-4 ps-1">{r.body ?? '—'}</div>}
                    <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-gray-500">
                      {ours && r.origin === 'app' && <span>الموبايل</span>}
                      {r.origin === 'history' && <span>أرشيف</span>}
                      <span dir="ltr">{dayjs(r.sent_at).format('HH:mm')}</span>
                      {ours && r.status && <Ticks status={r.status} />}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottom} />
      </div>

      <div className={fill ? 'border-t border-[#E1E7EC] bg-white px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]' : 'space-y-1'}>
        {open ? (
          <div className="space-y-1">
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {QUICK.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => quick(q)}
                  disabled={sending}
                  className="shrink-0 rounded-full border border-[#E1E7EC] bg-[#F3F6F8] px-3.5 py-1.5 text-[14px] text-[#1B3A5C] hover:border-[#1B3A5C] disabled:opacity-50 md:px-3 md:py-1 md:text-xs"
                >
                  {q.label}
                </button>
              ))}
            </div>
            {replyTo && (
              <div className="flex items-start gap-2 rounded-lg bg-white p-1">
                <div className="min-w-0 flex-1"><Quote m={replyTo} /></div>
                <Button size="small" type="text" icon={<CloseOutlined />} onClick={() => setReplyTo(null)} />
              </div>
            )}
            {file && (
              <div className="flex items-center gap-2 text-xs p-2 rounded-lg bg-white border">
                <PaperClipOutlined />
                <span className="truncate">{file.name}</span>
                <span className="text-gray-400">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
                <label className="ms-auto flex shrink-0 cursor-pointer items-center gap-1 rounded-full border border-[#2F54EB]/30 bg-[#F0F5FF] px-2 py-0.5 text-[#2F54EB]">
                  <input type="checkbox" checked={asQuote} onChange={(e) => setAsQuote(e.target.checked)} disabled={sending} />
                  📄 ده عرض سعر
                </label>
                <Button size="small" type="text" icon={<CloseOutlined />} onClick={() => setFile(null)} disabled={sending} />
              </div>
            )}
            <div data-tour="wa-composer" className="flex gap-2 items-end">
              <input
                ref={picker}
                type="file"
                hidden
                accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,.7z,.dwg,.dxf"
                onChange={(e) => {
                  pick(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              <Button shape="circle" type="text" icon={<PaperClipOutlined />} onClick={() => picker.current?.click()} disabled={sending} title="إرفاق صورة أو ملف" />
              <Input.TextArea
                ref={(el) => { box.current = el?.resizableTextArea?.textArea ?? null; }}
                onPaste={(e) => pick(e.clipboardData.files?.[0])}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setReplyTo(null);
                }}
                onPressEnter={(e) => {
                  if (!e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                autoSize={{ minRows: 1, maxRows: 5 }}
                placeholder={file ? 'تعليق على الملف (اختياري)…' : 'اكتب رسالة'}
                disabled={sending}
                className="!text-[16px] md:!text-sm"
                style={{ borderRadius: 18 }}
              />
              <Button
                shape="circle"
                type="primary"
                icon={<SendOutlined style={{ transform: 'scaleX(-1)' }} />}
                onClick={send}
                loading={sending}
                disabled={!text.trim() && !file}
                style={{ background: '#0D2137', borderColor: '#0D2137' }}
                title="إرسال (Enter)"
              />
            </div>
            <Text type="secondary" className="text-[11px]">
              الرد مجاني لحد {dayjs(Date.now() + msLeft).format('DD/MM HH:mm')} · دبل كليك على أي رسالة للرد عليها
            </Text>
          </div>
        ) : (
          <Text type="secondary" className="text-xs block p-2 rounded bg-gray-50">
            {lastIn
              ? 'عدّى أكتر من 24 ساعة من آخر رسالة من العميل، فالرد المجاني من هنا مقفول. ابعتله من الموبايل، أو استنى لما يكلمك.'
              : 'العميل لسه مبعتش رسالة واتساب. ابدأ الكلام من الموبايل.'}
          </Text>
        )}
      </div>

      <ForwardModal m={forwarding} fromLead={leadId} onClose={() => setForwarding(null)} />
    </div>
  );
}

function dayLabel(at: string): string {
  const d = dayjs(at);
  if (d.isSame(dayjs(), 'day')) return 'النهارده';
  if (d.isSame(dayjs().subtract(1, 'day'), 'day')) return 'امبارح';
  return d.format('DD/MM/YYYY');
}

function Ticks({ status }: { status: string }) {
  if (status === 'failed') return <span className="text-red-500">✗</span>;
  const double = status === 'delivered' || status === 'read';
  return <span className={status === 'read' ? 'text-[#53bdeb]' : ''}>{double ? '✓✓' : '✓'}</span>;
}

/** The quoted message on top of a reply, as WhatsApp shows it. */
function Quote({ m, onClick }: { m?: WaMessage; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`mb-1 rounded-md border-s-4 bg-black/5 px-2 py-1 text-xs ${onClick ? 'cursor-pointer' : ''} ${
        m?.direction === 'out' ? 'border-[#53bdeb]' : 'border-[#06cf9c]'
      }`}
    >
      <div className="font-semibold text-[#1f7aec]">{!m ? 'رسالة' : m.direction === 'in' ? 'العميل' : 'إنت'}</div>
      <div className="line-clamp-2 text-gray-600">{m ? m.body ?? '—' : 'رسالة قديمة مش ظاهرة هنا'}</div>
    </div>
  );
}

function MessageMenu({ m, canReply, onReply, onForward }: { m: WaMessage; canReply: boolean; onReply: () => void; onForward: () => void }) {
  const items = [
    canReply && { key: 'reply', label: 'رد' },
    { key: 'forward', label: 'إعادة توجيه' },
    !m.media_id && m.body && { key: 'copy', label: 'نسخ' },
    m.media_id && { key: 'download', label: 'فتح / تحميل' },
  ].filter(Boolean) as { key: string; label: string }[];
  return (
    <Dropdown
      trigger={['click']}
      menu={{
        items,
        onClick: ({ key }) => {
          if (key === 'reply') onReply();
          if (key === 'forward') onForward();
          if (key === 'copy') navigator.clipboard.writeText(m.body ?? '').then(() => message.success('اتنسخت'));
          if (key === 'download') window.open(`/api/whatsapp/media/${m.media_id}`, '_blank');
        },
      }}
    >
      <button
        data-tour="wa-menu"
        className="absolute end-1 top-1 z-10 rounded-full px-1 text-gray-500 hover:bg-black/5 md:opacity-0 md:group-hover:opacity-100"
        aria-label="خيارات الرسالة"
      >
        <DownOutlined style={{ fontSize: 10 }} />
      </button>
    </Dropdown>
  );
}

interface ChatChoice {
  leadId: string;
  name: string;
  lastInAt: string | null;
}

/**
 * Forward a message to another chat. Only chats whose customer wrote in the
 * last 24 hours can take a free-form message, so the rest are listed but off.
 */
function ForwardModal({ m, fromLead, onClose }: { m: WaMessage | null; fromLead: string; onClose: () => void }) {
  const [chats, setChats] = useState<ChatChoice[] | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!m) return;
    setChats(null);
    setQ('');
    (async () => {
      const { data } = await createClient()
        .from('wa_messages')
        .select('lead_id, direction, sent_at, lead:leads(name, phone_normalized)')
        .not('lead_id', 'is', null)
        .order('sent_at', { ascending: false })
        .limit(500);
      const rows = (data as unknown as { lead_id: string; direction: string; sent_at: string; lead: { name: string | null; phone_normalized: string | null } | null }[]) ?? [];
      const seen = new Map<string, ChatChoice>();
      for (const r of rows) {
        let c = seen.get(r.lead_id);
        if (!c) {
          c = { leadId: r.lead_id, name: r.lead?.name || r.lead?.phone_normalized || '—', lastInAt: null };
          seen.set(r.lead_id, c);
        }
        if (!c.lastInAt && r.direction === 'in') c.lastInAt = r.sent_at;
      }
      seen.delete(fromLead);
      setChats(Array.from(seen.values()));
    })();
  }, [m, fromLead]);

  const forward = async (leadId: string) => {
    if (!m) return;
    setBusy(leadId);
    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, forwardOf: m.id }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        message.error(out.message ?? out.error ?? 'متبعتتش');
        return;
      }
      message.success('اتبعتت');
      onClose();
    } finally {
      setBusy(null);
    }
  };

  const visible = (chats ?? []).filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal open={!!m} onCancel={onClose} footer={null} title="إعادة توجيه إلى…" destroyOnClose>
      {m && <div className="mb-2 rounded bg-gray-50 p-2 text-xs text-gray-600 line-clamp-2">{m.body ?? '—'}</div>}
      <Input.Search allowClear placeholder="اسم العميل" value={q} onChange={(e) => setQ(e.target.value)} className="mb-2" />
      <div className="max-h-[50vh] overflow-y-auto">
        {chats === null ? (
          <div className="py-6 text-center"><Spin /></div>
        ) : visible.length === 0 ? (
          <Empty description="مفيش محادثات" />
        ) : (
          visible.map((c) => {
            const open = !!c.lastInAt && Date.now() - new Date(c.lastInAt).getTime() < WINDOW_MS;
            return (
              <div key={c.leadId} className="flex items-center justify-between gap-2 border-b py-2">
                <span className="truncate">{c.name}</span>
                {open ? (
                  <Button size="small" type="primary" loading={busy === c.leadId} disabled={!!busy} onClick={() => forward(c.leadId)} style={{ background: '#25D366' }}>
                    ابعت
                  </Button>
                ) : (
                  <span className="text-[11px] text-gray-400">مقفول (أكتر من 24 ساعة)</span>
                )}
              </div>
            );
          })
        )}
      </div>
    </Modal>
  );
}

/** Photo, voice note, video or file, served from our cache via /api/whatsapp/media. */
function Media({ m }: { m: WaMessage }) {
  const [failed, setFailed] = useState(false);
  const src = `/api/whatsapp/media/${m.media_id}`;
  // The body is the label plus any caption or filename: "📷 صورة — caption".
  const caption = m.body?.split(' — ').slice(1).join(' — ');
  if (failed) return <div className="pe-4 ps-1">{m.body} <span className="text-[10px] text-gray-500">(الملف مش متاح)</span></div>;
  switch (m.msg_type) {
    case 'image':
    case 'sticker':
      return (
        <div>
          <Image src={src} alt={caption || 'صورة'} onError={() => setFailed(true)} className="rounded" style={{ maxHeight: 288, maxWidth: '100%' }} />
          {caption && <div className="mt-1 px-1 whitespace-pre-wrap">{caption}</div>}
        </div>
      );
    case 'audio':
      return <VoiceNote src={src} onError={() => setFailed(true)} />;
    case 'video':
      return (
        <div>
          <video controls preload="none" src={src} onError={() => setFailed(true)} className="max-h-72 max-w-full rounded" />
          {caption && <div className="mt-1 px-1 whitespace-pre-wrap">{caption}</div>}
        </div>
      );
    default:
      return (
        <a href={src} target="_blank" rel="noreferrer" className="me-4 flex items-center gap-2 rounded-md bg-black/5 p-2 text-gray-800 hover:bg-black/10">
          <FileOutlined style={{ fontSize: 24 }} className="text-gray-500" />
          <span className="flex-1 truncate">{m.doc?.filename || caption || m.body || 'ملف'}</span>
          <DownloadOutlined className="text-gray-500" />
        </a>
      );
  }
}

/**
 * A voice note the WhatsApp way: play button, seek bar, speed. Nothing is
 * fetched until play is pressed, so a long chat doesn't download every note.
 */
function VoiceNote({ src, onError }: { src: string; onError: () => void }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [rate, setRate] = useState(1);

  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (!a.getAttribute('src')) {
      a.src = src;
      setLoading(true);
    }
    if (a.paused) a.play().catch(() => setLoading(false));
    else a.pause();
  };
  const fmt = (s: number) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00');

  return (
    <div className="flex w-64 max-w-full items-center gap-2 py-1 pe-4" dir="ltr">
      <audio
        ref={audio}
        preload="none"
        onPlaying={(e) => { e.currentTarget.playbackRate = rate; setPlaying(true); setLoading(false); }}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setPos(0); }}
        onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
        onError={(e) => { if (e.currentTarget.getAttribute('src')) onError(); }}
      />
      <button onClick={toggle} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-600 hover:bg-black/5" aria-label="تشغيل">
        {loading ? <Spin size="small" /> : playing ? <PauseOutlined /> : <CaretRightFilled style={{ fontSize: 18 }} />}
      </button>
      <input
        type="range"
        min={0}
        max={dur || 0}
        step={0.1}
        value={pos}
        onChange={(e) => { if (audio.current) audio.current.currentTime = Number(e.target.value); }}
        className="h-1 min-w-0 flex-1 accent-[#25D366]"
      />
      <span className="w-9 shrink-0 text-[10px] text-gray-500">{fmt(playing || pos ? pos : dur)}</span>
      <button
        onClick={() => {
          const next = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1;
          setRate(next);
          if (audio.current) audio.current.playbackRate = next;
        }}
        className="shrink-0 rounded-full bg-black/10 px-1.5 text-[10px] font-semibold text-gray-600"
      >
        {rate}x
      </button>
    </div>
  );
}

/**
 * The reply bot's switches for this chat: any rep can silence it here; leaders
 * also see the global on/off. The bot also snoozes itself for 12 hours after
 * handing a chat to the team.
 */
function BotSwitch({ leadId }: { leadId: string }) {
  const [s, setS] = useState<{ enabled: boolean; canToggleGlobal: boolean; paused: boolean; snoozedUntil: string | null } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/whatsapp/bot/settings?leadId=${leadId}`);
    if (res.ok) setS(await res.json());
  }, [leadId]);
  useEffect(() => { load(); }, [load]);

  const post = async (payload: Record<string, unknown>) => {
    setBusy(true);
    try {
      const res = await fetch('/api/whatsapp/bot/settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) message.error(out.error ?? 'متغيرش');
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (!s || (!s.enabled && !s.canToggleGlobal)) return null;
  const quiet = s.paused || Boolean(s.snoozedUntil);
  return (
    <div className="flex flex-wrap items-center gap-3 p-2 rounded-lg bg-gray-50 border text-xs">
      <span>🤖 بوت الرد</span>
      {s.enabled && (
        <span className="flex items-center gap-1">
          <Switch size="small" checked={!quiet} loading={busy} onChange={(on) => post({ leadId, paused: !on })} />
          {s.paused ? 'مقفول للعميل ده' : s.snoozedUntil ? `ساكت لحد ${dayjs(s.snoozedUntil).format('DD/MM HH:mm')} (سلّم للفريق)` : 'شغال للعميل ده'}
        </span>
      )}
      {s.canToggleGlobal && (
        <span className="flex items-center gap-1 ms-auto">
          <Switch size="small" checked={s.enabled} loading={busy} onChange={(on) => post({ enabled: on })} />
          {s.enabled ? 'البوت شغال لكل العملاء' : 'البوت مقفول لكل العملاء'}
        </span>
      )}
    </div>
  );
}
