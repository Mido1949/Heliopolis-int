'use client';

import { useState, useEffect } from 'react';
import {
  Table, Tag, Button, Typography, Row, Col, message,
  Statistic, Dropdown, Space, Tooltip, Input,
} from 'antd';
import {
  PlusOutlined, MailOutlined, SendOutlined,
  DeleteOutlined, MoreOutlined, EyeOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { createClient } from '@/lib/supabase/client';
import { formatDate } from '@/lib/utils';

const { Title, Text } = Typography;
import EmailEditor from '@/components/email/EmailEditor';

interface Campaign {
  id: string;
  subject: string;
  from_name: string;
  body: string;
  status: string;
  sent_count: number;
  opened_count: number;
  created_at: string;
  sent_at: string | null;
}

export default function EmailPage() {
  const supabase = createClient();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const fetchCampaigns = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('email_campaigns')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) message.error('فشل تحميل الحملات');
    else setCampaigns((data || []) as Campaign[]);
    setLoading(false);
  };

  useEffect(() => { fetchCampaigns(); }, []); // eslint-disable-line react-hooks/exhaustive-deps


  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('email_campaigns').delete().eq('id', id);
    if (error) message.error('فشل الحذف');
    else { message.success('تم الحذف'); fetchCampaigns(); }
  };

  // Filters
  const [search, setSearch] = useState('');

  const filteredCampaigns = campaigns.filter(c => 
    c.subject.toLowerCase().includes(search.toLowerCase()) || 
    c.from_name.toLowerCase().includes(search.toLowerCase())
  );

  const totalSent = campaigns.reduce((s, c) => s + (c.sent_count || 0), 0);
  const totalOpened = campaigns.reduce((s, c) => s + (c.opened_count || 0), 0);
  const openRate = totalSent > 0 ? ((totalOpened / totalSent) * 100).toFixed(1) : '0';

  const columns: ColumnsType<Campaign> = [
    {
      title: 'الموضوع (Subject)', dataIndex: 'subject', key: 'subject',
      render: (s: string) => (
        <div className="flex flex-col">
          <Text strong className="text-slate-800">{s}</Text>
        </div>
      ),
    },
    {
      title: 'اسم المرسل (Sender)', dataIndex: 'from_name', key: 'from_name', width: 180,
      render: (s: string) => (
        <Space>
          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs text-slate-500 font-bold">
            {s ? s.charAt(0).toUpperCase() : 'L'}
          </div>
          <Text>{s || '-'}</Text>
        </Space>
      ),
    },
    {
      title: 'الحالة', dataIndex: 'status', key: 'status', width: 120,
      render: (s: string) => (
        <Tag 
          color={s === 'Sent' ? '#52c41a' : '#d9d9d9'} 
          className="rounded-full px-3 border-none"
        >
          {s === 'Sent' ? 'مرسل' : 'مسودة'}
        </Tag>
      ),
    },
    {
      title: 'الإحصائيات', key: 'stats', width: 150,
      render: (_, r) => (
        <div className="flex items-center gap-4">
          <Tooltip title="عدد المرسل إليهم">
            <div className="flex items-center gap-1 text-slate-500 text-xs">
              <SendOutlined className="text-[10px]" />
              {r.sent_count || 0}
            </div>
          </Tooltip>
          <Tooltip title="عدد مرات الفتح">
            <div className="flex items-center gap-1 text-green-600 text-xs">
              <EyeOutlined className="text-[10px]" />
              {r.opened_count || 0}
            </div>
          </Tooltip>
        </div>
      ),
    },
    {
      title: 'التاريخ', dataIndex: 'created_at', key: 'created_at', width: 140, 
      render: (d: string) => <Text type="secondary" style={{ fontSize: '12px' }}>{formatDate(d)}</Text>,
    },
    {
      title: '', key: 'actions', width: 60, fixed: 'right',
      render: (_: unknown, r: Campaign) => (
        <Dropdown menu={{ items: [
          { 
            key: 'send', 
            label: (
              <Tooltip title="Email sending will be configured after domain verification">
                <span>إرسال الحملة (Send)</span>
              </Tooltip>
            ), 
            icon: <SendOutlined />, 
            disabled: true,
            onClick: () => {} 
          },
          { type: 'divider' },
          { 
            key: 'delete', 
            label: 'حذف (Delete)', 
            icon: <DeleteOutlined />, 
            danger: true, 
            disabled: r.status === 'Sent',
            onClick: () => handleDelete(r.id) 
          },
        ]}} trigger={['click']}>
          <Button type="text" icon={<MoreOutlined />} className="hover:bg-slate-100" />
        </Dropdown>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex justify-between items-end">
        <div>
          <Title level={3} style={{ margin: 0, fontWeight: 800 }}>حملات البريد (Email)</Title>
          <Text type="secondary">إدارة حملات التسويق والتواصل المباشر</Text>
        </div>
        <Button 
          type="primary" 
          icon={<PlusOutlined />} 
          size="large"
          onClick={() => setModalOpen(true)}
          className="bg-[#D72B2B] hover:bg-[#b02323] border-none px-8 rounded-xl h-12 font-bold shadow-lg shadow-red-100"
        >
          حملة جديدة (New Campaign)
        </Button>
      </div>

      {/* Stats Grid */}
      <Row gutter={[20, 20]}>
        <Col xs={24} sm={12} lg={8}>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <Statistic 
              title={<span className="text-slate-400 font-medium">إجمالي الحملات</span>} 
              value={campaigns.length} 
              prefix={<MailOutlined className="text-slate-300 me-2" />} 
              valueStyle={{ fontWeight: 800, color: '#0D2137' }}
            />
          </div>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <Statistic 
              title={<span className="text-slate-400 font-medium">الرسائل المرسلة</span>} 
              value={totalSent} 
              prefix={<SendOutlined className="text-slate-300 me-2" />} 
              valueStyle={{ fontWeight: 800, color: '#0D2137' }}
            />
          </div>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <Statistic 
              title={<span className="text-slate-400 font-medium">نسبة التفاعل (Open Rate)</span>} 
              value={openRate} 
              suffix="%" 
              valueStyle={{ fontWeight: 800, color: '#52c41a' }}
            />
          </div>
        </Col>
      </Row>

      {/* Search & Filter Bar */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Input 
              placeholder="البحث في الحملات (الموضوع أو المرسل)..." 
              prefix={<SearchOutlined className="text-slate-400" />}
              value={search}
              onChange={e => setSearch(e.target.value)}
              allowClear
              className="rounded-xl border-slate-200 h-11"
            />
          </Col>
        </Row>
      </div>

      {/* Campaigns Table */}
      <div className="bg-white rounded-3xl overflow-hidden shadow-xl shadow-slate-200/50 border border-slate-100">
        <Table 
          columns={columns} 
          dataSource={filteredCampaigns} 
          rowKey="id" 
          loading={loading}
          scroll={{ x: 1000 }}
          className="loomark-table"
          pagination={{ 
            pageSize: 10,
            showTotal: (total) => `إجمالي ${total} حملة`,
            className: "px-6 py-4"
          }}
        />
      </div>

      <EmailEditor 
        open={modalOpen} 
        onClose={() => setModalOpen(false)} 
        onSuccess={() => {
          setModalOpen(false);
          fetchCampaigns();
        }}
      />
    </div>
  );
}
