'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import {
  Table, Tag, Button, Input, Select, Space, Row, Col, Typography, message,
  Modal, Form, DatePicker, InputNumber, Empty, Tooltip,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, PhoneOutlined,
  ToolOutlined, WarningOutlined, CheckCircleOutlined, ClockCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { formatDate } from '@/lib/utils';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

type AfterSalesRecord = {
  id: string;
  customer_name: string;
  customer_phone: string | null;
  customer_address: string | null;
  installation_date: string;
  system_description: string | null;
  unit_count: number;
  technician_name: string | null;
  next_maintenance_date: string | null;
  last_maintenance_date: string | null;
  status: 'active' | 'maintenance_due' | 'overdue' | 'inactive';
  notes: string | null;
  created_at: string;
};

const STATUS_CONFIG = {
  active: { color: 'success', label: 'نشط', icon: <CheckCircleOutlined /> },
  maintenance_due: { color: 'warning', label: 'صيانة قريبة', icon: <ClockCircleOutlined /> },
  overdue: { color: 'error', label: 'متأخر', icon: <WarningOutlined /> },
  inactive: { color: 'default', label: 'غير نشط', icon: null },
};

function computeStatus(next: string | null): AfterSalesRecord['status'] {
  if (!next) return 'active';
  const daysUntil = dayjs(next).diff(dayjs(), 'day');
  if (daysUntil < 0) return 'overdue';
  if (daysUntil <= 30) return 'maintenance_due';
  return 'active';
}

