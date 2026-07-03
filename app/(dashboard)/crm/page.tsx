'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Table, Tag, Button, Input, Select, Space, Tooltip, Dropdown, Row, Col,
  Typography, message, Segmented,
} from 'antd';
import {
  PlusOutlined, SearchOutlined, WhatsAppOutlined,
  MoreOutlined, FilterOutlined,
  EyeOutlined, EditOutlined, DeleteOutlined,
  TableOutlined, AppstoreOutlined, FileTextOutlined,
  PhoneOutlined, ImportOutlined, UserOutlined, CalendarOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { MenuProps } from 'antd';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { LEAD_SOURCES, PIPELINE_STAGES } from '@/lib/constants';
import { formatDate, getWhatsAppUrl } from '@/lib/utils';
import type { Lead } from '@/types';
import LeadDrawer from './LeadDrawer';
import LeadFormModal from './LeadFormModal';
import KanbanView from './KanbanView';
import ImportModal from './ImportModal';
import MyDayList from '../my-leads/MyDayList';
import { useAuth } from '@/context/AuthContext';

const { Title, Text } = Typography;

type ViewType = 'myday' | 'table' | 'kanban';

export default function CRMPage() {
  const { isAdmin, isStaff, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const supabase = createClient();

  // State
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [pipelineFilter, setPipelineFilter] = useState<string | undefined>();
  const [sourceFilter] = useState<string | undefined>();

  // Drawer & Modal
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [viewType, setViewType] = useState<ViewType>('kanban');
  const viewInitRef = useRef(false);
  const [importModalOpen, setImportModalOpen] = useState(false);

  // US7: non-leaders land on "My Day" by default; leaders/managers keep the
  // board. Set once after auth resolves so a manual view switch is respected.
  useEffect(() => {
    if (viewInitRef.current || authLoading) return;
    viewInitRef.current = true;
    setViewType(isStaff ? 'kanban' : 'myday');
  }, [authLoading, isStaff]);

  // Call stats
  const [callStats, setCallStats] = useState({ total: 0, today: 0, answered: 0 });

  const fetchCallStats = useCallback(async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [
        { count: totalCalls },
        { count: todayCalls },
        { count: answeredCalls },
      ] = await Promise.all([
        supabase.from('call_logs').select('*', { count: 'exact', head: true }),
        supabase.from('call_logs').select('*', { count: 'exact', head: true }).gte('created_at', today.toISOString()),
        supabase.from('call_logs').select('*', { count: 'exact', head: true }).eq('outcome', 'Answered'),
      ]);

      setCallStats({
        total: totalCalls || 0,
        today: todayCalls || 0,
        answered: answeredCalls || 0,
      });
    } catch (err) {
      console.error('Failed to fetch call stats:', err);
    }
  }, [supabase]);

  useEffect(() => {
    fetchCallStats();
  }, [fetchCallStats]);

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

  // Fetch leads
  const fetchLeads = async (p = page) => {
    setLoading(true);
    try {
      let query = supabase
        .from('leads')
        .select('*, assigned_user:profiles!leads_assigned_to_user_fkey(id, name)', { count: 'exact' });

      if (search) {
        const safe = search.replace(/[,()\*]/g, ' ').trim();
        if (safe) {
          query = query.or(`name.ilike.%${safe}%,company.ilike.%${safe}%,phone.ilike.%${safe}%`);
        }
      }
      if (pipelineFilter) query = query.eq('pipeline_stage', pipelineFilter);
      if (sourceFilter) query = query.eq('source', sourceFilter);

      // All team members can see (and edit) every lead in the org — collaborative
      // CRM. (Personal view is available on the My Leads page.)

      // Order by pipeline_stage for kanban/grouping, else by updated_at
      if (pipelineFilter || viewType === 'kanban') {
        query = query.order('pipeline_stage', { ascending: true }).order('updated_at', { ascending: false });
      } else {
        query = query.order('updated_at', { ascending: false });
      }

      query = query.range((p - 1) * pageSize, p * pageSize - 1);

      const { data, count, error } = await query;
      if (error) throw error;

      setLeads((data || []) as Lead[]);
      setTotal(count || 0);
    } catch {
      message.error('فشل تحميل العملاء');
    } finally {
      setLoading(false);
    }
  };

  // Initial load
  useEffect(() => { fetchLeads(1); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Delete lead
  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('leads').delete().eq('id', id);
    if (error) {
      message.error('فشل حذف العميل');
    } else {
      message.success('تم حذف العميل');
      fetchLeads();
    }
  };

  const getSourceConfig = (source: string) =>
    LEAD_SOURCES.find((s) => s.value === source) || { color: '#0D2137', labelAr: source };

  // Memoized so the column array (with its render closures) isn't rebuilt on
  // every keystroke/filter change — only when call stats actually change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const columns: ColumnsType<Lead> = useMemo(() => [
    {
      title: 'الاسم (Name)',
      dataIndex: 'name',
      key: 'name',
      fixed: 'left',
      width: 200,
      render: (name: string, record: Lead) => (
        <div>
          <Text strong className="cursor-pointer hover:text-accent" onClick={() => { setSelectedLead(record); setDrawerOpen(true); }}>
            {name}
          </Text>
          {record.company && <Text type="secondary" className="block text-xs">{record.company}</Text>}
        </div>
      ),
    },
    {
      title: 'الهاتف (Phone)',
      dataIndex: 'phone',
      key: 'phone',
      width: 160,
      render: (phone: string) =>
        phone ? (
          <Space size="small">
            <Text copyable={{ text: phone }}>{phone}</Text>
            <Tooltip title="WhatsApp">
              <a href={getWhatsAppUrl(phone)} target="_blank" rel="noopener noreferrer">
                <WhatsAppOutlined style={{ color: '#25D366', fontSize: 16 }} />
              </a>
            </Tooltip>
          </Space>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: 'مرحلة القمع (Pipeline)',
      key: 'pipeline_stage',
      width: 160,
      render: (_: unknown, record: Lead) => {
        const stage = record.pipeline_stage || 'NEW';
        const cfg = PIPELINE_STAGES.find(s => s.value === stage);
        return cfg
          ? <Tag color={cfg.color}>{cfg.emoji} {cfg.labelAr}</Tag>
          : <Tag>{stage}</Tag>;
      },
    },
    {
      title: 'المصدر (Source)',
      dataIndex: 'source',
      key: 'source',
      width: 120,
      render: (source: string) => {
        const config = getSourceConfig(source);
        return <Tag color={config.color}>{config.labelAr}</Tag>;
      },
    },
    {
      title: 'المنطقة (Region)',
      dataIndex: 'region',
      key: 'region',
      width: 120,
      render: (region: string) => region || '—',
    },
    {
      title: 'تاريخ الإضافة (Created)',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 140,
      render: (date: string) => formatDate(date),
    },
    {
      title: 'متابعة (Follow-up)',
      key: 'follow_up',
      width: 100,
      render: (_: unknown, record: Lead) => {
        let color = 'default';
        let label = 'N/A';
        if (record.fb3) { color = 'success'; label = 'FB3'; }
        else if (record.fb2) { color = 'warning'; label = 'FB2'; }
        else if (record.fb1) { color = 'gold'; label = 'FB1'; }

        return <Tag color={color}>{label}</Tag>;
      },
    },
    {
      title: 'المعين (Assigned To)',
      key: 'assigned_user',
      width: 140,
      render: (_: unknown, record: Lead) =>
        record.assigned_user?.name ? (
          <Text>{record.assigned_user.name}</Text>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: 'إجراءات (Actions)',
      key: 'actions',
      fixed: 'right',
      width: 150,
      render: (_: unknown, record: Lead) => {
        const items: MenuProps['items'] = [
          {
            key: 'view',
            label: 'عرض (View)',
            icon: <EyeOutlined />,
            onClick: () => { setSelectedLead(record); setDrawerOpen(true); },
          },
          {
            key: 'boq',
            label: (
              <Link href={`/boq?leadId=${record.id}`}>
                إنشاء مقايسة (Create BOQ)
              </Link>
            ),
            icon: <FileTextOutlined />,
          },
          {
            key: 'edit',
            label: 'تعديل (Edit)',
            icon: <EditOutlined />,
            onClick: () => { setEditingLead(record); setModalOpen(true); },
          },
        ];

        if (isAdmin) {
          items.push({ type: 'divider' });
          items.push({
            key: 'delete',
            label: 'حذف (Delete)',
            icon: <DeleteOutlined />,
            danger: true,
            onClick: () => handleDelete(record.id),
          });
        }

        return (
          <Dropdown
            menu={{ items }}
            trigger={['click']}
          >
            <Button type="text" icon={<MoreOutlined />} size="small" />
          </Dropdown>
        );
      },
    },
  ], [callStats]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <Row justify="space-between" align="middle">
        <Col>
          <Title level={4} style={{ margin: 0 }}>
            إدارة العملاء (CRM)
          </Title>
          <Text type="secondary">
            {total} عميل — Leads Management
          </Text>
        </Col>
        <Col>
          <Space>
            <Link href="/crm/my-crm">
              <Button icon={<UserOutlined />}>
                عملائي (My CRM)
              </Button>
            </Link>
            <Button
              icon={<ImportOutlined />}
              onClick={() => setImportModalOpen(true)}
            >
              استيراد مجمع
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => { setEditingLead(null); setModalOpen(true); }}
              style={{ backgroundColor: '#D72B2B', borderColor: '#D72B2B' }}
            >
              إضافة عميل (Add Lead)
            </Button>
          </Space>
        </Col>
      </Row>

      {/* Calls Summary Widget — FIX 5 */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={8}>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <PhoneOutlined className="text-blue-500 text-lg" />
            </div>
            <div>
              <div className="text-xs text-gray-400 font-medium">إجمالي المكالمات (Total)</div>
              <div className="text-xl font-bold text-gray-800">{callStats.total}</div>
            </div>
          </div>
        </Col>
        <Col xs={24} sm={8}>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
              <PhoneOutlined className="text-green-500 text-lg" />
            </div>
            <div>
              <div className="text-xs text-gray-400 font-medium">اليوم (Today)</div>
              <div className="text-xl font-bold text-gray-800">{callStats.today}</div>
            </div>
          </div>
        </Col>
        <Col xs={24} sm={8}>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
              <PhoneOutlined className="text-amber-500 text-lg" />
            </div>
            <div>
              <div className="text-xs text-gray-400 font-medium">تم الرد (Answered)</div>
              <div className="text-xl font-bold text-gray-800">{callStats.answered}</div>
            </div>
          </div>
        </Col>
      </Row>

      {/* View Switcher & Filters */}
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} md={6}>
            <Segmented
              value={viewType}
              onChange={(value) => setViewType(value as ViewType)}
              options={[
                { label: 'يومي (My Day)', value: 'myday', icon: <CalendarOutlined /> },
                { label: 'جدول (Table)', value: 'table', icon: <TableOutlined /> },
                { label: 'خطوات (Pipeline)', value: 'kanban', icon: <AppstoreOutlined /> },
              ]}
              className="w-full md:w-auto"
            />
          </Col>
          <Col xs={24} md={18}>
            <Row gutter={[12, 12]}>
              <Col xs={24} md={10}>
                <Input
                  prefix={<SearchOutlined />}
                  placeholder="بحث بالاسم، الشركة، أو الهاتف..."
                  value={search}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSearch(val);
                    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
                    searchDebounceRef.current = setTimeout(() => {
                      setPage(1);
                      fetchLeads(1);
                    }, 300);
                  }}
                  onPressEnter={() => { setPage(1); fetchLeads(1); }}
                  allowClear
                />
              </Col>
              <Col xs={12} md={7}>
                <Select
                  placeholder="مرحلة القمع (Pipeline Stage)"
                  value={pipelineFilter}
                  onChange={(v) => { setPipelineFilter(v); setPage(1); setTimeout(() => fetchLeads(1), 0); }}
                  allowClear
                  className="w-full"
                  options={PIPELINE_STAGES.map((s) => ({ value: s.value, label: s.labelAr }))}
                />
              </Col>
              <Col xs={12} md={7}>
                <Button icon={<FilterOutlined />} onClick={() => fetchLeads(1)} block>
                  تصفية (Filter)
                </Button>
              </Col>
            </Row>
          </Col>
        </Row>
      </div>

      {/* Content */}
      {viewType === 'myday' ? (
        <div className="mt-4">
          <MyDayList onOpen={(lead) => { setSelectedLead(lead); setDrawerOpen(true); }} />
        </div>
      ) : viewType === 'table' ? (
        <div className="bg-white rounded-xl overflow-hidden shadow-sm">
          <Table
            columns={columns}
            dataSource={leads}
            rowKey="id"
            loading={loading}
            scroll={{ x: 1000 }}
            pagination={{
              current: page,
              pageSize,
              total,
              showSizeChanger: false,
              showTotal: (t) => `${t} عميل`,
              onChange: (p) => { setPage(p); fetchLeads(p); },
            }}
          />
        </div>
      ) : (
        <div className="mt-4">
          <KanbanView
            leads={leads}
            onLeadClick={(lead) => { setSelectedLead(lead); setDrawerOpen(true); }}
            onRefresh={() => fetchLeads()}
          />
        </div>
      )}

      {/* Drawer */}
      <LeadDrawer
        lead={selectedLead}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onEdit={(lead: Lead) => { setDrawerOpen(false); setEditingLead(lead); setModalOpen(true); }}
        onAssigned={() => fetchLeads()}
      />

      {/* Modal */}
      <LeadFormModal
        open={modalOpen}
        lead={editingLead}
        onClose={() => { setModalOpen(false); setEditingLead(null); }}
        onSaved={() => { setModalOpen(false); setEditingLead(null); fetchLeads(); }}
      />

      {/* Import Modal */}
      <ImportModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImportComplete={() => { setImportModalOpen(false); fetchLeads(); }}
      />
    </div>
  );
}
