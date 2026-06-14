'use client';

import { useState, useEffect } from 'react';
import {
  Table, Tag, Button, Typography, Row, Col, message,
  Card, Statistic, Input, Dropdown, Modal, Form, Alert, Switch,
} from 'antd';
import {
  SearchOutlined, EnvironmentOutlined,
  PhoneOutlined, StarOutlined,
  MoreOutlined, UserAddOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { createClient } from '@/lib/supabase/client';
import { useOrg } from '@/context/OrgContext';
import { formatDate } from '@/lib/utils';

const { Title, Text } = Typography;

interface ScrapedLead {
  id: string;
  business_name: string | null;
  category: string | null;
  phone: string | null;
  address: string | null;
  rating: number | null;
  website: string | null;
  source_location: string | null;
  status: string;
  scraped_at: string;
}

interface ScrapeTarget {
  id: string;
  query: string;
  region: string;
  status: string;
  last_run_at: string | null;
  results_count: number | null;
  created_at: string;
}

export default function ScraperPage() {
  const supabase = createClient();
  const { currentOrgId } = useOrg();
  const [leads, setLeads] = useState<ScrapedLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [scrapeModalOpen, setScrapeModalOpen] = useState(false);
  const [scraping, setScraping] = useState(false);
  // T075: auto-intake toggle — when enabled, scraper results are POSTed to /api/automation/intake
  const [autoIntake, setAutoIntake] = useState(false);
  const [scrapeForm] = Form.useForm();
  const [targetForm] = Form.useForm();
  const [targets, setTargets] = useState<ScrapeTarget[]>([]);
  const [targetsLoading, setTargetsLoading] = useState(false);
  const [queuing, setQueuing] = useState(false);

  const fetchLeads = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('scraped_leads')
      .select('*')
      .order('scraped_at', { ascending: false });
    if (error) message.error('فشل تحميل البيانات');
    else setLeads((data || []) as ScrapedLead[]);
    setLoading(false);
  };

  const fetchTargets = async () => {
    setTargetsLoading(true);
    const { data, error } = await supabase
      .from('scrape_targets')
      .select('id,query,region,status,last_run_at,results_count,created_at')
      .order('created_at', { ascending: false });
    if (error) message.error('فشل تحميل قائمة السبت');
    else setTargets((data || []) as ScrapeTarget[]);
    setTargetsLoading(false);
  };

  const handleQueueTarget = async () => {
    try {
      await targetForm.validateFields();
      setQueuing(true);
      const values = targetForm.getFieldsValue();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { message.error('يجب تسجيل الدخول'); return; }
      const { error } = await supabase.from('scrape_targets').insert({
        query: values.query,
        region: values.region,
        status: 'queued',
        requested_by: user.id,
      });
      if (error) { message.error(error.message); return; }
      message.success('تمت الإضافة لقائمة السحب يوم السبت');
      targetForm.resetFields();
      fetchTargets();
    } catch (error: unknown) {
      if (error instanceof Error && error.name !== 'ValidationError') {
        message.error(error.message || 'حدث خطأ');
      }
    } finally {
      setQueuing(false);
    }
  };

  useEffect(() => { fetchLeads(); fetchTargets(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const addToCRM = async (lead: ScrapedLead) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { message.error('يجب تسجيل الدخول'); return; }

    const { error: insertError } = await supabase.from('leads').insert({
      name: lead.business_name || 'Unknown',
      phone: lead.phone || '',
      source: 'Direct',
      status: 'New',
      assigned_to: user.id,
      assigned_to_user: user.id,
      created_by: user.id,
      company: lead.business_name,
      notes: `Scraped from ${lead.source_location || 'Google Maps'}. Rating: ${lead.rating || 'N/A'}`,
      org_id: currentOrgId,
    });

    if (insertError) { message.error('فشل الإضافة'); return; }

    await supabase.from('scraped_leads').update({ status: 'Added to CRM' }).eq('id', lead.id);
    message.success(`تم إضافة "${lead.business_name}" للعملاء`);
    fetchLeads();
  };

  const handleScrape = async () => {
    try {
      await scrapeForm.validateFields();
      setScraping(true);

      // Simulation of scraping for deployment
      await new Promise(r => setTimeout(r, 2000));

      const mockCount = 10;
      message.info(`Scraper activation pending API setup. Showing ${mockCount} mock leads for demonstration.`);

      // T075: if auto-intake is enabled, POST the results to /api/automation/intake
      if (autoIntake) {
        try {
          const mockRecords = Array.from({ length: mockCount }, (_, i) => ({
            name: `Scraped Lead ${i + 1}`,
            phone: `+2010000000${String(i).padStart(2, '0')}`,
            company: `Company ${i + 1}`,
            source: 'Direct',
          }));
          const res = await fetch('/api/automation/intake', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(mockRecords),
          });
          const data = await res.json();
          if (res.ok) {
            message.success(`🤖 Auto-intake: ${data.created} created, ${data.duplicates} duplicates, ${data.errors} errors`);
          } else {
            message.error(`Auto-intake failed: ${data.error || 'unknown'}`);
          }
        } catch {
          message.error('Auto-intake failed (network)');
        }
      }

      setScrapeModalOpen(false);
      scrapeForm.resetFields();
      fetchLeads(); // Refresh table to show existing + mock if any
    } catch (error: unknown) {
      if (error instanceof Error && error.name !== 'ValidationError') {
        message.error(error.message || 'حدث خطأ أثناء الاستخراج');
      }
    } finally {
      setScraping(false);
    }
  };

  const filtered = leads.filter(l =>
    (l.business_name || '').toLowerCase().includes(searchText.toLowerCase()) ||
    (l.category || '').toLowerCase().includes(searchText.toLowerCase())
  );

  const newCount = leads.filter(l => l.status === 'New').length;
  const addedCount = leads.filter(l => l.status === 'Added to CRM').length;

  const columns: ColumnsType<ScrapedLead> = [
    {
      title: 'الشركة (Business)', dataIndex: 'business_name', key: 'name', width: 220,
      render: (n: string | null) => <Text strong>{n || '—'}</Text>,
    },
    { title: 'الفئة (Category)', dataIndex: 'category', key: 'category', width: 150, render: (c: string | null) => c || '—' },
    {
      title: 'الهاتف', dataIndex: 'phone', key: 'phone', width: 140,
      render: (p: string | null) => p ? <a href={`tel:${p}`}><PhoneOutlined /> {p}</a> : '—',
    },
    {
      title: 'التقييم', dataIndex: 'rating', key: 'rating', width: 90,
      render: (r: number | null) => r ? <><StarOutlined style={{ color: '#FAAD14' }} /> {r}</> : '—',
    },
    {
      title: 'الحالة', dataIndex: 'status', key: 'status', width: 120,
      render: (s: string) => <Tag color={s === 'Added to CRM' ? 'green' : s === 'Duplicate' ? 'orange' : 'blue'}>{s}</Tag>,
    },
    { title: 'التاريخ', dataIndex: 'scraped_at', key: 'date', width: 120, render: (d: string) => formatDate(d) },
    {
      title: '', key: 'actions', width: 60,
      render: (_: unknown, r: ScrapedLead) => (
        <Dropdown menu={{ items: [
          { key: 'add', label: 'أضف للعملاء', icon: <UserAddOutlined />, onClick: () => addToCRM(r), disabled: r.status === 'Added to CRM' },
        ]}} trigger={['click']}>
          <Button type="text" icon={<MoreOutlined />} size="small" />
        </Dropdown>
      ),
    },
  ];

  const targetColumns: ColumnsType<ScrapeTarget> = [
    { title: 'الكلمات', dataIndex: 'query', key: 'query' },
    { title: 'المنطقة', dataIndex: 'region', key: 'region' },
    {
      title: 'الحالة', dataIndex: 'status', key: 'status',
      render: (s: string) => {
        const colors: Record<string, string> = { queued: 'blue', running: 'gold', done: 'green', failed: 'red' };
        return <Tag color={colors[s] || 'default'}>{s}</Tag>;
      },
    },
    { title: 'آخر تشغيل', dataIndex: 'last_run_at', key: 'last_run_at', render: (d: string | null) => d ? formatDate(d) : '—' },
    { title: 'النتائج', dataIndex: 'results_count', key: 'results_count', render: (c: number | null) => c ?? '—' },
  ];

  return (
    <div className="space-y-4">
      <Row justify="space-between" align="middle">
        <Col>
          <Title level={4} style={{ margin: 0 }}>استخراج عملاء (Maps Scraper)</Title>
          <div className="mt-2 flex items-center gap-2">
            <Switch
              checked={autoIntake}
              onChange={setAutoIntake}
              checkedChildren="Auto-intake ON"
              unCheckedChildren="Auto-intake OFF"
            />
            <Text type="secondary" className="text-xs">
              عند التفعيل: يتم إرسال النتائج تلقائيًا إلى /api/automation/intake
            </Text>
          </div>
        </Col>
        <Col>
          <Button type="primary" icon={<SearchOutlined />} onClick={() => setScrapeModalOpen(true)}
            style={{ backgroundColor: '#D72B2B', borderColor: '#D72B2B' }}>
            استخراج جديد (New Scrape)
          </Button>
        </Col>
      </Row>

      <Alert
        message="Maps Scraper is currently in demo mode"
        description="Scraper activation pending API setup. Visual demonstration only."
        type="warning"
        showIcon
        className="mb-4 rounded-xl"
      />

      <Row gutter={16}>
        <Col xs={8}><Card><Statistic title="إجمالي" value={leads.length} prefix={<EnvironmentOutlined />} /></Card></Col>
        <Col xs={8}><Card><Statistic title="جديد" value={newCount} valueStyle={{ color: '#1890FF' }} /></Card></Col>
        <Col xs={8}><Card><Statistic title="مضاف للعملاء" value={addedCount} valueStyle={{ color: '#52c41a' }} prefix={<UserAddOutlined />} /></Card></Col>
      </Row>

      <Card title="قائمة السبت — إضافة جديدة">
        <Form form={targetForm} layout="inline" onFinish={handleQueueTarget}>
          <Form.Item name="query" label="الكلمات" rules={[{ required: true, message: 'الحقل مطلوب' }]}>
            <Input placeholder="e.g. HVAC companies" style={{ width: 300 }} />
          </Form.Item>
          <Form.Item name="region" label="المنطقة" rules={[{ required: true, message: 'الحقل مطلوب' }]}>
            <Input placeholder="e.g. Cairo, Egypt" style={{ width: 300 }} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={queuing}
              style={{ backgroundColor: '#D72B2B', borderColor: '#D72B2B' }}>
              أضف لقائمة السبت
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Card title="قائمة السبت — المهام المجدولة">
        <Table columns={targetColumns} dataSource={targets} rowKey="id"
          loading={targetsLoading} scroll={{ x: 700 }} pagination={{ pageSize: 10 }}
          locale={{ emptyText: 'لا توجد مهام مجدولة' }} />
      </Card>

      <Input placeholder="بحث بالاسم أو الفئة..." prefix={<SearchOutlined />} value={searchText}
        onChange={e => setSearchText(e.target.value)} className="mb-3" style={{ maxWidth: 400 }} allowClear />

      <div className="bg-white rounded-xl overflow-hidden shadow-sm border border-slate-100">
        <Table columns={columns} dataSource={filtered} rowKey="id" loading={loading} scroll={{ x: 900 }} pagination={{ pageSize: 20 }} />
      </div>

      <Modal title="استخراج عملاء جُدد (New Scrape)" open={scrapeModalOpen}
        onCancel={() => !scraping && setScrapeModalOpen(false)} onOk={handleScrape}
        okText={scraping ? "جاري الاستخراج..." : "بدء الاستخراج"} cancelText="إلغاء"
        confirmLoading={scraping}
        okButtonProps={{ 
          style: { backgroundColor: '#D72B2B', borderColor: '#D72B2B' },
          disabled: true 
        }} width={480}>
        <Form form={scrapeForm} layout="vertical">
          <Form.Item name="query" label="بحث (Search Query)" rules={[{ required: true }]}>
            <Input placeholder="e.g. HVAC companies in Cairo" disabled />
          </Form.Item>
          <Form.Item name="location" label="الموقع (Location)">
            <Input placeholder="e.g. Cairo, Egypt" disabled />
          </Form.Item>
        </Form>
        <Alert
          message="Scraper activation pending API setup"
          type="error"
          showIcon
          className="mt-4"
        />
      </Modal>
    </div>
  );
}
