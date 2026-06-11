'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Badge, Popover, Button, Spin, Empty } from 'antd';
import { BellOutlined } from '@ant-design/icons';
import { formatDistanceToNow } from 'date-fns';
import { arEG } from 'date-fns/locale';

interface Notification {
  id: string;
  message: string;
  lead_id: string | null;
  read: boolean;
  created_at: string;
}

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState<number>(Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/notifications', { cache: 'no-store' });
      if (!res.ok) return;
      const data: Notification[] = await res.json();
      setNotifications(data || []);
      setUnreadCount((data || []).filter(n => !n.read).length);
    } catch {
      // silent — non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    intervalRef.current = setInterval(fetchNotifications, 30000);
    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), 60000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      clearInterval(tick);
    };
  }, [fetchNotifications]);

  const markAllAsRead = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });
      if (!res.ok) return;
      await fetchNotifications();
    } catch {
      // silent
    }
  }, [fetchNotifications]);

  const content = (
    <div
      dir="rtl"
      style={{ width: 320, maxHeight: 420 }}
      className="font-sans"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
        <span className="text-sm font-bold text-slate-800">الإشعارات</span>
        {unreadCount > 0 && (
          <Button type="link" size="small" onClick={markAllAsRead} className="text-xs">
            تعليم الكل كمقروءة
          </Button>
        )}
      </div>

      <div className="overflow-y-auto" style={{ maxHeight: 340 }}>
        {loading ? (
          <div className="p-6 flex justify-center"><Spin /></div>
        ) : notifications.length === 0 ? (
          <div className="p-6">
            <Empty description="لا توجد إشعارات" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {notifications.map(n => (
              <li
                key={n.id}
                className={`px-3 py-2.5 text-sm leading-relaxed ${!n.read ? 'bg-amber-50/40' : 'bg-white'}`}
              >
                <div className="text-slate-800 whitespace-pre-wrap break-words">{n.message}</div>
                <div className="text-[11px] text-slate-500 mt-1">
                  {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: arEG })}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );

  return (
    <Popover
      content={content}
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement="bottomLeft"
      destroyTooltipOnHide
    >
      <button
        type="button"
        aria-label="الإشعارات"
        className="relative flex items-center justify-center w-9 h-9 rounded-full text-slate-200 hover:text-white hover:bg-white/10 transition-colors"
      >
        <Badge count={unreadCount} size="small" offset={[-2, 2]} color="#F5A623">
          <BellOutlined style={{ fontSize: 18 }} />
        </Badge>
      </button>
    </Popover>
  );
}