export default function AfterSalesPage() {
  const { isStaff, user } = useAuth();
  const supabase = createClient();

  const [records, setRecords] = useState<AfterSalesRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<AfterSalesRecord | null>(null);
  const [form] = Form.useForm();

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('after_sales_service')
      .select('*')
      .order('next_maintenance_date', { ascending: true, nullsFirst: false });

    if (search) {
      query = query.or(`customer_name.ilike.%${search}%,customer_phone.ilike.%${search}%,customer_address.ilike.%${search}%`);
    }
    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }

    const { data, error } = await query;
    if (error) {
      message.error('فشل تحميل السجلات');
    } else {
      setRecords((data || []) as AfterSalesRecord[]);
    }
    setLoading(false);
  }, [supabase, search, statusFilter]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  const handleSave = async (values: {
    customer_name: string;
    customer_phone?: string;
    customer_address?: string;
    installation_date: dayjs.Dayjs;
    system_description?: string;
    unit_count?: number;
    technician_name?: string;
    next_maintenance_date?: dayjs.Dayjs;
    last_maintenance_date?: dayjs.Dayjs;
    notes?: string;
  }) => {
    const nextDate = values.next_maintenance_date?.format('YYYY-MM-DD') ?? null;
    const payload = {
      customer_name: values.customer_name,
      customer_phone: values.customer_phone || null,
      customer_address: values.customer_address || null,
      installation_date: values.installation_date.format('YYYY-MM-DD'),
      system_description: values.system_description || null,
      unit_count: values.unit_count || 1,
      technician_name: values.technician_name || null,
      next_maintenance_date: nextDate,
      last_maintenance_date: values.last_maintenance_date?.format('YYYY-MM-DD') ?? null,
      notes: values.notes || null,
      status: computeStatus(nextDate),
      created_by: user?.id,
    };

    let error;
    if (editingRecord) {
      ({ error } = await supabase.from('after_sales_service').update(payload).eq('id', editingRecord.id));
    } else {
      ({ error } = await supabase.from('after_sales_service').insert(payload));
    }

    if (error) {
      message.error('فشل الحفظ');
    } else {
      message.success(editingRecord ? 'تم التحديث' : 'تم الإضافة');
      setModalOpen(false);
      form.resetFields();
      setEditingRecord(null);
      fetchRecords();
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('after_sales_service').delete().eq('id', id);
    if (error) {
      message.error('فشل الحذف');
    } else {
      message.success('تم الحذف');
      fetchRecords();
    }
  };

  const openEdit = (record: AfterSalesRecord) => {
    setEditingRecord(record);
    form.setFieldsValue({
      ...record,
      installation_date: dayjs(record.installation_date),
      next_maintenance_date: record.next_maintenance_date ? dayjs(record.next_maintenance_date) : undefined,
      last_maintenance_date: record.last_maintenance_date ? dayjs(record.last_maintenance_date) : undefined,
    });
    setModalOpen(true);
  };

  const stats = {
    total: records.length,
    overdue: records.filter(r => r.status === 'overdue').length,
    due_soon: records.filter(r => r.status === 'maintenance_due').length,
    active: records.filter(r => r.status === 'active').length,
  };

  const columns: ColumnsType<AfterSalesRecord> = [
    {
      title: 'العميل',
      key: 'customer',
      render: (_, r) => (
        <div>
          <Text strong>{r.customer_name}</Text>
          {r.customer_phone && (
            <div className="flex items-center gap-1 mt-0.5">
              <PhoneOutlined className="text-gray-400 text-xs" />
              <Text type="secondary" className="text-xs">{r.customer_phone}</Text>
            </div>
          )}
          {r.customer_address && (
            <Text type="secondary" className="text-xs block">{r.customer_address}</Text>
          )}
        </div>
      ),
    },
    {
      title: 'النظام المثبت',
      key: 'system',
      width: 200,
      render: (_, r) => (
        <div>
          <Text>{r.system_description || '—'}</Text>
          {r.unit_count > 1 && <Text type="secondary" className="text-xs block">{r.unit_count} وحدة</Text>}
        </div>
      ),
    },
    {
      title: 'تاريخ التركيب',
      dataIndex: 'installation_date',
      key: 'installation_date',
      width: 120,
      render: (d: string) => formatDate(d),
    },
    {
      title: 'الفني',
      dataIndex: 'technician_name',
      key: 'technician_name',
      width: 120,
      render: (v: string) => v || '—',
    },
    {
      title: 'الصيانة القادمة',
      dataIndex: 'next_maintenance_date',
      key: 'next_maintenance_date',
      width: 140,
      render: (d: string | null, r) => {
        if (!d) return <Text type="secondary">—</Text>;
        const daysLeft = dayjs(d).diff(dayjs(), 'day');
        return (
          <div>
            <Text>{formatDate(d)}</Text>
            {r.status === 'overdue' && (
              <Text type="danger" className="text-xs block">متأخر {Math.abs(daysLeft)} يوم</Text>
            )}
            {r.status === 'maintenance_due' && (
              <Text className="text-xs block text-amber-500">بعد {daysLeft} يوم</Text>
            )}
          </div>
        );
      },
    },
    {
      title: 'الحالة',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status: AfterSalesRecord['status']) => {
        const cfg = STATUS_CONFIG[status];
        return <Tag color={cfg.color} icon={cfg.icon}>{cfg.label}</Tag>;
      },
    },
    {
      title: 'إجراءات',
      key: 'actions',
      width: 90,
      render: (_, record) => (
        <Space>
          <Tooltip title="تعديل">
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          </Tooltip>
          {isStaff && (
            <Tooltip title="حذف">
              <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.id)} />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <Row justify="space-between" align="middle">
        <Col>
          <Title level={4} style={{ margin: 0 }}>خدمة ما بعد البيع <span className="text-sm font-normal text-gray-400">After Sales Service</span></Title>
          <Text type="secondary">متابعة العملاء المركبين وجدولة الصيانة الدورية</Text>
        </Col>
        <Col>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => { setEditingRecord(null); form.resetFields(); setModalOpen(true); }}
            style={{ backgroundColor: '#D72B2B', borderColor: '#D72B2B' }}
          >
            إضافة عميل
          </Button>
        </Col>
      </Row>

      {/* Stats */}
      <Row gutter={16}>
        {[
          { label: 'إجمالي العملاء', value: stats.total, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'متأخرة', value: stats.overdue, color: 'text-red-600', bg: 'bg-red-50' },
          { label: 'صيانة قريبة', value: stats.due_soon, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'نشط', value: stats.active, color: 'text-green-600', bg: 'bg-green-50' },
        ].map(s => (
          <Col key={s.label} xs={12} md={6}>
            <div className={`${s.bg} rounded-xl p-4 text-center`}>
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
            </div>
          </Col>
        ))}
      </Row>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <Row gutter={12} align="middle">
          <Col flex="1">
            <Input
              prefix={<ToolOutlined className="text-gray-400" />}
              placeholder="بحث باسم العميل أو الهاتف أو العنوان..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              allowClear
            />
          </Col>
          <Col>
            <Select
              placeholder="الحالة"
              allowClear
              style={{ width: 150 }}
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: 'active', label: 'نشط' },
                { value: 'maintenance_due', label: 'صيانة قريبة' },
                { value: 'overdue', label: 'متأخر' },
                { value: 'inactive', label: 'غير نشط' },
              ]}
            />
          </Col>
        </Row>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm">
        <Table
          columns={columns}
          dataSource={records}
          rowKey="id"
          loading={loading}
          size="middle"
          pagination={{ pageSize: 20, showTotal: (total) => `${total} عميل` }}
          scroll={{ x: 900 }}
          locale={{ emptyText: <Empty description="لا يوجد عملاء بعد البيع" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
          rowClassName={(r) => r.status === 'overdue' ? 'bg-red-50/40' : r.status === 'maintenance_due' ? 'bg-amber-50/30' : ''}
        />
      </div>

      {/* Modal */}
      <Modal
        title={editingRecord ? 'تعديل سجل العميل' : 'إضافة عميل جديد'}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); setEditingRecord(null); form.resetFields(); }}
        onOk={() => form.submit()}
        okText="حفظ"
        cancelText="إلغاء"
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="customer_name" label="اسم العميل" rules={[{ required: true, message: 'يرجى إدخال اسم العميل' }]}>
                <Input placeholder="الاسم الكامل" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="customer_phone" label="رقم الهاتف">
                <Input placeholder="01xxxxxxxxx" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="customer_address" label="العنوان">
            <Input placeholder="المنطقة أو العنوان بالتفصيل" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={16}>
              <Form.Item name="system_description" label="النظام المثبت">
                <Input placeholder="مثال: VRF Midea 10HP + 4 وحدات داخلية" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="unit_count" label="عدد الوحدات" initialValue={1}>
                <InputNumber min={1} className="w-full" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="installation_date" label="تاريخ التركيب" rules={[{ required: true, message: 'يرجى اختيار التاريخ' }]}>
                <DatePicker className="w-full" placeholder="اختر التاريخ" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="technician_name" label="الفني المسؤول">
                <Input placeholder="اسم الفني" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="last_maintenance_date" label="آخر صيانة">
                <DatePicker className="w-full" placeholder="تاريخ آخر صيانة" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="next_maintenance_date" label="الصيانة القادمة">
                <DatePicker className="w-full" placeholder="تاريخ الصيانة التالية" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="notes" label="ملاحظات">
            <Input.TextArea placeholder="أي ملاحظات إضافية..." rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
