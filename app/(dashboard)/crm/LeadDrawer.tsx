'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Drawer, Descriptions, Tag, Space, Button, Timeline, Typography, Divider, Tooltip,
} from 'antd';
import { WhatsAppOutlined, PhoneOutlined, MailOutlined, EditOutlined, CalendarOutlined, FileTextOutlined, DownloadOutlined, EyeOutlined, PlusOutlined } from '@ant-design/icons';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { LEAD_STATUSES, LEAD_SOURCES } from '@/lib/constants';
import { formatDate, getWhatsAppUrl } from '@/lib/utils';
import type { Lead, BOQ } from '@/types';
import dynamic from 'next/dynamic';

const PDFDownloadButton = dynamic(() => import('@/components/boq/PDFDownloadButton'), {
  ssr: false,
  loading: () => <Button icon={<DownloadOutlined />} size="small" disabled>PDF</Button>
});

const { Text, Title } = Typography;

interface Activity {
  id: string;
  type: string;
  note: string;
  created_at: string;
  user_id: string;
}

interface LeadDrawerProps {
  lead: Lead | null;
  open: boolean;
  onClose: () => void;
  onEdit: (lead: Lead) => void;
}

export default function LeadDrawer({ lead, open, onClose, onEdit }: LeadDrawerProps) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [boqs, setBoqs] = useState<BOQ[]>([]);
  const [loadingBoqs, setLoadingBoqs] = useState(false);
  const supabase = createClient();

  const fetchActivities = useCallback(async () => {
    if (!lead) return;
    const { data } = await supabase
      .from('lead_activities')
      .select('*')
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: false });
    
    setActivities(data || []);
  }, [lead, supabase]);

  const fetchBoqs = useCallback(async () => {
    if (!lead) return;
    setLoadingBoqs(true);
    const { data } = await supabase
      .from('boqs')
      .select('*, boq_items(*, product(*))')
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: false });
    
    setBoqs((data || []) as BOQ[]);
    setLoadingBoqs(false);
  }, [lead, supabase]);

  useEffect(() => {
    if (open && lead) {
      fetchActivities();
      fetchBoqs();
    }
  }, [open, lead, fetchActivities, fetchBoqs]);

  if (!lead) return null;

  const statusConfig = LEAD_STATUSES.find((s) => s.value === lead.status);
  const sourceConfig = LEAD_SOURCES.find((s) => s.value === lead.source);

  return (
    <Drawer
      title={
        <div className="flex items-center justify-between">
          <div>
            <Title level={5} style={{ margin: 0 }}>{lead.name}</Title>
            {lead.company && <Text type="secondary">{lead.company}</Text>}
          </div>
          <Button
            type="primary"
            icon={<EditOutlined />}
            onClick={() => onEdit(lead)}
            style={{ backgroundColor: '#D72B2B', borderColor: '#D72B2B' }}
            size="small"
          >
            تعديل
          </Button>
        </div>
      }
      placement="right"
      width={440}
      open={open}
      onClose={onClose}
    >
      {/* Quick Actions */}
      <div className="flex gap-2 mb-6">
        {lead.phone && (
          <>
            <Tooltip title="WhatsApp">
              <Button
                icon={<WhatsAppOutlined />}
                href={getWhatsAppUrl(lead.phone)}
                target="_blank"
                style={{ color: '#25D366', borderColor: '#25D366' }}
              />
            </Tooltip>
            <Tooltip title="اتصال (Call)">
              <Button
                icon={<PhoneOutlined />}
                href={`tel:${lead.phone}`}
              />
            </Tooltip>
          </>
        )}
        {lead.email && (
          <Tooltip title="بريد (Email)">
            <Button
              icon={<MailOutlined />}
              href={`mailto:${lead.email}`}
            />
          </Tooltip>
        )}
        <Tooltip title="إنشاء مقايسة (Create BOQ)">
          <Link href={`/boq?leadId=${lead.id}`}>
            <Button
              icon={<FileTextOutlined />}
              type="primary"
              ghost
            />
          </Link>
        </Tooltip>
      </div>

      {/* Details */}
      <Descriptions column={1} size="small" bordered className="mb-6">
        <Descriptions.Item label="الحالة (Status)">
          <Tag color={statusConfig?.color}>{statusConfig?.labelAr || lead.status}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="المصدر (Source)">
          <Tag color={sourceConfig?.color}>{sourceConfig?.labelAr || lead.source}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="الهاتف (Phone)">
          {lead.phone || '—'}
        </Descriptions.Item>
        <Descriptions.Item label="البريد (Email)">
          {lead.email || '—'}
        </Descriptions.Item>
        <Descriptions.Item label="المنطقة (Region)">
          {lead.region || '—'}
        </Descriptions.Item>
        <Descriptions.Item label="المتابعة القادمة (Follow-up)">
          {lead.next_follow_up ? (
            <Space>
              <CalendarOutlined />
              {formatDate(lead.next_follow_up)}
            </Space>
          ) : '—'}
        </Descriptions.Item>
        <Descriptions.Item label="تاريخ الإضافة (Created)">
          {formatDate(lead.created_at)}
        </Descriptions.Item>
      </Descriptions>

      {/* Notes */}
      {lead.notes && (
        <>
          <Divider>ملاحظات (Notes)</Divider>
          <div className="bg-gray-50 rounded-lg p-4 text-sm leading-relaxed whitespace-pre-wrap">
            {lead.notes}
          </div>
        </>
      )}

      {/* BOQs / Quotes */}
      <Divider>
        <Space>
          <FileTextOutlined />
          <span>المقايسات (BOQs)</span>
        </Space>
      </Divider>
      
      {loadingBoqs ? (
        <Text type="secondary" className="block text-center py-4 italic">جارٍ التحميل...</Text>
      ) : boqs.length === 0 ? (
        <div className="text-center py-4 bg-gray-50 rounded-lg">
          <Text type="secondary" className="block mb-2">لا توجد مقايسات مرتبطة</Text>
          <Link href={`/boq?leadId=${lead.id}`}>
            <Button type="link" size="small" icon={<PlusOutlined />}>إنشاء واحدة الآن</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {boqs.map((boq) => (
            <div key={boq.id} className="border border-gray-100 rounded-lg p-3 hover:border-accent transition-colors">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <Text strong className="block text-xs">{boq.boq_number}</Text>
                  <Text type="secondary" style={{ fontSize: 10 }}>{formatDate(boq.created_at)}</Text>
                </div>
                <Tag color={boq.status === 'Paid' ? 'green' : boq.status === 'Sent' ? 'blue' : 'default'} style={{ margin: 0, fontSize: 10 }}>
                  {boq.status}
                </Tag>
              </div>
              
              <div className="flex justify-between items-center mt-3">
                <Text strong className="text-accent">{new Intl.NumberFormat('en-EG').format(boq.grand_total)} EGP</Text>
                <Space size="small">
                  <Link href={`/boq?id=${boq.id}`}>
                    <Tooltip title="View / Edit">
                      <Button size="small" icon={<EyeOutlined />} />
                    </Tooltip>
                  </Link>
                  <PDFDownloadButton 
                    items={boq.boq_items || []}
                    subtotal={boq.subtotal}
                    discountPercent={boq.discount_percent}
                    vatAmount={boq.vat_amount}
                    grandTotal={boq.grand_total}
                    customer={lead}
                    size="sm"
                    variant="outline"
                    className="h-8"
                    label="PDF"
                  />
                  <Tooltip title="Send via WhatsApp">
                    <Button 
                      size="small" 
                      icon={<WhatsAppOutlined />} 
                      className="bg-[#25D366] hover:bg-[#128C7E] text-white border-none"
                      onClick={() => {
                        const text = `Hello ${lead.name},\n\nHere is your quotation ${boq.boq_number} from GCHV Egypt:\n\n*Total: ${new Intl.NumberFormat('en-EG').format(boq.grand_total)} EGP*\n\nPlease let us know if you have any questions.\n\nThank you!`;
                        window.open(`https://wa.me/${lead.phone?.replace(/[^0-9+]/g, '')}?text=${encodeURIComponent(text)}`, '_blank');
                      }}
                    />
                  </Tooltip>
                </Space>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Activity Timeline placeholder */}
      <Divider>
        النشاط (Activity)
      </Divider>
      <Timeline
        items={[
          ...activities.map(a => ({
            color: a.type === 'creation' ? 'green' : a.type === 'status_change' ? 'orange' : 'blue',
            children: (
              <div>
                <Text strong className="text-xs">
                  {a.type === 'creation' ? 'تم إنشاء العميل' : 
                   a.type === 'status_change' ? 'تغيير الحالة' : 
                   a.type === 'edit' ? 'تحديث البيانات' : 'ملاحظة جديدة'}
                </Text>
                <Text type="secondary" className="block text-[10px]">
                  {formatDate(a.created_at)}
                </Text>
              </div>
            )
          })),
          {
            color: 'gray',
            children: <Text type="secondary" className="text-[10px]">نهاية السجل</Text>
          }
        ]}
      />
    </Drawer>
  );
}
