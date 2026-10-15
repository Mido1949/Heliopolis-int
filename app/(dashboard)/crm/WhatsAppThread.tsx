'use client';

import { useEffect, useState } from 'react';
import { Empty, Spin, Tag, Typography } from 'antd';
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
}

/**
 * The lead's WhatsApp conversation, both sides, as captured by
 * /api/whatsapp/webhook. Read-only: replies are still sent from WhatsApp Web
 * and show up here as echoes.
 */
export default function WhatsAppThread({ leadId }: { leadId: string }) {
  const [rows, setRows] = useState<WaMessage[] | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let alive = true;
    const load = async () => {
      const { data } = await supabase
        .from('wa_messages')
        .select('id, direction, origin, body, status, referral, sent_at, business_phone')
        .eq('lead_id', leadId)
        .order('sent_at', { ascending: true })
        .limit(500);
      if (alive) setRows((data as WaMessage[]) ?? []);
    };
    load();

    // New messages appear while the drawer is open.
    const channel = supabase
      .channel(`wa-${leadId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'wa_messages', filter: `lead_id=eq.${leadId}` }, load)
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [leadId]);

  if (rows === null) return <div className="py-8 text-center"><Spin /></div>;
  if (rows.length === 0) return <Empty description="لا توجد رسائل واتساب لهذا الليد بعد" />;

  const ad = rows.find((r) => r.referral)?.referral;

  return (
    <div className="space-y-2">
      {ad && (
        <div className="p-2 rounded-lg bg-blue-50 border border-blue-100 text-xs">
          <Tag color="blue">من إعلان</Tag> {ad.headline ?? ad.source_url ?? 'Click-to-WhatsApp'}
        </div>
      )}
      <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto p-2 rounded-lg bg-[#efeae2]">
        {rows.map((r) => {
          const ours = r.direction === 'out';
          return (
            <div key={r.id} className={`flex ${ours ? 'justify-start' : 'justify-end'}`}>
              <div
                className={`max-w-[80%] px-3 py-2 rounded-lg shadow-sm text-sm whitespace-pre-wrap ${
                  ours ? 'bg-[#d9fdd3]' : 'bg-white'
                }`}
              >
                <div>{r.body ?? '—'}</div>
                <div className="mt-1 text-[10px] text-gray-500 flex gap-2 justify-end">
                  {ours && <span>{r.origin === 'api' ? 'النظام' : 'الفريق'}</span>}
                  {r.origin === 'history' && <span>أرشيف</span>}
                  <span>{dayjs(r.sent_at).format('DD/MM HH:mm')}</span>
                  {ours && r.status && <span>{r.status === 'read' ? '✓✓' : r.status === 'delivered' ? '✓✓' : '✓'}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <Text type="secondary" className="text-xs">
        الرد من واتساب ويب كالعادة — الرسائل بتظهر هنا تلقائياً.
      </Text>
    </div>
  );
}
