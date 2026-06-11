'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Table, InputNumber, Input, Button, Tooltip, Select } from 'antd';
import { PlusOutlined, CopyOutlined, DeleteOutlined, PercentageOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { BOQItem, Lead, PriceListItem } from '@/types';
import { createClient } from '@/lib/supabase/client';

export const Y_BRANCH_MODEL = 'KHRP26A22C';
export const Y_BRANCH_DEFAULT_PRICE = 60;
export const Y_BRANCH_TYPE = 'Y-Branch';

export function deriveType(description?: string | null): string {
  if (!description) return 'Unit';
  const d = description.toLowerCase();
  if (d.includes('heat recovery ventilator') || d.includes('hrv')) return 'HRV';
  if (d.includes('wall mounted') || d.includes('wall-mounted')) return 'Wall';
  if (d.includes('cassette')) return 'Cassette';
  if (d.includes('vrf') && d.includes('outdoor')) return 'VRF Outdoor';
  if (d.includes('mini vrf') && d.includes('outdoor')) return 'Mini VRF Outdoor';
  if (d.includes('ducted') || d.includes('duct')) return 'Ducted';
  return 'Unit';
}

type Group = 'indoor' | 'outdoor' | 'accessory';

function groupOf(type: string): Group {
  if (type === 'Wall' || type === 'Cassette' || type === 'Ducted') return 'indoor';
  if (type === 'VRF Outdoor' || type === 'Mini VRF Outdoor') return 'outdoor';
  return 'accessory';
}

type Row =
  | (BOQItem & { _kind: 'item' })
  | { _kind: 'section'; _key: string; _title: string };

interface BOQEditorProps {
  items: BOQItem[];
  customers: Lead[];
  selectedCustomer: string | null;
  onSelectCustomer: (id: string) => void;
  onAddItem: () => void;
  onUpdateItem: (id: string, patch: Partial<BOQItem>) => void;
  onRemoveItem: (id: string) => void;
  onDuplicateItem: (id: string) => void;
  discountPercent: number;
  onUpdateDiscount: (p: number) => void;
  yBranchUnitPrice: number;
  onUpdateYBranchUnitPrice: (p: number) => void;
}

export function BOQEditor({
  items,
  customers,
  selectedCustomer,
  onSelectCustomer,
  onAddItem,
  onUpdateItem,
  onRemoveItem,
  onDuplicateItem,
  discountPercent,
  onUpdateDiscount,
  yBranchUnitPrice,
  onUpdateYBranchUnitPrice,
}: BOQEditorProps) {
  const supabase = useMemo(() => createClient(), []);
  const [priceList, setPriceList] = useState<PriceListItem[]>([]);
  const [priceListLoading, setPriceListLoading] = useState(true);
  const [unitNo, setUnitNo] = useState<Record<string, string>>({});
  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setPriceListLoading(true);
      const { data, error } = await supabase
        .from('price_list')
        .select('id, model, capacity_kw, description, price_usd')
        .order('capacity_kw', { ascending: true });
      if (!cancelled && !error && data) setPriceList(data as PriceListItem[]);
      if (!cancelled) setPriceListLoading(false);
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  const priceMap = useMemo(() => {
    const m: Record<string, PriceListItem> = {};
    for (const p of priceList) m[p.model] = p;
    return m;
  }, [priceList]);

  // Grouped options for the model Select dropdown
  const modelOptions = useMemo(() => {
    const indoor: { value: string; label: string; cap: number; price: number }[] = [];
    const outdoor: { value: string; label: string; cap: number; price: number }[] = [];
    const other: { value: string; label: string; cap: number; price: number }[] = [];

    for (const p of priceList) {
      const t = deriveType(p.description);
      const opt = { value: p.model, label: p.model, cap: p.capacity_kw, price: p.price_usd };
      if (['Wall', 'Cassette', 'Ducted'].includes(t)) indoor.push(opt);
      else if (['VRF Outdoor', 'Mini VRF Outdoor'].includes(t)) outdoor.push(opt);
      else other.push(opt);
    }

    const groups = [];
    if (indoor.length) groups.push({ label: 'Indoor Units', options: indoor });
    if (outdoor.length) groups.push({ label: 'Outdoor Units', options: outdoor });
    if (other.length) groups.push({ label: 'HRV / Accessories', options: other });
    return groups;
  }, [priceList]);

  const rows: Row[] = useMemo(() => {
    const groups: Record<Group, BOQItem[]> = { indoor: [], outdoor: [], accessory: [] };
    for (const item of items) {
      const t = item.unit_type || deriveType(priceMap[item.model]?.description);
      groups[groupOf(t)].push({ ...item, _kind: 'item' } as BOQItem & { _kind: 'item' });
    }
    const order: Array<[Group, string]> = [
      ['indoor', 'Indoor Units'],
      ['outdoor', 'Outdoor Units'],
      ['accessory', 'Accessories / HRV'],
    ];
    const out: Row[] = [];
    for (const [g, title] of order) {
      if (groups[g].length === 0) continue;
      out.push({ _kind: 'section', _key: `sec-${g}`, _title: title });
      out.push(...(groups[g] as Row[]));
    }
    return out;
  }, [items, priceMap]);

  const subtotal = useMemo(
    () => items.reduce((acc, i) => acc + (i.quantity || 0) * (i.unit_price || 0), 0),
    [items]
  );
  const totalQty = useMemo(() => items.reduce((acc, i) => acc + (i.quantity || 0), 0), [items]);
  const yBranchQty = Math.max((totalQty - 2) * 2, 0);
  const yBranchTotal = yBranchQty * yBranchUnitPrice;
  const grandTotal = subtotal + yBranchTotal;
  const discountAmount = (grandTotal * discountPercent) / 100;
  const discountedTotal = grandTotal - discountAmount;

  const handleModelSelect = useCallback(
    (itemId: string, model: string) => {
      const p = priceMap[model];
      if (p) {
        onUpdateItem(itemId, {
          model,
          unit_price: p.price_usd,
          capacity_kw: p.capacity_kw,
          unit_type: deriveType(p.description),
        });
      } else {
        onUpdateItem(itemId, { model, unit_type: 'Unit' });
      }
    },
    [priceMap, onUpdateItem]
  );

  const handleQtyChange = useCallback(
    (itemId: string, qty: number, currentPrice: number) => {
      onUpdateItem(itemId, { quantity: qty, total: qty * (currentPrice || 0) });
    },
    [onUpdateItem]
  );

  const handleTotalKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); onAddItem(); }
      if (e.key === 'Escape') (e.currentTarget as HTMLElement).blur();
    },
    [onAddItem]
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        const target = e.target as HTMLElement | null;
        if (!target) return;
        const rowEl = target.closest('tr[data-row-key]') as HTMLTableRowElement | null;
        if (rowEl && tableRef.current?.contains(rowEl)) {
          const key = rowEl.getAttribute('data-row-key');
          if (key && items.some(i => i.id === key)) {
            e.preventDefault();
            onDuplicateItem(key);
          }
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [items, onDuplicateItem]);

  const columns: ColumnsType<Row> = [
    {
      title: '#',
      key: 'index',
      width: 36,
      render: (_: unknown, record: Row) => {
        if (record._kind === 'section') return '';
        const idx = rows.indexOf(record);
        const before = rows.slice(0, idx).filter(r => r._kind === 'item').length;
        return <span className="text-xs text-slate-400">{before + 1}</span>;
      },
    },
    {
      title: 'Unit No',
      key: 'unit_no',
      width: 72,
      render: (_: unknown, record: Row) => {
        if (record._kind === 'section') return null;
        return (
          <Input
            value={unitNo[record.id] || ''}
            onChange={(e) => setUnitNo(prev => ({ ...prev, [record.id]: e.target.value }))}
            placeholder="IDU-1"
            size="small"
          />
        );
      },
    },
    {
      title: 'Type',
      key: 'type',
      width: 90,
      render: (_: unknown, record: Row) => {
        if (record._kind === 'section') return null;
        const t = record.unit_type || deriveType(priceMap[record.model]?.description);
        return <span className="text-xs">{t}</span>;
      },
    },
    {
      title: 'Cap. KW',
      key: 'capacity_kw',
      width: 72,
      align: 'center',
      render: (_: unknown, record: Row) => {
        if (record._kind === 'section') return null;
        const cap = record.capacity_kw ?? priceMap[record.model]?.capacity_kw ?? 0;
        return <span className="text-xs">{cap > 0 ? cap : '—'}</span>;
      },
    },
    {
      title: 'Qty',
      key: 'quantity',
      width: 68,
      render: (_: unknown, record: Row) => {
        if (record._kind === 'section') return null;
        return (
          <InputNumber
            min={0}
            value={record.quantity}
            onChange={(v) => handleQtyChange(record.id, Number(v) || 0, record.unit_price || 0)}
            size="small"
            className="w-full"
          />
        );
      },
    },
    {
      title: 'Model',
      key: 'model',
      width: 210,
      render: (_: unknown, record: Row) => {
        if (record._kind === 'section') return null;
        return (
          <Select
            showSearch
            loading={priceListLoading}
            value={record.model || undefined}
            onChange={(value: string) => handleModelSelect(record.id, value)}
            options={modelOptions}
            filterOption={(input, option) =>
              (option?.value as string)?.toLowerCase().includes(input.toLowerCase()) ?? false
            }
            optionRender={(option) => {
              const p = priceMap[option.value as string];
              return (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium truncate">{option.value}</span>
                  {p && (
                    <span className="text-xs text-slate-400 shrink-0">
                      {p.capacity_kw > 0 ? `${p.capacity_kw}kW` : 'HRV'} · ${p.price_usd}
                    </span>
                  )}
                </div>
              );
            }}
            placeholder="اختر الموديل..."
            size="small"
            style={{ width: '100%' }}
            popupMatchSelectWidth={false}
            dropdownStyle={{ minWidth: 340 }}
            listHeight={320}
          />
        );
      },
    },
    {
      title: 'Unit Price',
      key: 'unit_price',
      width: 88,
      align: 'right',
      render: (_: unknown, record: Row) => {
        if (record._kind === 'section') return null;
        return <span className="text-xs font-medium">${(record.unit_price || 0).toFixed(2)}</span>;
      },
    },
    {
      title: 'Notes',
      key: 'notes',
      width: 160,
      render: (_: unknown, record: Row) => {
        if (record._kind === 'section') return null;
        return (
          <Input
            value={record.notes || ''}
            onChange={(e) => onUpdateItem(record.id, { notes: e.target.value })}
            placeholder="ملاحظات..."
            size="small"
          />
        );
      },
    },
    {
      title: 'Total $',
      key: 'total',
      width: 90,
      align: 'right',
      render: (_: unknown, record: Row) => {
        if (record._kind === 'section') return null;
        const total = (record.quantity || 0) * (record.unit_price || 0);
        return (
          <div
            tabIndex={0}
            onKeyDown={handleTotalKeyDown}
            className="text-xs font-bold text-[#0D2137] outline-none focus:ring-1 focus:ring-blue-400 rounded px-1 cursor-default"
          >
            ${total.toFixed(2)}
          </div>
        );
      },
    },
    {
      title: '',
      key: 'actions',
      width: 60,
      render: (_: unknown, record: Row) => {
        if (record._kind === 'section') return null;
        return (
          <div className="flex gap-0.5">
            <Tooltip title="Duplicate (Ctrl+D)">
              <Button size="small" type="text" icon={<CopyOutlined />} onClick={() => onDuplicateItem(record.id)} />
            </Tooltip>
            <Tooltip title="Delete">
              <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => onRemoveItem(record.id)} />
            </Tooltip>
          </div>
        );
      },
    },
  ];

  return (
    <div className="bg-white rounded-lg border border-slate-100 shadow-sm p-4" ref={tableRef}>
      {/* Toolbar */}
      <div className="flex justify-between items-center mb-3 gap-2 flex-wrap">
        <div>
          <h3 className="text-sm font-bold text-[#0D2137]">BOQ Grid</h3>
          <p className="text-xs text-slate-400">Tab/Enter to navigate · Enter on Total adds row · Ctrl+D duplicate</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Customer:</span>
          <Select
            value={selectedCustomer || undefined}
            onChange={onSelectCustomer}
            placeholder="Select customer"
            style={{ minWidth: 200 }}
            size="small"
            showSearch
            filterOption={(input, option) =>
              (option?.label as string)?.toLowerCase().includes(input.toLowerCase()) ?? false
            }
            options={customers.map(c => ({
              value: c.id,
              label: `${c.name}${c.company ? ` — ${c.company}` : ''}`,
            }))}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={onAddItem} size="small">
            Add Row
          </Button>
        </div>
      </div>

      {/* Force LTR so column order matches the Excel reference */}
      <div dir="ltr">
        <Table
          rowKey={(record) => (record._kind === 'section' ? (record as { _key: string })._key : record.id)}
          columns={columns}
          dataSource={rows}
          size="small"
          pagination={false}
          rowClassName={(record) => (record._kind === 'section' ? 'section-header-row' : '')}
          scroll={{ x: 950 }}
          summary={() => (
            <Table.Summary>
              {/* Y-Branch — cols: #(0) UnitNo(1) Type(2) Cap(3) Qty(4) Model(5) UnitPrice(6) Notes(7) Total(8) Actions(9) */}
              <Table.Summary.Row className="bg-blue-50/50">
                <Table.Summary.Cell index={0} colSpan={4} className="!text-right">
                  <span className="text-xs font-semibold text-slate-600">Y-Branch</span>
                  <span className="text-xs text-slate-400 ml-1">
                    max((Σqty−2)×2, 0) = {yBranchQty}
                  </span>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={4} className="text-center">
                  <span className="text-xs font-bold">{yBranchQty}</span>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={5}>
                  <Input value={Y_BRANCH_MODEL} disabled size="small" className="text-xs" />
                </Table.Summary.Cell>
                <Table.Summary.Cell index={6} className="text-right">
                  <InputNumber
                    min={0}
                    value={yBranchUnitPrice}
                    onChange={(v) => onUpdateYBranchUnitPrice(Number(v) || 0)}
                    prefix="$"
                    size="small"
                    style={{ width: 80 }}
                  />
                </Table.Summary.Cell>
                <Table.Summary.Cell index={7} />
                <Table.Summary.Cell index={8} className="text-right">
                  <span className="text-xs font-bold">${yBranchTotal.toFixed(2)}</span>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={9} />
              </Table.Summary.Row>

              {/* Grand Total */}
              <Table.Summary.Row className="bg-slate-100">
                <Table.Summary.Cell index={0} colSpan={8} className="!text-right">
                  <span className="text-sm font-bold text-[#0D2137]">Grand Total</span>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={8} className="text-right">
                  <span className="text-sm font-bold text-[#0D2137]">${grandTotal.toFixed(2)}</span>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={9} />
              </Table.Summary.Row>

              {/* Discount */}
              <Table.Summary.Row className="bg-amber-50/60">
                <Table.Summary.Cell index={0} colSpan={3} className="!text-right">
                  <span className="text-xs font-medium inline-flex items-center gap-1">
                    <PercentageOutlined /> Total after discount
                  </span>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={3}>
                  <InputNumber
                    min={0} max={100}
                    value={discountPercent}
                    onChange={(v) => onUpdateDiscount(Number(v) || 0)}
                    suffix="%"
                    size="small"
                    style={{ width: 72 }}
                  />
                </Table.Summary.Cell>
                <Table.Summary.Cell index={4} colSpan={4} className="!text-right">
                  <span className="text-xs text-red-500 font-medium">−${discountAmount.toFixed(2)}</span>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={8} className="text-right">
                  <span className="text-sm font-bold text-emerald-700">${discountedTotal.toFixed(2)}</span>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={9} />
              </Table.Summary.Row>
            </Table.Summary>
          )}
        />
      </div>

      <SectionHeaderStyles />
    </div>
  );
}

function SectionHeaderStyles() {
  return (
    <style jsx global>{`
      .ant-table-tbody > tr.section-header-row > td {
        background: #e8edf5 !important;
        font-weight: 700;
        color: #0D2137;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        font-size: 10px;
        padding: 5px 12px !important;
      }
    `}</style>
  );
}

export default BOQEditor;
