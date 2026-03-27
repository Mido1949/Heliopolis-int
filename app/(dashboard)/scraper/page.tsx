'use client';

import { useState, useEffect } from 'react';
import {
  Table, Tag, Button, Typography, Row, Col, message,
  Card, Statistic, Input, Dropdown, Modal, Form, Alert,
} from 'antd';
import {
  SearchOutlined, EnvironmentOutlined,
  PhoneOutlined, StarOutlined,
  MoreOutlined, UserAddOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { createClient } from '@/lib/supabase/client';
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

export default function ScraperPage() {
  const supabase = createClient();
  const [leads, setLeads] = useState<ScrapedLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [scrapeModalOpen, setScrapeModalOpen] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [scrapeForm] = Form.useForm();

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

  useEffect(() => { fetchLeads(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const addToCRM = async (lead: ScrapedLead) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { message.error('يجب تسجيل الدخول'); return; }

    const { error: insertError } = await supabase.from('leads').insert({
      name: lead.business_name || 'Unknown',
      phone: lead.phone || '',
      source: 'Direct',
      status: 'New',
      assigned_to: user.id,
      company: lead.business_name,
      notes: `Scraped from ${lead.source_location || 'Google Maps'}. Rating: ${lead.rating || 'N/A'}`,
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

  return (
    <div className="space-y-4">
      <Row justify="space-between" align="middle">
        <Col><Title level={4} style={{ margin: 0 }}>استخراج عملاء (Maps Scraper)</Title></Col>
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
