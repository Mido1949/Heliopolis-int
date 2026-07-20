'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Table, Tag, Button, Input, Select, Space, Row, Col, Typography, message,
  Modal, Form, DatePicker, Checkbox, Empty,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined,
  ClockCircleOutlined, ExclamationCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/context/AuthContext';
import type { Task, Profile, Lead } from '@/types';
import { formatDate } from '@/lib/utils';
import { PIPELINE_STAGES } from '@/lib/constants';
import LeadDrawer from '../crm/LeadDrawer';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

export default function TasksPage() {
  const { isStaff, user, profile } = useAuth();
  const supabase = createClient();

  const [myTasks, setMyTasks] = useState<Task[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [form] = Form.useForm();

  const [filter, setFilter] = useState<string>('all');
  const [dailyLeads, setDailyLeads] = useState<{ id: string; name: string; next_follow_up: string; status: string; reason: string }[]>([]);
  // T061: pipeline-driven daily tasks (leads at active stages for current user)
  const [pipelineTasks, setPipelineTasks] = useState<Lead[]>([]);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [leadDrawerOpen, setLeadDrawerOpen] = useState(false);

  const canManage = isStaff;

  const fetchProfiles = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('id, name, role').order('name');
    setProfiles((data || []) as Profile[]);
  }, [supabase]);

  const fetchLeads = useCallback(async () => {
    const { data } = await supabase.from('leads').select('id, name, phone').order('name').limit(200);
    setLeads((data || []) as Lead[]);
  }, [supabase]);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      if (user) {
        const [{ data: myData }, { count }, { data: dailyData }, { data: pipelineData }] = await Promise.all([
          supabase
            .from('tasks')
            .select('*, assigned_user:profiles!assigned_to(id, name), lead:leads(id, name, phone)')
            .eq('assigned_to', user.id)
            .order('status', { ascending: true })
            .order('created_at', { ascending: false }),
          supabase
            .from('tasks')
            .select('*', { count: 'exact', head: true })
            .eq('assigned_to', user.id)
            .eq('status', 'pending'),
          supabase.rpc('get_daily_tasks', {
            p_user_id: isStaff ? null : user.id,
          }),
          // T061: pipeline-driven daily tasks — leads at active stages assigned to current user
          supabase
            .from('leads')
            .select('id, name, phone, pipeline_stage, deal_value, last_contact_date, next_follow_up')
            .eq('assigned_to_user', user.id)
            .in('pipeline_stage', ['NEW', 'WELCOME_SENT', 'NO_RESPONSE', 'INTERESTED', 'PRICING', 'QUOTED', 'NEGOTIATION'])
            .order('updated_at', { ascending: false })
            .limit(20),
        ]);
        setMyTasks((myData || []) as Task[]);
        setPendingCount(count || 0);
        setDailyLeads(dailyData || []);
        setPipelineTasks((pipelineData || []) as Lead[]);
      }

      if (canManage) {
        const { data: allData } = await supabase
          .from('tasks')
          .select('*, assigned_user:profiles!assigned_to(id, name), lead:leads(id, name, phone)')
          .order('created_at', { ascending: false });
        setAllTasks((allData || []) as Task[]);
      }
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase, user, canManage, isStaff]);

  useEffect(() => {
    fetchTasks();
    fetchProfiles();
    fetchLeads();
  }, [fetchTasks, fetchProfiles, fetchLeads]);

  const handleStatusChange = async (taskId: string, checked: boolean) => {
    const status = checked ? 'done' : 'pending';
    const completedAt = checked ? new Date().toISOString() : null;

    const { error } = await supabase
      .from('tasks')
      .update({ status, completed_at: completedAt })
      .eq('id', taskId);

    if (error) {
      message.error('فشل تحديث الحالة');
    } else {
      message.success(checked ? 'تم إنجاز المهمة' : 'تمت إعادة المهمة');
      fetchTasks();
    }
  };

  const handleDelete = async (taskId: string) => {
    const { error } = await supabase.from('tasks').delete().eq('id', taskId);
    if (error) {
      message.error('فشل حذف المهمة');
    } else {
      message.success('تم حذف المهمة');
      fetchTasks();
    }
  };

  const handleSave = async (values: {
    title: string;
    description?: string;
    assigned_to: string;
    lead_id?: string;
    due_date?: dayjs.Dayjs;
    priority: 'high' | 'medium' | 'low';
  }) => {
    const payload = {
      title: values.title,
      description: values.description,
      assigned_to: values.assigned_to,
      lead_id: values.lead_id || null,
      due_date: values.due_date?.toISOString() || null,
      priority: values.priority,
      status: 'pending',
      created_by: user?.id,
    };

    let error;
    if (editingTask) {
      ({ error } = await supabase.from('tasks').update(payload).eq('id', editingTask.id));
    } else {
      ({ error } = await supabase.from('tasks').insert(payload));
    }

    if (error) {
      message.error('فشل حفظ المهمة');
    } else {
      message.success(editingTask ? 'تم تحديث المهمة' : 'تم إنشاء المهمة');
      setModalOpen(false);
      form.resetFields();
      setEditingTask(null);
      fetchTasks();
    }
  };

  const getDueStatus = (task: Task) => {
    if (!task.due_date) return null;
    const now = new Date();
    const due = new Date(task.due_date);
    if (task.status === 'done') return null;
    if (due < now) return { color: 'red', label: 'متأخرة', icon: <ExclamationCircleOutlined /> };
    if (due.toDateString() === now.toDateString()) return { color: 'gold', label: 'اليوم', icon: <ClockCircleOutlined /> };
    return null;
  };

  const filteredTasks = filter === 'all'
    ? allTasks
    : filter === 'pending'
    ? allTasks.filter((t) => t.status === 'pending')
    : filter === 'done'
    ? allTasks.filter((t) => t.status === 'done')
    : filter === 'overdue'
    ? allTasks.filter((t) => t.status === 'pending' && t.due_date && new Date(t.due_date) < new Date())
    : filter === 'with_lead'
    ? allTasks.filter((t) => t.lead_id)
    : allTasks;

  const columns: ColumnsType<Task> = [
    {
      title: 'المهمة',
      dataIndex: 'title',
      key: 'title',
      render: (title: string, record: Task) => (
        <div>
          <Text strong>{title}</Text>
          {record.description && <Text type="secondary" className="block text-xs">{record.description}</Text>}
        </div>
      ),
    },
    {
      title: 'معين لـ',
      key: 'assigned_user',
      width: 140,
      render: (_: unknown, record: Task) => record.assigned_user?.name || '—',
    },
    {
      title: 'الموعد',
      dataIndex: 'due_date',
      key: 'due_date',
      width: 120,
      render: (date: string) => date ? formatDate(date) : '—',
    },
    {
      title: 'الحالة',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => (
        <Tag color={status === 'done' ? 'success' : 'default'}>
          {status === 'done' ? 'منتهية' : 'معلقة'}
        </Tag>
      ),
    },
    {
      title: 'الأولوية',
      dataIndex: 'priority',
      key: 'priority',
      width: 100,
      render: (priority: string) => {
        const colors: Record<string, string> = { high: 'red', medium: 'gold', low: 'default' };
        return <Tag color={colors[priority]}>{priority === 'high' ? 'عالية' : priority === 'medium' ? 'متوسطة' : 'منخفضة'}</Tag>;
      },
    },
    {
      title: 'إجراءات',
      key: 'actions',
      width: 100,
      render: (_: unknown, record: Task) => (
        <Space>
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => { setEditingTask(record); setModalOpen(true); form.setFieldsValue({ ...record, due_date: record.due_date ? dayjs(record.due_date) : undefined }); }} />
          <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.id)} />
        </Space>
      ),
    },
  ];

  const stats = {
    pending: allTasks.filter((t) => t.status === 'pending').length,
    done: allTasks.filter((t) => t.status === 'done').length,
    overdue: allTasks.filter((t) => t.status === 'pending' && t.due_date && new Date(t.due_date) < new Date()).length,
  };

  const greeting = (() => {
    const h = new Date().getHours();
    if (h >= 5 && h < 12) return 'صباح الخير';
    if (h >= 12 && h < 17) return 'مساء النور';
    return 'مساء الخير';
  })();

  return (
    <div className="space-y-4">
      {/* AI Greeting Banner */}
      {profile && (
        <div className="flex items-center gap-4 bg-gradient-to-l from-[#0D2137] to-[#1a3a5c] rounded-xl px-5 py-4 text-white shadow-md">
          <span className="text-3xl">👋</span>
          <div>
            <p className="font-bold text-base leading-tight">
              {greeting}، {profile.name}!
            </p>
            <p className="text-sm text-white/75 mt-0.5">
              {dailyLeads.length > 0
                ? `عندك النهارده ${dailyLeads.length} متابعة — تحب نتابعهم سوا؟`
                : pendingCount > 0
                ? `عندك ${pendingCount} مهمة معلقة — يلا نخلصهم!`
                : 'كل المهام تمام 🎉 يوم موفق!'}
            </p>
          </div>
          {(dailyLeads.length > 0 || pendingCount > 0) && (
            <div className="mr-auto flex gap-2">
              {dailyLeads.length > 0 && (
                <span className="bg-red-500 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                  {dailyLeads.length} فولو آب
                </span>
              )}
              {pendingCount > 0 && (
                <span className="bg-amber-400 text-[#0D2137] text-xs font-bold px-2.5 py-1 rounded-full">
                  {pendingCount} معلقة
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Header */}
      <Row justify="space-between" align="middle">
        <Col>
          <Title level={4} style={{ margin: 0 }}>المهام (Tasks)</Title>
          <Text type="secondary">
            {pendingCount} من مهامك معلقة — My Pending Tasks
          </Text>
        </Col>
        {canManage && (
          <Col>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => { setEditingTask(null); form.resetFields(); setModalOpen(true); }}
              style={{ backgroundColor: '#D72B2B', borderColor: '#D72B2B' }}
            >
              مهمة جديدة (New Task)
            </Button>
          </Col>
        )}
      </Row>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* My Tasks - Left Panel */}
        <div className="bg-white rounded-xl p-4 shadow-sm space-y-4">

          {/* ── Daily Follow-up Leads (auto) ── */}
          {dailyLeads.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <Title level={5} style={{ margin: 0 }}>متابعات اليوم</Title>
                <span className="bg-[#D72B2B] text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  {dailyLeads.length}
                </span>
              </div>
              <div className="space-y-2">
                {dailyLeads.map((lead) => (
                  <button
                    key={lead.id}
                    onClick={async () => {
                      const { data } = await supabase
                        .from('leads')
                        .select('*, assigned_user:profiles!leads_assigned_to_user_fkey(id, name)')
                        .eq('id', lead.id)
                        .single();
                      if (data) { setSelectedLead(data as Lead); setLeadDrawerOpen(true); }
                    }}
                    className="w-full flex items-center justify-between p-2.5 rounded-lg border border-slate-100 hover:border-[#D72B2B] transition-colors text-right"
                  >
                    <span className="text-sm font-medium text-[#0D2137]">{lead.name}</span>
                    <span className={`flex items-center gap-1 text-xs font-medium ${lead.reason === 'overdue' ? 'text-red-500' : 'text-amber-500'}`}>
                      <span className={`w-2 h-2 rounded-full ${lead.reason === 'overdue' ? 'bg-red-500' : 'bg-amber-400'}`} />
                      {lead.reason === 'overdue' ? 'متأخر' : 'لا نشاط 24س'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* T061: Pipeline-driven daily tasks (active stage leads) */}
          {pipelineTasks.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <Title level={5} style={{ margin: 0 }}>ليدات نشطة بحاجة لمتابعة (Active Pipeline)</Title>
                <span className="bg-emerald-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  {pipelineTasks.length}
                </span>
              </div>
              <div className="space-y-2">
                {pipelineTasks.map((lead) => {
                  const stageCfg = PIPELINE_STAGES.find(s => s.value === lead.pipeline_stage);
                  return (
                    <button
                      key={lead.id}
                      onClick={async () => {
                        const { data } = await supabase
                          .from('leads')
                          .select('*, assigned_user:profiles!leads_assigned_to_user_fkey(id, name)')
                          .eq('id', lead.id)
                          .single();
                        if (data) { setSelectedLead(data as Lead); setLeadDrawerOpen(true); }
                      }}
                      className="w-full flex items-center justify-between p-2.5 rounded-lg border border-slate-100 hover:border-emerald-500 transition-colors text-right"
                    >
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-[#0D2137]">{lead.name}</span>
                        <span className="text-[10px] text-slate-500">
                          {lead.phone || '—'}
                        </span>
                      </div>
                      <Tag color={stageCfg?.color || 'default'} style={{ margin: 0 }}>
                        {stageCfg?.labelAr || lead.pipeline_stage}
                      </Tag>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Assigned Tasks ── */}
          <div>
            <Title level={5} style={{ margin: 0 }} className="mb-3">مهامي (My Tasks)</Title>
            {myTasks.length === 0 ? (
              <Empty description="لا توجد مهام معينة" />
            ) : (
              <div className="space-y-3">
                {myTasks.map((task) => {
                  const dueStatus = getDueStatus(task);
                  return (
                    <div
                      key={task.id}
                      className={`flex items-start gap-3 p-3 rounded-lg border ${
                        task.status === 'done' ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-100'
                      }`}
                    >
                      <Checkbox
                        checked={task.status === 'done'}
                        onChange={(e) => handleStatusChange(task.id, e.target.checked)}
                      />
                      <div className="flex-1 min-w-0">
                        <Text className={task.status === 'done' ? 'line-through text-gray-400' : ''}>
                          {task.title}
                        </Text>
                        {task.lead && (
                          <div className="text-xs text-gray-500 mt-1">
                            🔗 {task.lead.name} — {task.lead.phone}
                          </div>
                        )}
                        {dueStatus && (
                          <Tag color={dueStatus.color} icon={dueStatus.icon} className="mt-1">
                            {dueStatus.label}
                          </Tag>
                        )}
                      </div>
                      <Tag color={
                        task.priority === 'high' ? 'red' :
                        task.priority === 'medium' ? 'gold' : 'default'
                      }>
                        {task.priority === 'high' ? 'عالية' : task.priority === 'medium' ? 'متوسطة' : 'منخفضة'}
                      </Tag>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Task Management - Right Panel (Admin/Manager Only) */}
        {canManage ? (
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <Title level={5} className="mb-4">إدارة مهام الفريق (Team Task Management)</Title>

            {/* Stats */}
            <Row gutter={16} className="mb-4">
              <Col span={8}>
                <div className="text-center p-3 bg-blue-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{stats.pending}</div>
                  <div className="text-xs text-gray-500">معلقة</div>
                </div>
              </Col>
              <Col span={8}>
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{stats.done}</div>
                  <div className="text-xs text-gray-500">منتهية</div>
                </div>
              </Col>
              <Col span={8}>
                <div className="text-center p-3 bg-red-50 rounded-lg">
                  <div className="text-2xl font-bold text-red-600">{stats.overdue}</div>
                  <div className="text-xs text-gray-500">متأخرة</div>
                </div>
              </Col>
            </Row>

            {/* Filter Pills */}
            <div className="flex flex-wrap gap-2 mb-4">
              {[
                { key: 'all', label: 'الكل' },
                { key: 'pending', label: 'معلقة' },
                { key: 'done', label: 'منتهية' },
                { key: 'overdue', label: 'متأخرة' },
                { key: 'with_lead', label: 'مرتبطة بليد' },
              ].map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                    filter === f.key
                      ? 'bg-[#D72B2B] text-white border-[#D72B2B]'
                      : 'bg-white text-slate-500 border-slate-200 hover:border-[#D72B2B] hover:text-[#D72B2B]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Table */}
            <Table
              columns={columns}
              dataSource={filteredTasks}
              rowKey="id"
              loading={loading}
              size="small"
              pagination={{ pageSize: 10 }}
              scroll={{ x: 600 }}
            />
          </div>
        ) : (
          <div className="bg-white rounded-xl p-4 shadow-sm flex items-center justify-center">
            <Text type="secondary">هذه الصفحة للأدمن والمديرين فقط</Text>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      <Modal
        title={editingTask ? 'تعديل مهمة' : 'مهمة جديدة'}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); setEditingTask(null); form.resetFields(); }}
        onOk={() => form.submit()}
        okText="حفظ"
        cancelText="إلغاء"
      >
        <Form form={form} layout="vertical" onFinish={handleSave} initialValues={{ priority: 'medium' }}>
          <Form.Item name="title" label="المهمة" rules={[{ required: true, message: 'يرجى إدخال المهمة' }]}>
            <Input placeholder="عنوان المهمة" />
          </Form.Item>
          <Form.Item name="description" label="الوصف">
            <Input.TextArea placeholder="وصف المهمة (اختياري)" rows={2} />
          </Form.Item>
          <Form.Item name="assigned_to" label="معين إلى" rules={[{ required: true, message: 'يرجى اختيار الشخص' }]}>
            <Select
              placeholder="اختر الشخص"
              options={profiles.map((p) => ({ value: p.id, label: p.name }))}
            />
          </Form.Item>
          <Form.Item name="lead_id" label="مرتبطة بليد">
            <Select
              placeholder="اختر الليد (اختياري)"
              allowClear
              options={leads.map((l) => ({ value: l.id, label: `${l.name} - ${l.phone}` }))}
            />
          </Form.Item>
          <Form.Item name="due_date" label="الموعد">
            <DatePicker className="w-full" placeholder="اختر التاريخ" />
          </Form.Item>
          <Form.Item name="priority" label="الأولوية">
            <Select
              options={[
                { value: 'high', label: 'عالية' },
                { value: 'medium', label: 'متوسطة' },
                { value: 'low', label: 'منخفضة' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Lead drawer for daily follow-up clicks */}
      <LeadDrawer
        lead={selectedLead}
        open={leadDrawerOpen}
        onClose={() => { setLeadDrawerOpen(false); fetchTasks(); }}
        onEdit={() => setLeadDrawerOpen(false)}
        onAssigned={() => fetchTasks()}
      />
    </div>
  );
}