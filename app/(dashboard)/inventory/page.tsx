'use client';

import { useState, useEffect } from 'react';
import {
  Table, Button, Typography, Row, Col, message,
  Modal, Form, Input, InputNumber, Select, Card, Statistic, Dropdown,
} from 'antd';
import {
  PlusOutlined, DatabaseOutlined, WarningOutlined,
  MoreOutlined, EditOutlined, DeleteOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { createClient } from '@/lib/supabase/client';
import { PRODUCT_CATEGORIES } from '@/lib/constants';
import type { MenuProps } from 'antd';
import { formatCurrency, getStockStatus } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';

const { Title, Text } = Typography;

interface Product {
  id: string;
  model: string;
  category: string;
  capacity_kw: number | null;
  price: number;
  stock: number;
  min_stock: number;
  image_url: string | null;
  created_at: string;
}

export default function InventoryPage() {
  const { isAdmin } = useAuth();
  const supabase = createClient();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form] = Form.useForm();

  const fetchProducts = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('products').select('*').order('category').order('model');
    if (error) message.error('فشل تحميل المنتجات');
    else setProducts((data || []) as Product[]);
    setLoading(false);
  };

  useEffect(() => { fetchProducts(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      if (editing) {
        const { error } = await supabase.from('products').update(values).eq('id', editing.id);
        if (error) throw error;
        message.success('تم التحديث');
      } else {
        const { error } = await supabase.from('products').insert(values);
        if (error) throw error;
        message.success('تم إضافة المنتج');
      }
      setModalOpen(false); setEditing(null); form.resetFields(); fetchProducts();
    } catch { message.error('حدث خطأ'); }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) message.error('فشل الحذف');
    else { message.success('تم الحذف'); fetchProducts(); }
  };

  const totalProducts = products.length;
  const lowStockCount = products.filter(p => getStockStatus(p.stock, p.min_stock) === 'low').length;
  const outOfStockCount = products.filter(p => getStockStatus(p.stock, p.min_stock) === 'out').length;


  const columns: ColumnsType<Product> = [
    { title: 'الموديل (Model)', dataIndex: 'model', key: 'model', width: 200, render: (m: string) => <Text strong>{m}</Text> },
    {
      title: 'الفئة (Category)', dataIndex: 'category', key: 'category', width: 130,
      render: (c: string) => { const cat = PRODUCT_CATEGORIES.find(x => x.value === c); return cat?.labelAr || c; },
    },
    { title: 'القدرة (kW)', dataIndex: 'capacity_kw', key: 'capacity_kw', width: 100, render: (v: number | null) => v ?? '—' },
    { title: 'السعر (Price)', dataIndex: 'price', key: 'price', width: 140, render: (v: number) => formatCurrency(v) },
    { title: 'المخزون (Stock)', dataIndex: 'stock', key: 'stock', width: 100 },
    {
      title: '', key: 'actions', width: 60,
      render: (_: unknown, r: Product) => {
        const items: MenuProps['items'] = [
          { key: 'edit', label: 'تعديل', icon: <EditOutlined />, onClick: () => { setEditing(r); form.setFieldsValue(r); setModalOpen(true); }},
        ];
        if (isAdmin) {
          items.push({ key: 'delete', label: 'حذف', icon: <DeleteOutlined />, danger: true, onClick: () => handleDelete(r.id) });
        }
        return (
          <Dropdown menu={{ items }} trigger={['click']}>
            <Button type="text" icon={<MoreOutlined />} size="small" />
          </Dropdown>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <Row justify="space-between" align="middle">
        <Col><Title level={4} style={{ margin: 0 }}>المخزون (Inventory)</Title></Col>
        {isAdmin && (
          <Col>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); form.resetFields(); setModalOpen(true); }}
              style={{ backgroundColor: '#D72B2B', borderColor: '#D72B2B' }}>إضافة منتج (Add Product)</Button>
          </Col>
        )}
      </Row>

      <Row gutter={16}>
        <Col xs={8}><Card><Statistic title="المنتجات" value={totalProducts} prefix={<DatabaseOutlined />} /></Card></Col>
        <Col xs={8}><Card><Statistic title="مخزون منخفض" value={lowStockCount} valueStyle={{ color: '#faad14' }} prefix={<WarningOutlined />} /></Card></Col>
        <Col xs={8}><Card><Statistic title="نفذ" value={outOfStockCount} valueStyle={{ color: '#f5222d' }} /></Card></Col>
      </Row>

      <div className="bg-white rounded-xl overflow-hidden">
        <Table columns={columns} dataSource={products} rowKey="id" loading={loading} scroll={{ x: 900 }} pagination={{ pageSize: 20 }} />
      </div>

      <Modal title={editing ? 'تعديل منتج' : 'منتج جديد'} open={modalOpen} onCancel={() => { setModalOpen(false); setEditing(null); }}
        onOk={handleSave} okText="حفظ" cancelText="إلغاء" okButtonProps={{ style: { backgroundColor: '#D72B2B', borderColor: '#D72B2B' } }} width={500}>
        <Form form={form} layout="vertical" requiredMark={false} initialValues={{ category: 'Outdoor', stock: 0, min_stock: 5, price: 0 }}>
          <Form.Item name="model" label="الموديل" rules={[{ required: true, message: 'مطلوب' }]}><Input placeholder="e.g. GMV5-280WM/E" /></Form.Item>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="category" label="الفئة"><Select options={PRODUCT_CATEGORIES.map(c => ({ value: c.value, label: c.labelAr }))} /></Form.Item></Col>
            <Col span={12}><Form.Item name="capacity_kw" label="القدرة kW"><InputNumber className="w-full" min={0} /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}><Form.Item name="price" label="السعر"><InputNumber className="w-full" min={0} /></Form.Item></Col>
            <Col span={8}><Form.Item name="stock" label="المخزون"><InputNumber className="w-full" min={0} /></Form.Item></Col>
            <Col span={8}><Form.Item name="min_stock" label="الحد الأدنى"><InputNumber className="w-full" min={0} /></Form.Item></Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
