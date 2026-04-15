'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Drawer, Descriptions, Tag, Space, Button, Timeline, Typography, Divider, Tooltip, Tabs, Form, Select, Input, InputNumber, message, Row, Col,
} from 'antd';
import { WhatsAppOutlined, PhoneOutlined, MailOutlined, EditOutlined, FileTextOutlined, DownloadOutlined, PlusOutlined } from '@ant-design/icons';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { LEAD_STATUSES, LEAD_SOURCES } from '@/lib/constants';
import { formatDate, getWhatsAppUrl } from '@/lib/utils';
import type { Lead, BOQ, CallLog, CallType, CallOutcome } from '@/types';
import { useAuth } from '@/context/AuthContext';
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
  const [calls, setCalls] = useState<CallLog[]>([]);
  const [loadingCalls, setLoadingCalls] = useState(false);
  const [isLoggingCall, setIsLoggingCall] = useState(false);
  const [form] = Form.useForm();
  const { user } = useAuth();
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

  const fetchCalls = useCallback(async () => {
    if (!lead) return;
    setLoadingCalls(true);
    const { data } = await supabase
      .from('call_logs')
      .select('*')
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: false });
    
    setCalls((data || []) as CallLog[]);
    setLoadingCalls(false);
  }, [lead, supabase]);

  useEffect(() => {
    if (open && lead) {
      fetchActivities();
      fetchBoqs();
      fetchCalls();
    }
  }, [open, lead, fetchActivities, fetchBoqs, fetchCalls]);

  const handleLogCall = async (values: {
    call_type: CallType;
    outcome: CallOutcome;
    duration_minutes: number;
    notes?: string;
  }) => {
    if (!lead || !user) return;

    try {
      const { error } = await supabase
        .from('call_logs')
        .insert({
          lead_id: lead.id,
          created_by: user.id,
          ...values
        });

      if (error) throw error;

      message.success('تم تسجيل المكالمة بنجاح');
      form.resetFields();
      setIsLoggingCall(false);
      fetchCalls();
      fetchActivities();
    } catch (err) {
      console.error('Error logging call:', err);
      message.error('فشل تسجيل المكالمة');
    }
  };

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
      <div className="flex gap-2 mb-6 px-1">
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

      <Tabs
        defaultActiveKey="1"
        items={[
          {
            key: '1',
            label: 'تفاصيل (Details)',
            children: (
              <>
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
                  <Descriptions.Item label="تاريخ الإضافة (Created)">
                    {formatDate(lead.created_at)}
                  </Descriptions.Item>
                </Descriptions>
                {lead.notes && (
                  <>
                    <Divider>ملاحظات (Notes)</Divider>
                    <div className="bg-gray-50 rounded-lg p-4 text-sm whitespace-pre-wrap">
                      {lead.notes}
                    </div>
                  </>
                )}
              </>
            ),
          },
          {
            key: 'calls',
            label: `المكالمات (${calls.length})`,
            children: (
              <div className="space-y-4">
                <Button 
                  type="dashed" 
                  block 
                  icon={<PlusOutlined />} 
                  onClick={() => setIsLoggingCall(!isLoggingCall)}
                >
                  {isLoggingCall ? 'إلغاء' : 'تسجيل مكالمة جديدة (Log Call)'}
                </Button>

                {isLoggingCall && (
                  <div className="bg-gray-50 p-4 rounded-lg border border-dashed border-gray-300">
                    <Form
                      form={form}
                      layout="vertical"
                      size="small"
                      onFinish={handleLogCall}
                      initialValues={{ call_type: 'Outbound', duration_minutes: 1 }}
                    >
                      <Row gutter={12}>
                        <Col span={12}>
                          <Form.Item name="call_type" label="النوع" rules={[{ required: true }]}>
                            <Select options={[{ label: 'صادرة (Outbound)', value: 'Outbound' }, { label: 'واردة (Inbound)', value: 'Inbound' }]} />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="duration_minutes" label="المدة (دقائق)">
                            <InputNumber min={0} style={{ width: '100%' }} />
                          </Form.Item>
                        </Col>
                      </Row>
                      <Form.Item name="outcome" label="النتيجة (Outcome)" rules={[{ required: true }]}>
                        <Select options={[
                          { label: 'تم الرد (Answered)', value: 'Answered' },
                          { label: 'لم يتم الرد (No Answer)', value: 'No Answer' },
                          { label: 'مشغول (Busy)', value: 'Busy' },
                          { label: 'طلب معاودة (Callback)', value: 'Callback Requested' },
                        ]} />
                      </Form.Item>
                      <Form.Item name="notes" label="ملاحظات">
                        <Input.TextArea rows={2} />
                      </Form.Item>
                      <Button type="primary" htmlType="submit" block style={{ backgroundColor: '#D72B2B', borderColor: '#D72B2B' }}>
                        حفظ المكالمة
                      </Button>
                    </Form>
                  </div>
                )}

                {loadingCalls ? (
                  <Text type="secondary" className="block text-center py-4 italic">جارٍ التحميل...</Text>
                ) : (
                  <Timeline
                    items={calls.map(call => ({
                    color: call.outcome === 'Answered' ? 'green' : 'red',
                    children: (
                      <div className="border border-gray-100 p-2 rounded bg-white">
                        <div className="flex justify-between items-start mb-1">
                          <Tag style={{ fontSize: 10 }}>{call.call_type === 'Outbound' ? 'صادرة' : 'واردة'}</Tag>
                          <Text type="secondary" style={{ fontSize: 10 }}>{formatDate(call.created_at)}</Text>
                        </div>
                        <div className="mb-1 text-xs">
                          <Text strong>{call.outcome}</Text> 
                          <Text type="secondary" className="ml-2">({call.duration_minutes} min)</Text>
                        </div>
                        {call.notes && <Text type="secondary" className="text-[10px] italic block mb-1">&quot;{call.notes}&quot;</Text>}
                      </div>
                    )
                  }))}
                />
                )}
              </div>
            )
          },
          {
            key: '2',
            label: `المقايسات (${boqs.length})`,
            children: (
              <div className="space-y-3">
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
                  boqs.map((boq) => {
                    const grandTotalUSD = boq.grand_total / (boq.exchange_rate || 50);
                    return (
                      <div key={boq.id} className="border border-gray-100 rounded-lg p-3 hover:border-accent transition-colors">
                        <div className="flex items-center justify-between mb-2">
                          <Text strong className="block text-xs">BOQ #{boq.boq_number}</Text>
                          <Tag color={boq.status === 'Paid' ? 'green' : boq.status === 'Sent' ? 'blue' : 'default'} style={{ margin: 0, fontSize: 10 }}>
                            {boq.status}
                          </Tag>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex flex-col">
                            <span className="font-bold text-accent text-xs">
                              {new Intl.NumberFormat('en-EG').format(boq.grand_total)} EGP
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              ({new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(grandTotalUSD)})
                            </span>
                          </div>
                          <Space size="small">
                            <Link href={`/boq?id=${boq.id}`}>
                              <Button size="small">View</Button>
                            </Link>
                            <PDFDownloadButton 
                              items={boq.boq_items || []}
                              subtotal={boq.subtotal}
                              discountPercent={boq.discount_percent}
                              vatAmount={boq.vat_amount}
                              grandTotal={boq.grand_total}
                              grandTotalUSD={grandTotalUSD}
                              dateCreated={boq.created_at}
                              customer={lead}
                            />
                          </Space>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            ),
          },
          {
            key: '3',
            label: 'النشاط (Activity)',
            children: (
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
            ),
          },
        ]}
      />
    </Drawer>
  );
}
