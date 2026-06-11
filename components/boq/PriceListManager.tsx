'use client';

import { useEffect, useState, useCallback } from 'react';
import { Table, InputNumber, Input, Button, message, Tooltip, Tag } from 'antd';
import { EditOutlined, CheckOutlined, CloseOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { PriceListItem } from '@/types';
import { useAuth } from '@/context/AuthContext';

export default function PriceListManager() {
  const { isAdmin, isTechLead } = useAuth();
  const canEdit = isAdmin || isTechLead;
  const canDelete = isAdmin;

  const [items, setItems] = useState<PriceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBuffer, setEditBuffer] = useState<{ price_usd?: number; description?: string }>({});
  const [showAdd, setShowAdd] = useState(false);
  const [newItem, setNewItem] = useState({ model: '', capacity_kw: 0, price_usd: 0, description: '' });

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/price-list');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Fetch failed');
      setItems(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed';
      message.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const startEdit = (item: PriceListItem) => {
    setEditingId(item.id);
    setEditBuffer({ price_usd: item.price_usd, description: item.description });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditBuffer({});
  };

  const saveEdit = async (id: string) => {
    try {
      const res = await fetch(`/api/price-list/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editBuffer),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Update failed');
      }
      message.success('تم التحديث');
      setEditingId(null);
      setEditBuffer({});
      fetchItems();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed';
      message.error(msg);
    }
  };

  const deleteItem = async (id: string) => {
    if (!confirm('هل تريد حذف هذا الموديل؟')) return;
    try {
      const res = await fetch(`/api/price-list/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Delete failed');
      }
      message.success('تم الحذف');
      fetchItems();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed';
      message.error(msg);
    }
  };

  const addItem = async () => {
    if (!newItem.model || newItem.price_usd <= 0) {
      message.error('يرجى إدخال الموديل والسعر');
      return;
    }
    try {
      const res = await fetch('/api/price-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newItem),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Add failed');
      }
      message.success('تم الإضافة');
      setShowAdd(false);
      setNewItem({ model: '', capacity_kw: 0, price_usd: 0, description: '' });
      fetchItems();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed';
      message.error(msg);
    }
  };

  const columns: ColumnsType<PriceListItem> = [
    {
      title: 'الموديل',
      dataIndex: 'model',
      key: 'model',
      width: 160,
      fixed: 'left',
    },
    {
      title: 'القدرة (kW)',
      dataIndex: 'capacity_kw',
      key: 'capacity_kw',
      width: 100,
      render: (v) => v ? `${v} kW` : '—',
    },
    {
      title: 'الوصف',
      dataIndex: 'description',
      key: 'description',
      render: (v, record) => {
        if (editingId === record.id) {
          return (
            <Input
              value={editBuffer.description ?? ''}
              onChange={(e) => setEditBuffer(prev => ({ ...prev, description: e.target.value }))}
            />
          );
        }
        return v || '—';
      },
    },
    {
      title: 'السعر (USD)',
      dataIndex: 'price_usd',
      key: 'price_usd',
      width: 130,
      render: (v, record) => {
        if (editingId === record.id) {
          return (
            <InputNumber
              value={editBuffer.price_usd}
              onChange={(val) => setEditBuffer(prev => ({ ...prev, price_usd: Number(val) || 0 }))}
              prefix="$"
              min={0}
              className="w-full"
            />
          );
        }
        return `$${Number(v).toLocaleString()}`;
      },
    },
    {
      title: 'إجراءات',
      key: 'actions',
      width: 130,
      fixed: 'right',
      render: (_, record) => {
        if (!canEdit) return <Tag>Read-only</Tag>;
        if (editingId === record.id) {
          return (
            <div className="flex gap-1">
              <Tooltip title="حفظ"><Button size="small" type="text" icon={<CheckOutlined />} onClick={() => saveEdit(record.id)} /></Tooltip>
              <Tooltip title="إلغاء"><Button size="small" type="text" icon={<CloseOutlined />} onClick={cancelEdit} /></Tooltip>
            </div>
          );
        }
        return (
          <div className="flex gap-1">
            <Tooltip title="تعديل"><Button size="small" type="text" icon={<EditOutlined />} onClick={() => startEdit(record)} /></Tooltip>
            {canDelete && (
              <Tooltip title="حذف"><Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => deleteItem(record.id)} /></Tooltip>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="bg-white rounded-lg border border-slate-100 shadow-sm p-4">
      <div className="flex justify-between items-center mb-3">
        <div>
          <h3 className="text-sm font-bold text-[#0D2137]">قائمة الأسعار (Price List)</h3>
          <p className="text-xs text-slate-500">إدارة موديلات وأسعار التكييف</p>
        </div>
        {canEdit && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowAdd(true)}>
            إضافة موديل
          </Button>
        )}
      </div>

      {showAdd && (
        <div className="bg-slate-50 rounded-lg p-3 mb-3 grid grid-cols-4 gap-2">
          <Input
            placeholder="الموديل (Model)"
            value={newItem.model}
            onChange={(e) => setNewItem(p => ({ ...p, model: e.target.value }))}
          />
          <InputNumber
            placeholder="القدرة (kW)"
            value={newItem.capacity_kw}
            onChange={(v) => setNewItem(p => ({ ...p, capacity_kw: Number(v) || 0 }))}
            className="w-full"
          />
          <InputNumber
            placeholder="السعر (USD)"
            value={newItem.price_usd}
            onChange={(v) => setNewItem(p => ({ ...p, price_usd: Number(v) || 0 }))}
            prefix="$"
            className="w-full"
          />
          <div className="flex gap-1">
            <Button type="primary" onClick={addItem}>حفظ</Button>
            <Button onClick={() => setShowAdd(false)}>إلغاء</Button>
          </div>
        </div>
      )}

      <Table
        rowKey="id"
        columns={columns}
        dataSource={items}
        loading={loading}
        size="small"
        scroll={{ x: 800 }}
        pagination={{ pageSize: 20 }}
      />
    </div>
  );
}
