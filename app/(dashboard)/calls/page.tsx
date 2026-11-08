'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Table, Tag, Button, Input, Select, Row, Col, Typography, message, Card, Statistic, Space,
} from 'antd';
import {
  PhoneOutlined, SearchOutlined, FilterOutlined, ClockCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { createClient } from '@/lib/supabase/client';
import { formatDate } from '@/lib/utils';
import type { CallLog as CallLogType, CallType, CallOutcome } from '@/types';

const { Title, Text } = Typography;

interface CallLogWithLead extends CallLogType {
  lead_name?: string;
  lead_source?: string;
}

const CALL_TYPE_OPTIONS = [
  { value: 'Inbound', label: 'Inbound (وارد)' },
  { value: 'Outbound', label: 'Outbound (صادر)' },
];

const OUTCOME_OPTIONS = [
  { value: 'Answered', label: 'Answered (تم الرد)', color: 'green' },
  { value: 'No Answer', label: 'No Answer (لا رد)', color: 'red' },
  { value: 'Busy', label: 'Busy (مشغول)', color: 'orange' },
  { value: 'Callback Requested', label: 'Callback (طلب رد)', color: 'blue' },
];

export default function CallsHistoryPage() {
  const supabase = createClient();

  const [callLogs, setCallLogs] = useState<CallLogWithLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Today's numbers only, so every day starts from 0 (Mido, 2026-11-08). A rep sees her
  // own calls; an admin sees the whole team's.
  const [stats, setStats] = useState({ today: 0, answered: 0, missed: 0 });
  // null = not resolved yet. `mine` is the user id to filter by, or '' for admins.
  const [mine, setMine] = useState<string | null>(null);

  const [outcomeFilter, setOutcomeFilter] = useState<string | undefined>();
  const [typeFilter, setTypeFilter] = useState<CallType | undefined>();
  const [search, setSearch] = useState('');
  const fetchCallLogsRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return setMine('');
      const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      setMine(me?.role === 'admin' || me?.role === 'Manager' ? '' : user.id);
    })();
  }, [supabase]);

  const fetchStats = useCallback(async () => {
    if (mine === null) return;
    try {
      // Midnight on this device (the team is in Cairo), recomputed on every refresh so
      // the cards roll over to 0 at midnight without a reload.
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const base = () => {
        let q = supabase
          .from('call_logs')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', today.toISOString());
        if (mine) q = q.eq('created_by', mine);
        return q;
      };
      const [all, answered, missed] = await Promise.all([
        base(),
        base().eq('outcome', 'Answered'),
        base().in('outcome', ['No Answer', 'Busy']),
      ]);
      setStats({
        today: all.count || 0,
        answered: answered.count || 0,
        missed: missed.count || 0,
      });
    } catch (err) {
      console.error('Failed to fetch call stats:', err);
    }
  }, [supabase, mine]);

  // Live without a database subscription: postgres_changes took the DB down on
  // 2026-10-19, so the cards and the list poll every 30 s while the tab is visible,
  // and refresh as soon as the user comes back to it.
  useEffect(() => {
    fetchStats();
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      fetchStats();
      fetchCallLogsRef.current?.();
    };
    const id = setInterval(tick, 30_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [fetchStats]);

  const fetchCallLogs = useCallback(async (p = page) => {
    if (mine === null) return;
    setLoading(true);
    try {
      // Searching filters on the joined lead's name, which needs an inner join
      // (an .or() on an embedded column is rejected by PostgREST).
      const term = search.trim().replace(/[%,()]/g, '');
      const leadJoin = term ? 'leads!call_logs_lead_id_fkey!inner(name, source)' : 'leads!call_logs_lead_id_fkey(name, source)';
      let query = supabase
        .from('call_logs')
        .select(`*, ${leadJoin}`, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range((p - 1) * pageSize, p * pageSize - 1);

      if (term) {
        query = query.ilike('leads.name', `%${term}%`);
      }
      // This page is "my calls" for a rep. RLS also lets her see calls others logged on
      // her own leads; those stay in the lead's timeline, not here.
      if (mine) {
        query = query.eq('created_by', mine);
      }
      if (outcomeFilter) {
        query = query.eq('outcome', outcomeFilter);
      }
      if (typeFilter) {
        query = query.eq('call_type', typeFilter);
      }

      const { data, count, error } = await query;
      if (error) throw error;

      const mapped = (data || []).map((item: Record<string, unknown>) => ({
        ...item,
        lead_name: (item.leads as Record<string, unknown>)?.name as string || 'Unknown',
        lead_source: (item.leads as Record<string, unknown>)?.source as string || 'Unknown',
      })) as CallLogWithLead[];

      setCallLogs(mapped);
      setTotal(count || 0);
    } catch {
      message.error('فشل تحميل سجلات المكالمات');
    } finally {
      setLoading(false);
    }
  }, [supabase, page, search, outcomeFilter, typeFilter, mine]);

  useEffect(() => {
    fetchCallLogsRef.current = () => fetchCallLogs();
  }, [fetchCallLogs]);

  useEffect(() => {
    fetchCallLogs(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outcomeFilter, typeFilter, mine]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchCallLogs(1);
    }, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const getOutcomeConfig = (outcome: string) =>
    OUTCOME_OPTIONS.find((o) => o.value === outcome) || { value: outcome, label: outcome, color: 'default' };

  const columns: ColumnsType<CallLogWithLead> = [
    {
      title: 'العميل (Lead)',
      dataIndex: 'lead_name',
      key: 'lead_name',
      width: 200,
      render: (name: string, record: CallLogWithLead) => (
        <div>
          <Text strong>{name || 'Unknown'}</Text>
          {record.lead_id && (
            <Text type="secondary" className="block text-xs">
              ID: {record.lead_id.slice(0, 8)}
            </Text>
          )}
        </div>
      ),
    },
    {
      title: 'المصدر (Source)',
      dataIndex: 'lead_source',
      key: 'lead_source',
      width: 120,
      render: (source: string) => {
        const colors: Record<string, string> = {
          WhatsApp: '#25D366',
          Meta: '#0081FC',
          Direct: '#8C8C8C',
          Phone: '#FAAD14',
        };
        return <Tag color={colors[source] || '#8C8C8C'}>{source || '—'}</Tag>;
      },
    },
    {
      title: 'النوع (Type)',
      dataIndex: 'call_type',
      key: 'call_type',
      width: 120,
      render: (type: CallType) => (
        <Tag color={type === 'Inbound' ? 'blue' : 'purple'}>
          {type === 'Inbound' ? 'Incoming (وارد)' : 'Outbound (صادر)'}
        </Tag>
      ),
    },
    {
      title: 'النتيجة (Outcome)',
      dataIndex: 'outcome',
      key: 'outcome',
      width: 150,
      render: (outcome: CallOutcome) => {
        const config = getOutcomeConfig(outcome);
        return <Tag color={config.color}>{config.label}</Tag>;
      },
    },
    {
      title: 'المدة (Duration)',
      dataIndex: 'duration_minutes',
      key: 'duration_minutes',
      width: 120,
      render: (minutes: number) => (
        <Space size="small">
          <ClockCircleOutlined />
          <Text>{minutes ? `${minutes} min` : '—'}</Text>
        </Space>
      ),
    },
    {
      title: 'التاريخ (Date)',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (date: string) => formatDate(date),
    },
  ];

  return (
    <div className="space-y-4">
      <Row justify="space-between" align="middle">
        <Col>
          <Title level={4} style={{ margin: 0 }}>
            سجل المكالمات (Calls History)
          </Title>
          <Text type="secondary">
            {total} مكالمة — Call Center
          </Text>
        </Col>
        <Col>
          <Button type="primary" icon={<PhoneOutlined />} onClick={() => { fetchCallLogs(); fetchStats(); }}>
            تحديث (Refresh)
          </Button>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="مكالمات النهارده (Today)"
              value={stats.today}
              prefix={<PhoneOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="تم الرد النهارده (Answered)"
              value={stats.answered}
              prefix={<PhoneOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="مردّش / مشغول (No answer / Busy)"
              value={stats.missed}
              prefix={<PhoneOutlined />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
      </Row>

      <div className="bg-white rounded-xl p-4 shadow-sm">
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} md={8}>
            <Input
              prefix={<SearchOutlined />}
              placeholder="بحث بالعميل..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              allowClear
            />
          </Col>
          <Col xs={12} md={6}>
            <Select
              placeholder="النتيجة (Outcome)"
              value={outcomeFilter}
              onChange={(v) => { setOutcomeFilter(v); setPage(1); }}
              allowClear
              className="w-full"
              options={OUTCOME_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            />
          </Col>
          <Col xs={12} md={6}>
            <Select
              placeholder="النوع (Type)"
              value={typeFilter}
              onChange={(v) => { setTypeFilter(v); setPage(1); }}
              allowClear
              className="w-full"
              options={CALL_TYPE_OPTIONS.map((t) => ({ value: t.value, label: t.label }))}
            />
          </Col>
          <Col xs={24} md={4}>
            <Button icon={<FilterOutlined />} onClick={() => { setPage(1); fetchCallLogs(1); }} block>
              تصفية (Filter)
            </Button>
          </Col>
        </Row>
      </div>

      <div className="bg-white rounded-xl overflow-hidden shadow-sm">
        <Table
          columns={columns}
          dataSource={callLogs}
          rowKey="id"
          loading={loading}
          scroll={{ x: 800 }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: false,
            showTotal: (t) => `${t} مكالمة`,
            onChange: (p) => { setPage(p); fetchCallLogs(p); },
          }}
        />
      </div>
    </div>
  );
}