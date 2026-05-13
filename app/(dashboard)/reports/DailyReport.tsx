'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { DatePicker, Table, Tag, Typography, Spin, Row, Col, Card, Statistic } from 'antd';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell, LineChart, Line,
} from 'recharts';
import { WarningOutlined, RiseOutlined, FallOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { ColumnsType } from 'antd/es/table';

const { Text } = Typography;

type UserSummary = {
  userId: string;
  name: string;
  leadsCreated: number;
  callsMade: number;
  boqsCreated: number;
  tasksCompleted: number;
};

type OverdueLead = {
  id: string;
  name: string;
  phone: string | null;
  assigned_name: string | null;
  next_follow_up: string | null;
  days_old: number;
};

type TrendDay = {
  date: string;
  leads: number;
  calls: number;
  boqs: number;
};

type DailyData = {
  newLeads: { id: string; name: string; source: string; assigned_name: string | null }[];
  userSummaries: UserSummary[];
  overdueLeads: OverdueLead[];
  trend: TrendDay[];
  prevDayStats: { leads: number; calls: number; boqs: number };
  todayStats: { leads: number; calls: number; boqs: number };
};

const CHART_COLORS = ['#D72B2B', '#1890ff', '#52c41a', '#faad14', '#722ed1'];

export default function DailyReport() {
  const supabase = createClient();
  const [selectedDate, setSelectedDate] = useState<dayjs.Dayjs>(dayjs().subtract(1, 'day'));
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DailyData | null>(null);

  const fetchReport = useCallback(async (date: dayjs.Dayjs) => {
    setLoading(true);
    const start = date.startOf('day').toISOString();
    const end = date.endOf('day').toISOString();
    const threeDaysAgo = dayjs().subtract(3, 'day').toISOString();
    const trendStart = dayjs().subtract(7, 'day').startOf('day').toISOString();

    const [
      { data: leads },
      { data: callLogs },
      { data: boqs },
      { data: tasks },
      { data: overdueRaw },
      { data: trendLeads },
      { data: trendCalls },
      { data: trendBoqs },
    ] = await Promise.all([
      supabase
        .from('leads')
        .select('id, name, source, assigned_user:profiles!leads_assigned_to_user_fkey(name), created_by, created_at')
        .gte('created_at', start)
        .lte('created_at', end),
      supabase
        .from('call_logs')
        .select('user_id, profiles!call_logs_user_id_fkey(id, name)')
        .gte('created_at', start)
        .lte('created_at', end),
      supabase
        .from('boqs')
        .select('created_by, profiles!boqs_created_by_fkey(id, name)')
        .gte('created_at', start)
        .lte('created_at', end),
      supabase
        .from('tasks')
        .select('assigned_to, profiles!tasks_assigned_to_fkey(id, name)')
        .eq('status', 'done')
        .gte('completed_at', start)
        .lte('completed_at', end),
      supabase
        .from('leads')
        .select('id, name, phone, next_follow_up, created_at, assigned_user:profiles!leads_assigned_to_user_fkey(name)')
        .in('status', ['New', 'Interested'])
        .or(`next_follow_up.is.null,next_follow_up.lt.${threeDaysAgo}`)
        .lt('created_at', threeDaysAgo)
        .order('created_at', { ascending: true })
        .limit(20),
      supabase.from('leads').select('created_at').gte('created_at', trendStart),
      supabase.from('call_logs').select('created_at').gte('created_at', trendStart),
      supabase.from('boqs').select('created_at').gte('created_at', trendStart),
    ]);

    const userMap: Record<string, UserSummary> = {};
    const ensure = (id: string, name: string) => {
      if (!userMap[id]) userMap[id] = { userId: id, name, leadsCreated: 0, callsMade: 0, boqsCreated: 0, tasksCompleted: 0 };
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (leads || []).forEach((l: any) => {
      if (l.created_by) {
        const name = l.assigned_user?.name ?? l.created_by;
        ensure(l.created_by, name);
        userMap[l.created_by].leadsCreated++;
      }
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (callLogs || []).forEach((c: any) => {
      const p = c['profiles'];
      if (p?.id) { ensure(p.id, p.name); userMap[p.id].callsMade++; }
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (boqs || []).forEach((b: any) => {
      const p = b['profiles'];
      if (p?.id) { ensure(p.id, p.name); userMap[p.id].boqsCreated++; }
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (tasks || []).forEach((t: any) => {
      const p = t['profiles'];
      if (p?.id) { ensure(p.id, p.name); userMap[p.id].tasksCompleted++; }
    });

    const dayBuckets: Record<string, TrendDay> = {};
    for (let i = 6; i >= 0; i--) {
      const d = dayjs().subtract(i, 'day').format('MM/DD');
      dayBuckets[d] = { date: d, leads: 0, calls: 0, boqs: 0 };
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (trendLeads || []).forEach((l: any) => { const d = dayjs(l.created_at).format('MM/DD'); if (dayBuckets[d]) dayBuckets[d].leads++; });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (trendCalls || []).forEach((c: any) => { const d = dayjs(c.created_at).format('MM/DD'); if (dayBuckets[d]) dayBuckets[d].calls++; });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (trendBoqs || []).forEach((b: any) => { const d = dayjs(b.created_at).format('MM/DD'); if (dayBuckets[d]) dayBuckets[d].boqs++; });

    const trend = Object.values(dayBuckets);
    const todayIdx = trend.length - 1;
    const prevIdx = trend.length - 2;

    setData({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      newLeads: (leads || []).map((l: any) => ({
        id: l.id,
        name: l.name,
        source: l.source,
        assigned_name: l.assigned_user?.name ?? null,
      })),
      userSummaries: Object.values(userMap).sort((a, b) =>
        (b.leadsCreated + b.callsMade + b.boqsCreated + b.tasksCompleted) -
        (a.leadsCreated + a.callsMade + a.boqsCreated + a.tasksCompleted)
      ),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      overdueLeads: (overdueRaw || []).map((l: any) => ({
        id: l.id,
        name: l.name,
        phone: l.phone,
        assigned_name: l.assigned_user?.name ?? null,
        next_follow_up: l.next_follow_up,
        days_old: dayjs().diff(dayjs(l.created_at), 'day'),
      })),
      trend,
      prevDayStats: trend[prevIdx] ?? { leads: 0, calls: 0, boqs: 0 },
      todayStats: trend[todayIdx] ?? { leads: 0, calls: 0, boqs: 0 },
    });

    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchReport(selectedDate); }, [selectedDate, fetchReport]);

  if (loading) return <div className="flex justify-center py-20"><Spin size="large" /></div>;
  if (!data) return null;

  const userColumns: ColumnsType<UserSummary> = [
    { title: 'الموظف', dataIndex: 'name', key: 'name', render: (n: string) => <Text strong>{n}</Text> },
    { title: 'Leads', dataIndex: 'leadsCreated', key: 'leads', align: 'center', render: (v: number) => <Tag color={v > 0 ? 'green' : 'default'}>{v}</Tag> },
    { title: 'Calls', dataIndex: 'callsMade', key: 'calls', align: 'center', render: (v: number) => <Tag color={v > 0 ? 'blue' : 'default'}>{v}</Tag> },
    { title: 'BOQs', dataIndex: 'boqsCreated', key: 'boqs', align: 'center', render: (v: number) => <Tag color={v > 0 ? 'purple' : 'default'}>{v}</Tag> },
    { title: 'Tasks ✓', dataIndex: 'tasksCompleted', key: 'tasks', align: 'center', render: (v: number) => <Tag color={v > 0 ? 'orange' : 'default'}>{v}</Tag> },
  ];

  const overdueColumns: ColumnsType<OverdueLead> = [
    { title: 'الاسم', dataIndex: 'name', key: 'name' },
    { title: 'الهاتف', dataIndex: 'phone', key: 'phone', render: (p: string) => p || '—' },
    { title: 'المعين', dataIndex: 'assigned_name', key: 'assigned', render: (n: string) => n || '—' },
    { title: 'أيام بلا متابعة', dataIndex: 'days_old', key: 'days', render: (d: number) => <Tag color={d > 7 ? 'red' : 'orange'}>{d} يوم</Tag> },
  ];

  const trendIcon = (key: 'leads' | 'calls' | 'boqs') => {
    const prev = data.prevDayStats[key];
    const curr = data.todayStats[key];
    if (prev === 0) return null;
    const pct = Math.round(((curr - prev) / prev) * 100);
    return pct >= 0
      ? <Text type="success"><RiseOutlined /> +{pct}%</Text>
      : <Text type="danger"><FallOutlined /> {pct}%</Text>;
  };

  const leadsBySource = ['WhatsApp', 'Meta', 'Direct', 'Phone'].map(s => ({
    name: s, value: data.newLeads.filter(l => l.source === s).length,
  })).filter(s => s.value > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Text strong>التقرير ليوم:</Text>
        <DatePicker
          value={selectedDate}
          onChange={(d) => d && setSelectedDate(d)}
          disabledDate={(d) => d.isAfter(dayjs())}
          allowClear={false}
        />
      </div>

      <Row gutter={16}>
        <Col span={6}><Card><Statistic title="Leads جديدة" value={data.newLeads.length} suffix={trendIcon('leads')} /></Card></Col>
        <Col span={6}><Card><Statistic title="Calls" value={data.todayStats.calls} suffix={trendIcon('calls')} /></Card></Col>
        <Col span={6}><Card><Statistic title="BOQs" value={data.todayStats.boqs} suffix={trendIcon('boqs')} /></Card></Col>
        <Col span={6}><Card><Statistic title="Overdue Leads" value={data.overdueLeads.length} valueStyle={{ color: data.overdueLeads.length > 0 ? '#cf1322' : undefined }} /></Card></Col>
      </Row>

      <Card title="نشاط الفريق">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data.userSummaries} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="leadsCreated" name="Leads" fill="#D72B2B" />
            <Bar dataKey="callsMade" name="Calls" fill="#1890ff" />
            <Bar dataKey="boqsCreated" name="BOQs" fill="#722ed1" />
            <Bar dataKey="tasksCompleted" name="Tasks ✓" fill="#52c41a" />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Row gutter={16}>
        <Col span={16}>
          <Card title="Leads آخر 7 أيام">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data.trend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="leads" name="Leads" stroke="#D72B2B" strokeWidth={2} dot />
                <Line type="monotone" dataKey="calls" name="Calls" stroke="#1890ff" strokeWidth={2} dot />
                <Line type="monotone" dataKey="boqs" name="BOQs" stroke="#722ed1" strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col span={8}>
          <Card title="Leads بالمصدر">
            {leadsBySource.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={leadsBySource} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }: { name?: string; value?: number }) => `${name ?? ''}: ${value ?? ''}`}>
                    {leadsBySource.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : <Text type="secondary">لا توجد leads لهذا اليوم</Text>}
          </Card>
        </Col>
      </Row>

      <Card title={`ملخص الموظفين — ${selectedDate.format('YYYY-MM-DD')}`}>
        <Table
          dataSource={data.userSummaries}
          columns={userColumns}
          rowKey="userId"
          pagination={false}
          size="small"
        />
      </Card>

      {data.newLeads.length > 0 && (
        <Card title={`الـ Leads الجديدة (${data.newLeads.length})`}>
          <Table
            dataSource={data.newLeads}
            rowKey="id"
            pagination={false}
            size="small"
            columns={[
              { title: 'الاسم', dataIndex: 'name', key: 'name' },
              { title: 'المصدر', dataIndex: 'source', key: 'source', render: (s: string) => <Tag>{s}</Tag> },
              { title: 'المعين', dataIndex: 'assigned_name', key: 'assigned', render: (n: string) => n || '—' },
            ]}
          />
        </Card>
      )}

      {data.overdueLeads.length > 0 && (
        <Card
          title={<span><WarningOutlined className="text-red-500 mr-2" />Leads بدون متابعة ({data.overdueLeads.length})</span>}
          style={{ borderColor: '#ff4d4f' }}
        >
          <Table
            dataSource={data.overdueLeads}
            columns={overdueColumns}
            rowKey="id"
            pagination={false}
            size="small"
          />
        </Card>
      )}
    </div>
  );
}
