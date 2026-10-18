'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Empty, Input, Segmented, Spin } from 'antd';
import dayjs from 'dayjs';
import { createClient } from '@/lib/supabase/client';
import WhatsAppThread from '../crm/WhatsAppThread';

interface Row {
  lead_id: string;
  direction: 'in' | 'out';
  body: string | null;
  sent_at: string;
  lead: { name: string | null; phone_normalized: string | null } | null;
}

interface Conversation {
  leadId: string;
  name: string;
  phone: string;
  last: Row;
  lastInAt: string | null;
}

const WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Team inbox for the 360dialog number: one row per lead, newest first.
 * "Waiting" = the customer wrote last. Lead RLS decides which chats a rep sees.
 */
export default function WhatsAppInboxPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'waiting'>('all');
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    const { data } = await createClient()
      .from('wa_messages')
      .select('lead_id, direction, body, sent_at, lead:leads(name, phone_normalized)')
      .not('lead_id', 'is', null)
      .order('sent_at', { ascending: false })
      .limit(500);
    setRows((data as unknown as Row[]) ?? []);
  }, []);

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
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'wa_messages' }, schedule)
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
          last: r,
          lastInAt: null,
        };
        byLead.set(r.lead_id, c);
      }
      if (!c.lastInAt && r.direction === 'in') c.lastInAt = r.sent_at;
    }
    return Array.from(byLead.values());
  }, [rows]);

  const visible = conversations.filter((c) => {
    if (filter === 'waiting' && c.last.direction !== 'in') return false;
    if (!q) return true;
    const s = q.toLowerCase();
    return c.name.toLowerCase().includes(s) || c.phone.includes(s);
  });
  const waitingCount = conversations.filter((c) => c.last.direction === 'in').length;

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-3 p-3" dir="rtl">
      <aside className={`${selected ? 'hidden md:flex' : 'flex'} w-full md:w-80 shrink-0 flex-col rounded-lg border bg-white`}>
        <div className="space-y-2 border-b p-3">
          <h1 className="text-lg font-semibold">واتساب</h1>
          <Input.Search allowClear placeholder="اسم أو رقم" value={q} onChange={(e) => setQ(e.target.value)} />
          <Segmented
            block
            value={filter}
            onChange={(v) => setFilter(v as 'all' | 'waiting')}
            options={[
              { label: 'الكل', value: 'all' },
              { label: <span>مستني رد <Badge count={waitingCount} size="small" /></span>, value: 'waiting' },
            ]}
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {rows === null ? (
            <div className="py-8 text-center"><Spin /></div>
          ) : visible.length === 0 ? (
            <Empty className="py-8" description="مفيش محادثات" />
          ) : (
            visible.map((c) => {
              const waiting = c.last.direction === 'in';
              const open = c.lastInAt && Date.now() - new Date(c.lastInAt).getTime() < WINDOW_MS;
              return (
                <button
                  key={c.leadId}
                  onClick={() => setSelected(c.leadId)}
                  className={`w-full border-b px-3 py-2 text-right hover:bg-gray-50 ${selected === c.leadId ? 'bg-green-50' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`truncate ${waiting ? 'font-semibold' : ''}`}>{c.name}</span>
                    <span className="shrink-0 text-[11px] text-gray-500">{dayjs(c.last.sent_at).format('DD/MM HH:mm')}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-gray-500">
                      {c.last.direction === 'out' ? 'إنت: ' : ''}{c.last.body ?? '—'}
                    </span>
                    {waiting && <span className="h-2 w-2 shrink-0 rounded-full bg-[#25D366]" />}
                    {!open && <span className="shrink-0 text-[10px] text-gray-400">مقفول</span>}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      <section className={`${selected ? 'flex' : 'hidden md:flex'} flex-1 flex-col rounded-lg border bg-white p-3 overflow-y-auto`}>
        {selected ? (
          <>
            <div className="mb-2 flex items-center gap-2">
              <button className="md:hidden text-sm text-blue-600" onClick={() => setSelected(null)}>→ رجوع</button>
              <span className="font-semibold">{conversations.find((c) => c.leadId === selected)?.name}</span>
              <span className="text-xs text-gray-500" dir="ltr">+{conversations.find((c) => c.leadId === selected)?.phone}</span>
            </div>
            <WhatsAppThread key={selected} leadId={selected} />
          </>
        ) : (
          <Empty className="m-auto" description="اختار محادثة" />
        )}
      </section>
    </div>
  );
}
