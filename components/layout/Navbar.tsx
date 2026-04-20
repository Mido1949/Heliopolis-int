'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Search, Globe, ChevronDown, Menu } from 'lucide-react';
import { BellOutlined } from '@ant-design/icons';
import { NAV_ITEMS } from '@/lib/constants';
import { Badge, Popover, List, Typography, Button, Spin } from 'antd';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { formatDistanceToNow } from 'date-fns';

const { Text } = Typography;

interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  body?: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

interface NavbarProps {
  lang: 'ar' | 'en';
  onToggleLang: () => void;
  collapsed: boolean;
  onToggleMobileMenu: () => void;
}

export default function Navbar({ lang, onToggleLang, collapsed, onToggleMobileMenu }: NavbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const supabase = createClient();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  // Find current page title
  const currentNav = NAV_ITEMS.find(
    (item) => pathname === item.path || pathname?.startsWith(item.path + '/')
  );
  
  const pageTitle = currentNav
    ? lang === 'ar'
      ? `${currentNav.labelAr} (${currentNav.labelEn})`
      : currentNav.labelEn
    : 'LOOMARK';

  useEffect(() => {
    if (!user) return;

    const fetchNotifications = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (data) {
        setNotifications(data);
        setUnreadCount(data.filter(n => !n.is_read).length);
      }
      setLoading(false);
    };

    fetchNotifications();

    const channel = supabase.channel('notifications')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`
      }, (payload) => {
        setNotifications(prev => [payload.new as Notification, ...prev]);
        setUnreadCount(prev => prev + 1);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, supabase]);

  const markAllAsRead = async () => {
    if (!user) return;
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
  };

  const markAsRead = async (id: string, is_read: boolean) => {
    if (is_read) return;
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const handleNotificationClick = (n: Notification) => {
    markAsRead(n.id, n.is_read);
    if (n.type === 'lead_assigned' || n.type === 'call_logged') {
      router.push('/crm');
    } else if (n.type === 'boq_status') {
      router.push('/boq');
    } else if (n.type === 'low_stock') {
      router.push('/inventory');
    }
  };

  const notificationContent = (
    <div style={{ width: 320, maxHeight: 400, overflowY: 'auto' }}>
      <div className="flex justify-between items-center mb-2 px-1">
        <Text strong>Notifications</Text>
        {unreadCount > 0 && (
          <Button type="link" size="small" onClick={markAllAsRead}>
            Mark all as read
          </Button>
        )}
      </div>
      {loading ? (
        <div className="p-4 text-center"><Spin /></div>
      ) : (
        <List
          dataSource={notifications}
          locale={{ emptyText: 'No notifications' }}
          renderItem={(n) => (
            <List.Item
              onClick={() => handleNotificationClick(n)}
              className={`cursor-pointer hover:bg-gray-50 transition-colors ${!n.is_read ? 'bg-blue-50/50' : ''}`}
            >
              <List.Item.Meta
                title={<Text strong={!n.is_read}>{n.title}</Text>}
                description={
                  <div className="flex flex-col gap-1">
                    <Text type="secondary" className="text-xs">{n.message || n.body}</Text>
                    <Text type="secondary" className="text-[10px]">
                      {n.created_at ? formatDistanceToNow(new Date(n.created_at), { addSuffix: true }) : ''}
                    </Text>
                  </div>
                }
              />
            </List.Item>
          )}
        />
      )}
    </div>
  );

  return (
    <header
      className={`fixed top-0 end-0 z-40 h-16 bg-white/80 backdrop-blur-md border-b border-slate-200 flex items-center justify-between px-4 md:px-6 transition-all duration-300 ${
        collapsed ? 'md:start-[72px] start-0' : 'md:start-[200px] start-0'
      }`}
    >
      <div className="flex items-center gap-2 md:gap-4">
        {/* Mobile menu button */}
        <button 
          onClick={onToggleMobileMenu}
          className="md:hidden p-2 -ms-2 text-slate-600 hover:text-[#0D2137] rounded-lg hover:bg-slate-50 transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Page Title */}
        <h2 className="text-lg md:text-xl font-bold text-[#0D2137] truncate">
          {pageTitle}
        </h2>
      </div>

      <div className="flex items-center gap-3 md:gap-6">
        {/* Search */}
        <div className="hidden md:flex relative items-center">
          <Search className="w-4 h-4 text-slate-400 absolute start-3" />
          <input 
            type="text" 
            placeholder={lang === 'ar' ? 'بحث...' : 'Search...'} 
            className="ps-9 pe-4 py-2 bg-slate-100 border-none rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-[#D72B2B]/20 w-64 transition-all"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 md:gap-4 border-s border-slate-200 ps-4 md:ps-6 ms-2 md:ms-0">
          <button 
            onClick={onToggleLang}
            className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-[#0D2137] transition-colors p-2 rounded-lg hover:bg-slate-50"
          >
            <Globe className="w-4 h-4" />
            <span className="hidden sm:inline-block">{lang === 'ar' ? 'English' : 'العربية'}</span>
          </button>
          
          <Popover content={notificationContent} trigger="click" placement="bottomRight">
            <button className="relative p-2 text-slate-400 hover:text-[#0D2137] transition-colors rounded-full hover:bg-slate-50">
              <Badge count={unreadCount} size="small" offset={[-2, 6]}>
                <BellOutlined style={{ fontSize: '18px' }} />
              </Badge>
            </button>
          </Popover>
          
          {/* Mobile Profile Dropdown trigger (Optional) */}
          <button className="md:hidden flex items-center gap-1 text-slate-400">
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
