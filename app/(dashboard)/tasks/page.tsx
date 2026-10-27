'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Table, Tag, Button, Input, Select, Space, Row, Col, Typography, message,
  Modal, Form, DatePicker, Checkbox, Empty, Popconfirm,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined,
  ClockCircleOutlined, ExclamationCircleOutlined, WhatsAppOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/context/AuthContext';
import type { Task, Profile, Lead } from '@/types';
import { formatDate } from '@/lib/utils';
import LeadDrawer from '../crm/LeadDrawer';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

export default function TasksPage() {
  const { isStaff, user, profile } = useAuth();
  const supabase = createClient();
  const router = useRouter();

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
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [leadDrawerOpen, setLeadDrawerOpen] = useState(false);

  const canManage = isStaff;

  const fetchProfiles = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('id, name, role').order('name');
    setProfiles((data || []) as Profile[]);
  }, [supabase]);

  // The picker searches by name or phone; with no query it shows the newest leads.
  const fetchLeads = useCallback(async (q = '') => {
    let query = supabase.from('leads').select('id, name, phone').limit(30);
    const term = q.trim().replace(/[%,()]/g, '');
    query = term
      ? query.or(`name.ilike.%${term}%,phone.ilike.%${term}%`).order('name')
      : query.order('created_at', { ascending: false });
    const { data } = await query;
    setLeads((data || []) as Lead[]);
  }, [supabase]);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      if (user) {
        const [{ data: myData }, { count }, { data: dailyData }] = await Promise.all([
          supabase
            .from('tasks')
            .select('*, assigned_user:profiles!assigned_to(id, name), lead:leads(id, name, phone)')
            .eq('assigned_to', user.id)
            .order('due_date', { ascending: true, nullsFirst: false })
            .order('created_at', { ascending: false }),
          supabase
            .from('tasks')
            .select('*', { count: 'exact', head: true })
            .eq('assigned_to', user.id)
            .eq('status', 'pending'),
          supabase.rpc('get_daily_tasks', {
            p_user_id: isStaff ? null : user.id,
          }),
        ]);
        setMyTasks((myData || []) as Task[]);
        setPendingCount(count || 0);
        setDailyLeads(dailyData || []);
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

  // Opens the lead behind a task or follow-up row in the details drawer.
  // RLS hides leads owned by other reps (e.g. the CS call tasks), so say so
  // instead of doing nothing.
  const openLead = async (leadId: string) => {
    const { data } = await supabase
      .from('leads')
      .select('*, assigned_user:profiles!leads_assigned_to_user_fkey(id, name)')
      .eq('id', leadId)
      .maybeSingle();
    if (data) { setSelectedLead(data as Lead); setLeadDrawerOpen(true); }
    else message.warning('العميل ده مش متاح ليك — استخدم الرقم المكتوب في المهمة');
  };

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
    };

    // Editing keeps the task's status; only a new task starts as pending.
    let error;
    if (editingTask) {
      ({ error } = await supabase.from('tasks').update(payload).eq('id', editingTask.id));
    } else {
      ({ error } = await supabase.from('tasks').insert({ ...payload, status: 'pending', created_by: user?.id }));
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

  const myPending = myTasks.filter((t) => t.status === 'pending');
  const doneSince = Date.now() - 30 * 24 * 3600 * 1000;
  const myDone = myTasks
    .filter((t) => t.status === 'done' && (!t.completed_at || new Date(t.completed_at).getTime() > doneSince))
    .sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''));

  const renderMyTask = (task: Task) => {
    const dueStatus = getDueStatus(task);
    const done = task.status === 'done';
    return (
      <div
        key={task.id}
        onClick={() => task.lead_id && openLead(task.lead_id)}
        className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
          done ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-100'
        } ${task.lead_id ? 'cursor-pointer hover:border-[#D72B2B]' : ''}`}
      >
        <span onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={done}
            onChange={(e) => handleStatusChange(task.id, e.target.checked)}
          />
        </span>
        <div className="flex-1 min-w-0">
          <Text className={done ? 'line-through text-gray-400' : ''}>
            {task.title}
          </Text>
          {task.description && (
            <div className="text-xs text-gray-500 mt-1 whitespace-pre-line">{task.description}</div>
          )}
          {task.lead && (
            <div className="text-xs text-gray-500 mt-1">
              🔗 {task.lead.name} — {task.lead.phone}
            </div>
          )}
          {done && task.completed_at && (
            <div className="text-[11px] text-gray-400 mt-1">تمت {formatDate(task.completed_at)}</div>
          )}
          {dueStatus && (
            <Tag color={dueStatus.color} icon={dueStatus.icon} className="mt-1">
              {dueStatus.label}
            </Tag>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <Tag color={
            task.priority === 'high' ? 'red' :
            task.priority === 'medium' ? 'gold' : 'default'
          } style={{ margin: 0 }}>
            {task.priority === 'high' ? 'عالية' : task.priority === 'medium' ? 'متوسطة' : 'منخفضة'}
          </Tag>
          {task.lead_id && (
            <Button
              type="text"
              size="small"
              icon={<WhatsAppOutlined style={{ color: '#25D366' }} />}
              title="فتح الشات"
              onClick={(e) => { e.stopPropagation(); router.push(`/whatsapp?lead=${task.lead_id}`); }}
            />
          )}
        </div>
      </div>
    );
  };

  const doneList = myDone.length === 0
    ? <Empty description="لسه مفيش مهام خلصت" />
    : <div className="space-y-3">{myDone.map(renderMyTask)}</div>;

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
        <Tag color={status === 'done' ? 'success' : status === 'cancelled' ? 'error' : 'default'}>
          {status === 'done' ? 'منتهية' : status === 'cancelled' ? 'اتلغت' : 'معلقة'}
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
          <Popconfirm
            title="حذف المهمة؟"
            description="مش هينفع ترجعها تاني"
            okText="حذف"
            cancelText="إلغاء"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDelete(record.id)}
          >
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
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
                    onClick={() => openLead(lead.id)}
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

          {/* ── Assigned Tasks ── */}
          <div>
            <Title level={5} style={{ margin: 0 }} className="mb-3">مهامي (My Tasks)</Title>
            {myPending.length === 0 ? (
              <Empty description="لا توجد مهام معلقة" />
            ) : (
              <div className="space-y-3">{myPending.map(renderMyTask)}</div>
            )}
          </div>

          {/* Staff keep the team panel beside this one, so their own done
              tasks go here; everyone else gets them in the side panel. */}
          {canManage && myDone.length > 0 && (
            <div>
              <Title level={5} style={{ margin: 0 }} className="mb-3">مهام تمت ({myDone.length})</Title>
              {doneList}
            </div>
          )}
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
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <Title level={5} style={{ margin: 0 }}>مهام تمت (Done)</Title>
              <span className="bg-emerald-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {myDone.length}
              </span>
            </div>
            {doneList}
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
              placeholder="ابحث بالاسم أو الرقم (اختياري)"
              allowClear
              showSearch
              filterOption={false}
              onSearch={(q) => fetchLeads(q)}
              options={[
                // Keep the edited task's lead selectable even when the search doesn't return it.
                ...(editingTask?.lead && !leads.some((l) => l.id === editingTask.lead?.id) ? [editingTask.lead] : []),
                ...leads,
              ].map((l) => ({ value: l.id, label: `${l.name} - ${l.phone}` }))}
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