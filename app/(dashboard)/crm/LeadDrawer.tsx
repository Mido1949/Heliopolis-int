'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Drawer, Descriptions, Tag, Space, Button, Timeline, Typography, Divider, Tooltip, Tabs, Form, Select, Input, InputNumber, message, Row, Col, Checkbox,
} from 'antd';
import { WhatsAppOutlined, PhoneOutlined, MailOutlined, EditOutlined, FileTextOutlined, DownloadOutlined, PlusOutlined } from '@ant-design/icons';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { LEAD_STATUSES, LEAD_SOURCES } from '@/lib/constants';
import { formatDate, getWhatsAppUrl } from '@/lib/utils';
import type { Lead, BOQ, BOQItem, CallLog, CallType, CallOutcome } from '@/types';
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
  body: string | null;
  duration_seconds: number | null;
  details: Record<string, unknown> | null;
  created_at: string;
  user_id: string;
}

interface LeadDrawerProps {
  lead: Lead | null;
  open: boolean;
  onClose: () => void;
  onEdit: (lead: Lead) => void;
  onAssigned?: () => void;
}

export default function LeadDrawer({ lead, open, onClose, onEdit, onAssigned }: LeadDrawerProps) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [boqs, setBoqs] = useState<BOQ[]>([]);
  const [loadingBoqs, setLoadingBoqs] = useState(false);
  const [calls, setCalls] = useState<CallLog[]>([]);
  const [loadingCalls, setLoadingCalls] = useState(false);
  const [isLoggingCall, setIsLoggingCall] = useState(false);
  const [form] = Form.useForm();
  const { user, profile, isAdmin, isManager, isCSLead, isTechLead } = useAuth();
  const isFullAdmin    = isAdmin || isManager;
  const isCSTeam       = isCSLead  || profile?.crm_team === 'cs';
  const isTechTeam     = isTechLead || profile?.crm_team === 'tech';
  const canSendToTech  = isCSTeam   || isFullAdmin;
  const canSendToCS    = isTechTeam || isFullAdmin;
  const supabase = createClient();
  const [assignTeam, setAssignTeam] = useState<string | undefined>();
  const [assignUser, setAssignUser] = useState<string | undefined>();
  const [teamUsers, setTeamUsers] = useState<{ id: string; name: string }[]>([]);
  const [assigning, setAssigning] = useState(false);

  // Activity tab state
  const [activityTab, setActivityTab] = useState<'all' | 'call' | 'note'>('all');
  const [activityForm] = Form.useForm();
  const [profileMap, setProfileMap] = useState<Record<string, string>>({});
  const [addingActivity, setAddingActivity] = useState(false);
  const lastFetchRef = useRef<{ leadId: string; time: number } | null>(null);

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
      .select('id, boq_number, boq_serial, customer_name, grand_total, subtotal, discount_percent, status, created_at, created_by, boq_items(id, model, quantity, unit_price, location, floor, area, unit_type, capacity_kw)')
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: false });

    setBoqs((data || []).map((b: BOQ) => ({
      ...b,
      boq_items: (b.boq_items || []).map((item: BOQItem) => ({
        ...item,
        total: item.quantity * item.unit_price,
      })),
    })) as BOQ[]);
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

  const fetchProfileMap = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('id, name');
    if (data) {
      const map: Record<string, string> = {};
      data.forEach(p => { map[p.id] = p.name; });
      setProfileMap(map);
    }
  }, [supabase]);

  const handleAddActivity = async (values: { type: 'call' | 'note'; body: string; duration_seconds?: number }) => {
    if (!lead || !user) return;
    const { error } = await supabase.from('lead_activities').insert({
      lead_id: lead.id,
      user_id: user.id,
      type: values.type,
      body: values.body,
      duration_seconds: values.type === 'call' ? (values.duration_seconds ?? null) : null,
    });
    if (error) {
      message.error('فشل إضافة النشاط');
      return;
    }
    message.success('تم إضافة النشاط');
    activityForm.resetFields();
    setAddingActivity(false);
    fetchActivities();
  };

  useEffect(() => {
    if (!open || !lead) return;
    const now = Date.now();
    const cache = lastFetchRef.current;
    const isCached = cache && cache.leadId === lead.id && now - cache.time < 60_000;
    if (!isCached) {
      lastFetchRef.current = { leadId: lead.id, time: now };
      fetchActivities();
      fetchBoqs();
      fetchCalls();
      fetchProfileMap();
    }
  }, [open, lead, fetchActivities, fetchBoqs, fetchCalls, fetchProfileMap]);

  useEffect(() => {
    if (open && lead) {
      setAssignTeam(lead.assigned_to_team);
      setAssignUser(lead.assigned_to_user);
      if (lead.assigned_to_team) {
        supabase
          .from('profiles')
          .select('id, name')
          .eq('crm_team', lead.assigned_to_team)
          .then(({ data }) => setTeamUsers((data || []) as { id: string; name: string }[]));
      } else {
        setTeamUsers([]);
      }
    } else {
      setAssignTeam(undefined);
      setAssignUser(undefined);
      setTeamUsers([]);
    }
  }, [open, lead, supabase]);

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
          user_id: user.id,
          ...values
        });

      if (error) throw error;

      // Auto-log call to lead_activities
      const durationSec = (values.duration_minutes ?? 0) * 60;
      await supabase.from('lead_activities').insert({
        lead_id: lead.id,
        user_id: user.id,
        type: 'call',
        body: `${values.outcome} — ${durationSec}ث`,
        duration_seconds: durationSec || null,
      });

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

  const handleFBUpdate = async (level: 1 | 2 | 3, checked: boolean) => {
    if (!lead || !user) return;
    const dateField = `fb${level}_date`;
    const fbField = `fb${level}`;
    const dateVal = checked ? new Date().toISOString() : null;

    try {
      const { error } = await supabase
        .from('leads')
        .update({
          [fbField]: checked,
          [dateField]: dateVal
        })
        .eq('id', lead.id);

      if (error) throw error;

      message.success(`تم تحديث المتابعة ${level}`);
      // Optimistically update the lead prop if possible, or trigger a refresh callback.
      // Since `lead` is passed as prop, we might just fetch Boqs & calls, but we also need the lead to update.
      // For now we assume the parent refreshes on close, but we can trigger onEdit if we want to bubble the update.
    } catch (err) {
      console.error('Error updating FB:', err);
      message.error('فشل تحديث المتابعة');
    }
  };

  const handleTeamChange = async (team: string) => {
    setAssignTeam(team);
    setAssignUser(undefined);
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name')
      .eq('crm_team', team);
    if (error) {
      message.error('فشل تحميل أعضاء الفريق');
      return;
    }
    setTeamUsers((data || []) as { id: string; name: string }[]);
  };

  const handleAssign = async () => {
    if (!lead || !assignTeam || !assignUser) return;
    setAssigning(true);
    try {
      const { error: updateError } = await supabase
        .from('leads')
        .update({ assigned_to_team: assignTeam, assigned_to_user: assignUser })
        .eq('id', lead.id);
      if (updateError) throw updateError;

      // Auto-log assignment to lead_activities
      const assignedName = teamUsers.find(u => u.id === assignUser)?.name ?? assignUser;
      await supabase.from('lead_activities').insert({
        lead_id: lead.id,
        user_id: user?.id,
        type: 'assignment',
        body: `تم التعيين لـ: ${assignedName}`,
      });

      console.log('[handleAssign] inserting notification for assignUser:', assignUser, 'lead:', lead.id);
      const { error: notifError } = await supabase
        .from('notifications')
        .insert({
          user_id: assignUser,
          title: 'تم تعيين ليد جديد ليك',
          type: 'lead_assigned',
          reference_id: lead.id,
          reference_type: 'lead',
        });
      if (notifError) {
        console.error('[handleAssign] notification insert FAILED:', notifError.code, notifError.message, notifError.details, notifError.hint);
        throw notifError;
      }

      message.success('تم تعيين الليد بنجاح');
      onAssigned?.();
    } catch (err) {
      console.error('Assign error:', err);
      message.error('فشل التعيين');
    } finally {
      setAssigning(false);
    }
  };

  const handleRandomAssignToTech = async () => {
    if (!lead || !user) return;
    setAssigning(true);
    try {
      const { data, error } = await supabase.rpc('assign_to_tech_team', {
        p_lead_id: lead.id,
        p_assigning_user_id: user.id,
      });
      if (error) throw error;
      const result = data as { success: boolean; assigned_to_name?: string; error?: string };
      if (!result.success) throw new Error(result.error || 'لا يوجد أعضاء في الفريق التقني');
      message.success(`تم التحويل للفريق التقني ✓ — ${result.assigned_to_name}`);
      onAssigned?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : (err as { message?: string })?.message || 'خطأ غير معروف';
      console.error('Random assign error:', err);
      message.error(`فشل التحويل للفريق التقني: ${msg}`, 8);
    } finally {
      setAssigning(false);
    }
  };

  const handleRandomAssignToCS = async () => {
    if (!lead || !user) return;
    setAssigning(true);
    try {
      const { data, error } = await supabase.rpc('assign_to_cs_team', {
        p_lead_id: lead.id,
        p_assigning_user_id: user.id,
      });
      if (error) throw error;
      const result = data as { success: boolean; assigned_to_name?: string; error?: string };
      if (!result.success) throw new Error(result.error || 'لا يوجد أعضاء في الفريق التجاري');
      message.success(`تم التحويل للفريق التجاري ✓ — ${result.assigned_to_name}`);
      onAssigned?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : (err as { message?: string })?.message || 'خطأ غير معروف';
      console.error('CS assign error:', err);
      message.error(`فشل التحويل للفريق التجاري: ${msg}`, 8);
    } finally {
      setAssigning(false);
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
                {lead.assigned_user?.name && (
                  <div className="flex items-center gap-2 mb-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
                    <Tag color="blue" style={{ margin: 0 }}>المعين</Tag>
                    <Text strong>{lead.assigned_user.name}</Text>
                  </div>
                )}
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

                <Divider>متابعات | Follow-ups</Divider>
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                    <Checkbox defaultChecked={lead.fb1} onChange={(e) => handleFBUpdate(1, e.target.checked)}>
                      FB1 — First Follow-up
                    </Checkbox>
                    {lead.fb1_date && <span className="text-xs text-gray-500">{formatDate(lead.fb1_date)}</span>}
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                    <Checkbox defaultChecked={lead.fb2} onChange={(e) => handleFBUpdate(2, e.target.checked)}>
                      FB2 — Second Follow-up
                    </Checkbox>
                    {lead.fb2_date && <span className="text-xs text-gray-500">{formatDate(lead.fb2_date)}</span>}
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                    <Checkbox defaultChecked={lead.fb3} onChange={(e) => handleFBUpdate(3, e.target.checked)}>
                      FB3 — Third Follow-up
                    </Checkbox>
                    {lead.fb3_date && <span className="text-xs text-gray-500">{formatDate(lead.fb3_date)}</span>}
                  </div>
                </div>

                <Divider>تعيين (Assign To)</Divider>

                {/* Current assignment badge */}
                {lead.assigned_to_team && (
                  <div className="mb-3 p-2 bg-gray-50 rounded-lg border border-gray-100 text-xs text-gray-500 flex items-center gap-2">
                    <span>الفريق الحالي:</span>
                    <Tag color={lead.assigned_to_team === 'tech' ? 'blue' : 'green'}>
                      {lead.assigned_to_team === 'tech' ? 'Tech Team' : 'CS Team'}
                    </Tag>
                    {lead.assigned_user?.name && <span className="font-medium text-gray-700">{lead.assigned_user.name}</span>}
                  </div>
                )}

                {/* CS Team or Admin → Send to Tech Team (random) */}
                {canSendToTech && (
                  <Button
                    block
                    loading={assigning}
                    onClick={handleRandomAssignToTech}
                    style={{ backgroundColor: '#1A6FD4', borderColor: '#1A6FD4', color: '#fff', marginBottom: 8 }}
                  >
                    إرسال للفريق التقني (عشوائي)
                  </Button>
                )}

                {/* Tech Team or Admin → Send back to CS Team (random) */}
                {canSendToCS && (
                  <Button
                    block
                    loading={assigning}
                    onClick={handleRandomAssignToCS}
                    style={{ backgroundColor: '#16a34a', borderColor: '#16a34a', color: '#fff', marginBottom: 8 }}
                  >
                    إرسال للفريق التجاري (عشوائي)
                  </Button>
                )}

                {/* Admin/Manager: full manual override */}
                {isFullAdmin && (
                  <details className="mt-1">
                    <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">تعيين يدوي (Admin)</summary>
                    <div className="flex flex-col gap-2 mt-2">
                      <Select
                        placeholder="اختر الفريق"
                        value={assignTeam}
                        onChange={handleTeamChange}
                        className="w-full"
                        options={[
                          { value: 'tech', label: 'Tech Team' },
                          { value: 'cs',   label: 'CS Team'   },
                        ]}
                      />
                      <Select
                        placeholder="اختر المستخدم"
                        value={assignUser}
                        onChange={(v: string) => setAssignUser(v)}
                        className="w-full"
                        disabled={!assignTeam || teamUsers.length === 0}
                        options={teamUsers.map((u) => ({ value: u.id, label: u.name }))}
                        notFoundContent="لا يوجد مستخدمون في هذا الفريق"
                      />
                      <Button
                        type="primary"
                        block
                        loading={assigning}
                        disabled={!assignTeam || !assignUser}
                        onClick={handleAssign}
                        style={{ backgroundColor: '#D72B2B', borderColor: '#D72B2B' }}
                      >
                        تعيين يدوي
                      </Button>
                    </div>
                  </details>
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
                            <Link href={`/boq/${boq.id}`}>
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
              <div className="space-y-3">
                {/* Sub-tabs */}
                <div className="flex gap-2 flex-wrap">
                  {(['all', 'call', 'note'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setActivityTab(tab)}
                      className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                        activityTab === tab
                          ? 'bg-[#D72B2B] text-white border-[#D72B2B]'
                          : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                      }`}
                    >
                      {tab === 'all' ? `الكل (${activities.length})` : tab === 'call' ? `مكالمات (${activities.filter(a => a.type === 'call').length})` : `ملاحظات (${activities.filter(a => a.type === 'note').length})`}
                    </button>
                  ))}
                </div>
                {/* Add Activity Button */}
                <Button
                  type="dashed"
                  block
                  icon={<PlusOutlined />}
                  onClick={() => setAddingActivity(!addingActivity)}
                >
                  {addingActivity ? 'إلغاء' : '+ إضافة نشاط'}
                </Button>
                {/* Add Activity Form */}
                {addingActivity && (
                  <div className="bg-gray-50 p-3 rounded-lg border border-dashed border-gray-300">
                    <Form form={activityForm} layout="vertical" size="small" onFinish={handleAddActivity}>
                      <Form.Item name="type" label="النوع" rules={[{ required: true }]} initialValue="note">
                        <Select options={[
                          { value: 'note', label: '📝 ملاحظة' },
                          { value: 'call', label: '📞 مكالمة' },
                        ]} />
                      </Form.Item>
                      <Form.Item name="body" label="التفاصيل" rules={[{ required: true }]}>
                        <Input.TextArea rows={2} placeholder="اكتب تفاصيل النشاط..." />
                      </Form.Item>
                      <Form.Item noStyle shouldUpdate={(prev, cur) => prev.type !== cur.type}>
                        {({ getFieldValue }) =>
                          getFieldValue('type') === 'call' ? (
                            <Form.Item name="duration_seconds" label="المدة (ثوانٍ)">
                              <InputNumber min={0} style={{ width: '100%' }} />
                            </Form.Item>
                          ) : null
                        }
                      </Form.Item>
                      <Button type="primary" htmlType="submit" block style={{ backgroundColor: '#D72B2B', borderColor: '#D72B2B' }}>
                        حفظ
                      </Button>
                    </Form>
                  </div>
                )}
                {/* Current Status Badge */}
                <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                  <span className="text-[10px] text-gray-400 font-medium">الحالة الحالية:</span>
                  <Tag color={LEAD_STATUSES.find(s => s.value === lead.status)?.color || '#8C8C8C'} style={{ margin: 0, fontSize: 11 }}>
                    {LEAD_STATUSES.find(s => s.value === lead.status)?.labelAr || lead.status}
                  </Tag>
                </div>

                {/* Activity Feed */}
                {activities
                  .filter(a => activityTab === 'all' || a.type === activityTab)
                  .length === 0 ? (
                  <Text type="secondary" className="block text-center py-4">لا يوجد نشاط حتى الآن</Text>
                ) : (
                  <div className="relative">
                    {/* Vertical line */}
                    <div className="absolute left-3 top-4 bottom-4 w-px bg-slate-200" />
                    <div className="space-y-3">
                    {activities
                      .filter(a => activityTab === 'all' || a.type === activityTab)
                      .map(a => {
                        const userName = profileMap[a.user_id] || 'مستخدم';
                        const initials = userName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
                        const typeConfig: Record<string, { icon: string; label: string; color: string }> = {
                          creation:      { icon: '🟢', label: 'إنشاء الليد',     color: 'bg-green-100 border-green-200' },
                          status_change: { icon: '🔄', label: 'تغيير الحالة',    color: 'bg-blue-50 border-blue-200' },
                          assignment:    { icon: '👤', label: 'تعيين',            color: 'bg-purple-50 border-purple-200' },
                          call:          { icon: '📞', label: 'مكالمة',           color: 'bg-amber-50 border-amber-200' },
                          note:          { icon: '📝', label: 'ملاحظة',           color: 'bg-gray-50 border-gray-200' },
                          note_added:    { icon: '📝', label: 'ملاحظة',           color: 'bg-gray-50 border-gray-200' },
                          edit:          { icon: '✏️',  label: 'تعديل',            color: 'bg-slate-50 border-slate-200' },
                        };
                        const cfg = typeConfig[a.type] || { icon: '•', label: a.type, color: 'bg-gray-50 border-gray-200' };
                        return (
                          <div key={a.id} className="flex gap-3 items-start pl-1">
                            <div className="w-7 h-7 rounded-full bg-[#0D2137] text-white text-[9px] font-bold flex items-center justify-center shrink-0 z-10 border-2 border-white">
                              {initials}
                            </div>
                            <div className={`rounded-lg p-2.5 flex-1 border ${cfg.color}`}>
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-[11px] font-semibold text-gray-700">
                                  {cfg.icon} {cfg.label}
                                </span>
                                <span className="text-[10px] text-gray-400">{formatDate(a.created_at)}</span>
                              </div>
                              <div className="text-[10px] text-gray-500 mb-0.5">{userName}</div>
                              {a.body && (
                                <p className="text-xs text-gray-800 mt-1 leading-relaxed">{a.body}</p>
                              )}
                              {a.duration_seconds && a.duration_seconds > 0 && (
                                <span className="text-[10px] text-gray-400">⏱ {Math.floor(a.duration_seconds / 60)} دقيقة {a.duration_seconds % 60} ثانية</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ),
          },
        ]}
      />
    </Drawer>
  );
}
