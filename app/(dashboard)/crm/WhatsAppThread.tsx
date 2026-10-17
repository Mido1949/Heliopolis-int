'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Empty, Input, Spin, Tag, Typography, message } from 'antd';
import { createClient } from '@/lib/supabase/client';
import dayjs from 'dayjs';

const { Text } = Typography;

interface WaMessage {
  id: string;
  direction: 'in' | 'out';
  origin: 'customer' | 'app' | 'api' | 'history';
  body: string | null;
  status: string | null;
  referral: { headline?: string; source_url?: string } | null;
  sent_at: string;
  business_phone: string;
  msg_type: string;
  media_id: string | null;
  sender: { name: string | null } | null;
}

const WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * The lead's WhatsApp conversation, both sides, as captured by
 * /api/whatsapp/webhook, with a reply box that sends through
 * /api/whatsapp/send. Replies from the phone or WhatsApp Web still show up
 * here as echoes.
 */
export default function WhatsAppThread({ leadId }: { leadId: string }) {
  const [rows, setRows] = useState<WaMessage[] | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const { data } = await createClient()
      .from('wa_messages')
      .select('id, direction, origin, body, status, referral, sent_at, business_phone, msg_type, media_id, sender:profiles!wa_messages_sent_by_fkey(name)')
      .eq('lead_id', leadId)
      .order('sent_at', { ascending: true })
      .limit(500);
    setRows((data as unknown as WaMessage[]) ?? []);
  }, [leadId]);

  useEffect(() => {
    const supabase = createClient();
    load();
    // New messages and status ticks appear while the drawer is open.
    const channel = supabase
      .channel(`wa-${leadId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wa_messages', filter: `lead_id=eq.${leadId}` }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [leadId, load]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [rows?.length]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, text: body }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        message.error(out.message ?? out.error ?? 'الرسالة متبعتتش');
        return;
      }
      setText('');
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

  return (
    <div className="space-y-2">
      {ad && (
        <div className="p-2 rounded-lg bg-blue-50 border border-blue-100 text-xs">
          <Tag color="blue">من إعلان</Tag> {ad.headline ?? ad.source_url ?? 'Click-to-WhatsApp'}
        </div>
      )}
      {rows.length === 0 ? (
        <Empty description="لا توجد رسائل واتساب لهذا الليد بعد" />
      ) : (
        <div className="flex flex-col gap-2 max-h-[55vh] overflow-y-auto p-2 rounded-lg bg-[#efeae2]">
          {rows.map((r) => {
            const ours = r.direction === 'out';
            return (
              <div key={r.id} className={`flex ${ours ? 'justify-start' : 'justify-end'}`}>
                <div
                  className={`max-w-[80%] px-3 py-2 rounded-lg shadow-sm text-sm whitespace-pre-wrap ${
                    ours ? 'bg-[#d9fdd3]' : 'bg-white'
                  }`}
                >
                  {r.media_id ? <Media m={r} /> : <div>{r.body ?? '—'}</div>}
                  <div className="mt-1 text-[10px] text-gray-500 flex gap-2 justify-end">
                    {ours && <span>{r.origin === 'api' ? (r.sender?.name ?? 'الـ CRM') : 'الموبايل'}</span>}
                    {r.origin === 'history' && <span>أرشيف</span>}
                    <span>{dayjs(r.sent_at).format('DD/MM HH:mm')}</span>
                    {ours && r.status && <span>{r.status === 'read' ? '✓✓ اتقرت' : r.status === 'delivered' ? '✓✓' : r.status === 'failed' ? '✗' : '✓'}</span>}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={bottom} />
        </div>
      )}

      {open ? (
        <div className="space-y-1">
          <div className="flex gap-2 items-end">
            <Input.TextArea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onPressEnter={(e) => {
                if (!e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              autoSize={{ minRows: 1, maxRows: 5 }}
              placeholder="اكتب رد… (Enter للإرسال، Shift+Enter لسطر جديد)"
              disabled={sending}
            />
            <Button type="primary" onClick={send} loading={sending} disabled={!text.trim()} style={{ background: '#25D366' }}>
              إرسال
            </Button>
          </div>
          <Text type="secondary" className="text-xs">
            الرد مجاني لحد {dayjs(Date.now() + msLeft).format('DD/MM HH:mm')} (24 ساعة من آخر رسالة من العميل).
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
  );
}

/** Photo, voice note, video or file, streamed through /api/whatsapp/media. */
function Media({ m }: { m: WaMessage }) {
  const [failed, setFailed] = useState(false);
  const src = `/api/whatsapp/media/${m.media_id}`;
  // The body is the label plus any caption or filename: "📷 صورة — caption".
  const caption = m.body?.split(' — ').slice(1).join(' — ');
  if (failed) return <div>{m.body} <span className="text-[10px] text-gray-500">(الملف مش متاح)</span></div>;
  switch (m.msg_type) {
    case 'image':
    case 'sticker':
      return (
        <div>
          <a href={src} target="_blank" rel="noreferrer">
            <img src={src} alt={caption || 'صورة'} loading="lazy" onError={() => setFailed(true)} className="max-h-72 max-w-full rounded" />
          </a>
          {caption && <div className="mt-1">{caption}</div>}
        </div>
      );
    case 'audio':
      return <audio controls preload="none" src={src} onError={() => setFailed(true)} className="max-w-[260px]" />;
    case 'video':
      return (
        <div>
          <video controls preload="metadata" src={src} onError={() => setFailed(true)} className="max-h-72 max-w-full rounded" />
          {caption && <div className="mt-1">{caption}</div>}
        </div>
      );
    default:
      return (
        <a href={src} target="_blank" rel="noreferrer" className="text-blue-700 underline">
          {m.body ?? '📄 ملف'}
        </a>
      );
  }
}
