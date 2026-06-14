'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Table, Tag, Button, Input, Select, Space, Tooltip, Row, Col, Typography, message,
} from 'antd';
import {
  PlusOutlined, SearchOutlined, WhatsAppOutlined,
  EyeOutlined, PhoneOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { createClient } from '@/lib/supabase/client';
import { PIPELINE_STAGES, REGIONS } from '@/lib/constants';
import { formatDate, getWhatsAppUrl } from '@/lib/utils';
import type { Lead, PipelineStage } from '@/types';
import { useAuth } from '@/context/AuthContext';
import LeadDrawer from './LeadDrawer';
import LeadFormModal from './LeadFormModal';

const { Title, Text } = Typography;

export default function MyCRMPage() {
  const { user } = useAuth();
  const supabase = createClient();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<PipelineStage | undefined>();
  const [regionFilter, setRegionFilter] = useState<string | undefined>();

  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);

  const fetchLeads = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      let q = supabase
        .from('leads')
        .select('*, assigned_user:profiles!leads_assigned_to_user_fkey(id, name)', { count: 'exact' })
        .eq('assigned_to_user', user.id);

      if (stageFilter) q = q.eq('pipeline_stage', stageFilter);
      if (regionFilter) q = q.eq('region', regionFilter);
      if (search) q = q.or(`name.ilike.%${search}%,phone.ilike.%${search}%,company.ilike.%${search}%`);

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      q = q.order('updated_at', { ascending: false }).range(from, to);

      const { data, count, error } = await q;
      if (error) throw error;
      setLeads((data || []) as Lead[]);
      setTotal(count || 0);
    } catch (err) {
      console.error('MyCRMPage fetch error:', err);
      message.error('فشل تحميل العملاء');
    } finally {
      setLoading(false);
    }
  }, [user, supabase, stageFilter, regionFilter, search, page, pageSize]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const columns: ColumnsType<Lead> = [
    {
      title: 'الاسم',
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => (
        <div>
          <div className="font-medium">{text}</div>
          {record.company && <Text type="secondary" style={{ fontSize: 12 }}>{record.company}</Text>}
        </div>
      ),
    },
    {
      title: 'الهاتف',
      dataIndex: 'phone',
      key: 'phone',
      render: (phone) => phone || '—',
    },
    {
      title: 'مرحلة القمع',
      dataIndex: 'pipeline_stage',
      key: 'pipeline_stage',
      render: (stage: PipelineStage) => {
        const cfg = PIPELINE_STAGES.find(s => s.value === stage);
        return cfg ? <Tag color={cfg.color}>{cfg.labelAr}</Tag> : <Tag>{stage || 'NEW'}</Tag>;
      },
    },
    {
      title: 'قيمة الصفقة',
      dataIndex: 'deal_value',
      key: 'deal_value',
      render: (v) => v != null ? `$${v.toLocaleString()}` : '—',
    },
    {
      title: 'آخر تواصل',
      dataIndex: 'last_contact_date',
      key: 'last_contact_date',
      render: (d) => d ? formatDate(d) : '—',
    },
    {
      title: 'إجراءات',
      key: 'actions',
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="عرض">
            <Button size="small" icon={<EyeOutlined />} onClick={() => { setSelectedLead(record); setDrawerOpen(true); }} />
          </Tooltip>
          {record.phone && (
            <Tooltip title="واتساب">
              <Button size="small" icon={<WhatsAppOutlined />} href={getWhatsAppUrl(record.phone)} target="_blank" />
            </Tooltip>
          )}
          {record.phone && (
            <Tooltip title="اتصال">
              <Button size="small" icon={<PhoneOutlined />} href={`tel:${record.phone}`} />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <div>
          <Title level={3} style={{ margin: 0 }}>عملائي (My Leads)</Title>
          <Text type="secondary">قائمة العملاء المعينين لك فقط — يتم تطبيق عزل RLS على مستوى قاعدة البيانات</Text>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => { setEditingLead(null); setModalOpen(true); }}
          style={{ backgroundColor: '#D72B2B', borderColor: '#D72B2B' }}
        >
          إضافة عميل (New Lead)
        </Button>
      </div>

      <Row gutter={12} className="mb-4">
        <Col span={10}>
          <Input
            placeholder="بحث بالاسم / الهاتف / الشركة"
            prefix={<SearchOutlined />}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            allowClear
          />
        </Col>
        <Col span={7}>
          <Select
            placeholder="مرحلة القمع (Pipeline Stage)"
            value={stageFilter}
            onChange={(v) => { setStageFilter(v); setPage(1); }}
            allowClear
            className="w-full"
            options={PIPELINE_STAGES.map(s => ({ value: s.value, label: s.labelAr }))}
          />
        </Col>
        <Col span={7}>
          <Select
            placeholder="المنطقة (Region)"
            value={regionFilter}
            onChange={(v) => { setRegionFilter(v); setPage(1); }}
            allowClear
            className="w-full"
            options={REGIONS.map(r => ({ value: r.value, label: r.labelAr }))}
          />
        </Col>
      </Row>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={leads}
        loading={loading}
        scroll={{ x: 800 }}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: false,
          onChange: (p) => setPage(p),
        }}
      />

      <LeadDrawer
        lead={selectedLead}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onEdit={(l) => { setEditingLead(l); setModalOpen(true); setDrawerOpen(false); }}
        onAssigned={fetchLeads}
      />
      <LeadFormModal
        open={modalOpen}
        lead={editingLead}
        onClose={() => setModalOpen(false)}
        onSaved={fetchLeads}
      />
    </div>
  );
}
