'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Table, Tag, Button, Input, Select, Space, Tooltip, Empty, Spin, Row, Col, Typography,
} from 'antd';
import {
  SearchOutlined, EyeOutlined, WhatsAppOutlined, PhoneOutlined, ArrowRightOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { PIPELINE_STAGES, REGIONS } from '@/lib/constants';
import { formatDate, getWhatsAppUrl } from '@/lib/utils';
import type { Lead, PipelineStage } from '@/types';
import LeadDrawer from '../crm/LeadDrawer';
import LeadFormModal from '../crm/LeadFormModal';
import MyDayList from './MyDayList';

const { Title, Text } = Typography;

export default function MyLeadsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<PipelineStage | undefined>();
  const [regionFilter, setRegionFilter] = useState<string | undefined>();
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [mydayReload, setMydayReload] = useState(0);

  const fetchLeads = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      let q = supabase
        .from('leads')
        .select('*, assigned_user:profiles!leads_assigned_to_user_fkey(id, name)')
        .eq('assigned_to_user', user.id)
        .order('updated_at', { ascending: false })
        .limit(200);

      if (stageFilter) q = q.eq('pipeline_stage', stageFilter);
      if (regionFilter) q = q.eq('region', regionFilter);
      if (search) q = q.or(`name.ilike.%${search}%,phone.ilike.%${search}%,company.ilike.%${search}%`);

      const { data, error } = await q;
      if (error) throw error;
      setLeads((data || []) as Lead[]);
    } catch (err) {
      console.error('MyLeadsPage fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [user, supabase, stageFilter, regionFilter, search]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  // Open a specific lead's drawer when arriving via ?lead=<id> (e.g. from a notification).
  useEffect(() => {
    const leadId = searchParams.get('lead');
    if (!leadId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('leads')
        .select('*, assigned_user:profiles!leads_assigned_to_user_fkey(id, name)')
        .eq('id', leadId)
        .single();
      if (!cancelled && data) {
        setSelectedLead(data as Lead);
        setDrawerOpen(true);
      }
    })();
    return () => { cancelled = true; };
  }, [searchParams, supabase]);

  const columns: ColumnsType<Lead> = [
    {
      title: 'الاسم',
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => (
        <div>
          <div className="font-medium text-slate-800">{text}</div>
          {record.company && <Text type="secondary" style={{ fontSize: 12 }}>{record.company}</Text>}
        </div>
      ),
    },
    {
      title: 'الهاتف',
      dataIndex: 'phone',
      key: 'phone',
      width: 160,
      render: (phone) => phone || <Text type="secondary">—</Text>,
    },
    {
      title: 'المرحلة',
      dataIndex: 'pipeline_stage',
      key: 'pipeline_stage',
      width: 140,
      render: (stage: PipelineStage) => {
        const cfg = PIPELINE_STAGES.find(s => s.value === stage);
        return cfg ? <Tag color={cfg.color}>{cfg.labelAr}</Tag> : <Tag>{stage || 'NEW'}</Tag>;
      },
    },
    {
      title: 'المنطقة',
      dataIndex: 'region',
      key: 'region',
      width: 120,
      render: (r) => r || <Text type="secondary">—</Text>,
    },
    {
      title: 'آخر تواصل',
      dataIndex: 'last_contact_date',
      key: 'last_contact_date',
      width: 130,
      render: (d) => d ? formatDate(d) : <Text type="secondary">—</Text>,
    },
    {
      title: 'المتابعة القادمة',
      dataIndex: 'next_follow_up',
      key: 'next_follow_up',
      width: 130,
      render: (d) => d ? formatDate(d) : <Text type="secondary">—</Text>,
    },
    {
      title: 'إجراءات',
      key: 'actions',
      width: 140,
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="عرض">
            <Button size="small" icon={<EyeOutlined />} onClick={() => { setSelectedLead(record); setDrawerOpen(true); }} />
          </Tooltip>
          {record.phone && (
            <Tooltip title="واتساب">
              <Button size="small" icon={<WhatsAppOutlined />} style={{ color: '#25D366' }} href={getWhatsAppUrl(record.phone)} target="_blank" />
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
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <Title level={4} style={{ margin: 0 }}>
            عملائي (My Leads)
          </Title>
          <Text type="secondary">العملاء المعينين لك فقط — RLS مفعّل</Text>
        </div>
        <Button
          icon={<ArrowRightOutlined />}
          onClick={() => router.push('/boq/new')}
          type="primary"
          style={{ backgroundColor: '#D72B2B', borderColor: '#D72B2B' }}
        >
          عرض سعر جديد
        </Button>
      </div>

      {/* My Day — prioritized action list (SLA-red + due next steps) */}
      <div>
        <Title level={5} style={{ margin: '4px 0' }}>🗓️ يومي (My Day)</Title>
        <Text type="secondary" className="block mb-2">العملاء اللي محتاجين إجراء دلوقتي — متأخرين في المرحلة أو خطوة مستحقة</Text>
        <MyDayList
          reloadToken={mydayReload}
          onOpen={(l) => { setSelectedLead(l); setDrawerOpen(true); }}
        />
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
        <Row gutter={[12, 12]}>
          <Col xs={24} md={10}>
            <Input
              placeholder="بحث بالاسم / الهاتف / الشركة"
              prefix={<SearchOutlined />}
              value={search}
              onChange={e => setSearch(e.target.value)}
              allowClear
            />
          </Col>
          <Col xs={12} md={7}>
            <Select
              placeholder="المرحلة"
              value={stageFilter}
              onChange={setStageFilter}
              allowClear
              className="w-full"
              options={PIPELINE_STAGES.map(s => ({ value: s.value, label: s.labelAr }))}
            />
          </Col>
          <Col xs={12} md={7}>
            <Select
              placeholder="المنطقة"
              value={regionFilter}
              onChange={setRegionFilter}
              allowClear
              className="w-full"
              options={REGIONS.map(r => ({ value: r.value, label: r.labelAr }))}
            />
          </Col>
        </Row>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center"><Spin /></div>
        ) : leads.length === 0 ? (
          <div className="p-12">
            <Empty
              description={
                <div>
                  <div className="text-slate-700 font-semibold mb-1">مفيش عملاء ليك لسه</div>
                  <Text type="secondary">ابدأ بتسجيل عميل جديد من المساعد الذكي في الشات 🪄</Text>
                </div>
              }
            />
          </div>
        ) : (
          <Table
            rowKey="id"
            columns={columns}
            dataSource={leads}
            pagination={{ pageSize: 20, showSizeChanger: false }}
            scroll={{ x: 800 }}
          />
        )}
      </div>

      <LeadDrawer
        lead={selectedLead}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onEdit={(l) => { setEditingLead(l); setModalOpen(true); setDrawerOpen(false); }}
        onAssigned={() => { fetchLeads(); setMydayReload((n) => n + 1); }}
      />
      <LeadFormModal
        open={modalOpen}
        lead={editingLead}
        onClose={() => setModalOpen(false)}
        onSaved={() => { fetchLeads(); setMydayReload((n) => n + 1); }}
      />
    </div>
  );
}
