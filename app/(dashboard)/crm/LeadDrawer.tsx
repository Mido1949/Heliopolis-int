'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Drawer, Descriptions, Tag, Space, Button, Timeline, Typography, Divider, Tooltip, Tabs, Form, Select, Input, InputNumber, message, Row, Col, Checkbox, DatePicker,
} from 'antd';
import { PhoneOutlined, MailOutlined, EditOutlined, FileTextOutlined, DownloadOutlined, PlusOutlined, CheckOutlined } from '@ant-design/icons';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { LEAD_SOURCES, PIPELINE_STAGES, LOST_REASONS, ACTIVE_PIPELINE_STAGES } from '@/lib/constants';
import { formatDate } from '@/lib/utils';
import type { Lead, BOQ, BOQItem, CallLog, CallType, CallOutcome, PipelineStage } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { useOrg } from '@/context/OrgContext';
import WhatsAppTemplateButton from './WhatsAppTemplateButton';
import dayjs from 'dayjs';
import dynamic from 'next/dynamic';

const PDFDownloadButton = dynamic(() => import('@/components/boq/PDFDownloadButton'), {
  ssr: false,
  loading: () => <Button icon={<DownloadOutlined />} size="small" disabled>PDF</Button>
});

import { Y_BRANCH_TYPE, Y_BRANCH_DEFAULT_PRICE } from '@/components/boq/BOQEditor';

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

interface NextStep {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
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
  const { user, isStaff } = useAuth();
  const { currentOrgId } = useOrg();
  const supabase = createClient();
  const [assignTeam, setAssignTeam] = useState<string | undefined>();
  const [assignUser, setAssignUser] = useState<string | undefined>();
  const [teamUsers, setTeamUsers] = useState<{ id: string; name: string }[]>([]);
  const [assigning, setAssigning] = useState(false);
  const [claiming, setClaiming] = useState(false);

  // Activity tab state
  const [activityTab, setActivityTab] = useState<'all' | 'call' | 'note'>('all');
  const [activityForm] = Form.useForm();
  const [profileMap, setProfileMap] = useState<Record<string, string>>({});
  const [addingActivity, setAddingActivity] = useState(false);
  const lastFetchRef = useRef<{ leadId: string; time: number } | null>(null);

  // Next Step (US5) — the lead's open manual task, shown at the top.
  const [nextStep, setNextStep] = useState<NextStep | null>(null);
  const [nsEditing, setNsEditing] = useState(false);
  const [nsDesc, setNsDesc] = useState('');
  const [nsDue, setNsDue] = useState<dayjs.Dayjs | null>(null);
  const [nsSaving, setNsSaving] = useState(false);

  const fetchNextStep = useCallback(async () => {
    if (!lead) return;
    const { data } = await supabase
      .from('tasks')
      .select('id, title, description, due_date')
      .eq('lead_id', lead.id)
      .eq('auto_created', false)
      .eq('status', 'pending')
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    setNextStep((data as NextStep) || null);
  }, [lead, supabase]);

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

    setBoqs(((data || []).map((b) => ({
      ...b,
      boq_items: ((b.boq_items || []) as BOQItem[]).map((item) => ({
        ...item,
        total: item.quantity * item.unit_price,
      })),
    })) as unknown) as BOQ[]);
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
      org_id: lead.org_id ?? currentOrgId,
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
      fetchNextStep();
    }
  }, [open, lead, fetchActivities, fetchBoqs, fetchCalls, fetchProfileMap, fetchNextStep]);

  // Reset the inline editor whenever the drawer opens on a different lead.
  useEffect(() => {
    setNsEditing(false);
    setNsDesc('');
    setNsDue(null);
  }, [lead?.id, open]);

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

    const orgId = lead.org_id ?? currentOrgId;

    try {
      const { error } = await supabase
        .from('call_logs')
        .insert({
          lead_id: lead.id,
          created_by: user.id,
          org_id: orgId,
          ...values
        });

      if (error) throw error;

      message.success('تم تسجيل المكالمة بنجاح');
      form.resetFields();
      setIsLoggingCall(false);
      fetchCalls();

      // Non-blocking activity log — doesn't affect call success
      const durationSec = (values.duration_minutes ?? 0) * 60;
      supabase.from('lead_activities').insert({
        lead_id: lead.id,
        user_id: user.id,
        type: 'call',
        body: `${values.outcome} — ${durationSec}ث`,
        duration_seconds: durationSec || null,
        org_id: orgId,
      }).then(({ error: actErr }) => {
        if (actErr) console.error('lead_activities log failed:', actErr.message);
        else fetchActivities();
      });
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
        // Track who is doing the assignment so the assignee can later bounce it back.
        .update({ assigned_to_team: assignTeam, assigned_to_user: assignUser, assigned_by: user?.id ?? null })
        .eq('id', lead.id);
      if (updateError) throw updateError;

      const orgId = lead.org_id ?? currentOrgId;

      // Auto-log assignment to lead_activities
      const assignedName = teamUsers.find(u => u.id === assignUser)?.name ?? assignUser;
      await supabase.from('lead_activities').insert({
        lead_id: lead.id,
        user_id: user?.id,
        type: 'assignment',
        body: `تم التعيين لـ: ${assignedName}`,
        org_id: orgId,
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
          org_id: orgId,
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

  const handleReturnToSender = async () => {
    if (!lead || !lead.assigned_by) return;
    const sender = lead.assigned_by;
    setAssigning(true);
    try {
      // Bounce back to whoever assigned this lead to the current holder.
      // The current holder becomes the new assigned_by so it can bounce again.
      const { error: updateError } = await supabase
        .from('leads')
        .update({ assigned_to_user: sender, assigned_by: user?.id ?? null })
        .eq('id', lead.id);
      if (updateError) throw updateError;

      const orgId = lead.org_id ?? currentOrgId;
      await supabase.from('lead_activities').insert({
        lead_id: lead.id,
        user_id: user?.id,
        type: 'assignment',
        body: 'تم إرجاع الليد للمُرسِل',
        org_id: orgId,
      });
      await supabase.from('notifications').insert({
        user_id: sender,
        title: 'رجعلك ليد',
        body: 'تم إرجاع ليد ليك من العضو المعيّن',
        type: 'lead_assigned',
        reference_id: lead.id,
        reference_type: 'lead',
        org_id: orgId,
      });

      message.success('تم إرجاع الليد للمُرسِل');
      onAssigned?.();
    } catch (err) {
      console.error('Return-to-sender error:', err);
      message.error('فشل إرجاع الليد');
    } finally {
      setAssigning(false);
    }
  };

  if (!lead) return null;

  const sourceConfig = LEAD_SOURCES.find((s) => s.value === lead.source);

  // Manual-philosophy guard (T014): only the assigned owner or a
  // leader/manager (admin, Manager, CS/Tech Team Leader — via useAuth's
  // isStaff) may change stage/owner directly. Everyone else must go through
  // the explicit claim action, never a silent edit.
  const isOwner = !!user && lead.assigned_to_user === user.id;
  const canActDirectly = isStaff || isOwner;

  const claimLead = async () => {
    if (!user || claiming) return;
    setClaiming(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}/claim`, { method: 'POST' });
      if (res.status === 409) {
        message.warning('تم استلام هذا العميل بالفعل');
        onAssigned?.();
        return;
      }
      if (!res.ok) {
        message.error('فشل الاستلام');
        return;
      }
      message.success('تم الاستلام');
      onAssigned?.();
    } catch {
      message.error('فشل الاستلام');
    } finally {
      setClaiming(false);
    }
  };

  // Next Step (US5): only the owner or a leader/manager may set/complete it.
  const isActiveStage = (ACTIVE_PIPELINE_STAGES as readonly string[]).includes(lead.pipeline_stage || 'NEW');

  const openNsEditor = () => {
    setNsDesc(nextStep?.description || '');
    setNsDue(nextStep?.due_date ? dayjs(nextStep.due_date) : null);
    setNsEditing(true);
  };

  const saveNextStep = async () => {
    if (!nsDesc.trim()) { message.warning('اكتب وصف الخطوة'); return; }
    setNsSaving(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}/next-step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: nsDesc.trim(),
          due_date: nsDue ? nsDue.toISOString() : null,
        }),
      });
      if (res.status === 403) { message.error('غير مسموح — المالك أو القائد فقط'); return; }
      if (!res.ok) { message.error('فشل حفظ الخطوة'); return; }
      message.success('تم حفظ الخطوة التالية');
      setNsEditing(false);
      await fetchNextStep();
      fetchActivities();
    } catch {
      message.error('فشل حفظ الخطوة');
    } finally {
      setNsSaving(false);
    }
  };

  const completeNextStep = async () => {
    if (!nextStep) return;
    setNsSaving(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}/next-step`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: nextStep.id }),
      });
      if (res.status === 403) { message.error('غير مسموح — المالك أو القائد فقط'); return; }
      if (!res.ok) { message.error('فشل إنجاز الخطوة'); return; }
      message.success('تم إنجاز الخطوة');
      await fetchNextStep();
      fetchActivities();
    } catch {
      message.error('فشل إنجاز الخطوة');
    } finally {
      setNsSaving(false);
    }
  };

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
            <WhatsAppTemplateButton lead={lead} variant="button" />
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

      {/* Next Step (US5) — prominent at the top of the drawer */}
      <div className="mb-6 px-1">
        {nsEditing ? (
          <div className="p-3 rounded-lg border border-dashed border-[#D72B2B] bg-red-50/40">
            <Text strong className="block mb-2">الخطوة التالية (Next Step)</Text>
            <Input.TextArea
              rows={2}
              value={nsDesc}
              onChange={(e) => setNsDesc(e.target.value)}
              placeholder="مثال: اتصال لتأكيد زيارة الموقع"
              className="mb-2"
            />
            <DatePicker
              showTime
              className="w-full mb-2"
              value={nsDue}
              onChange={(d) => setNsDue(d)}
              placeholder="تاريخ ووقت الاستحقاق"
              format="YYYY-MM-DD HH:mm"
            />
            <div className="flex gap-2">
              <Button
                type="primary"
                loading={nsSaving}
                onClick={saveNextStep}
                style={{ backgroundColor: '#D72B2B', borderColor: '#D72B2B' }}
              >
                حفظ
              </Button>
              <Button onClick={() => setNsEditing(false)}>إلغاء</Button>
            </div>
          </div>
        ) : nextStep ? (
          <div className="p-3 rounded-lg border border-blue-200 bg-blue-50">
            <div className="flex items-center justify-between mb-1">
              <Text strong style={{ fontSize: 12, color: '#1A6FD4' }}>⭐ الخطوة التالية</Text>
              {nextStep.due_date && (
                <Tag
                  color={new Date(nextStep.due_date) < new Date() ? 'red' : 'blue'}
                  style={{ margin: 0, fontSize: 10 }}
                >
                  {formatDate(nextStep.due_date)}
                </Tag>
              )}
            </div>
            <Text className="block mb-2">{nextStep.description || nextStep.title}</Text>
            {canActDirectly && (
              <div className="flex gap-2">
                <Button
                  size="small"
                  type="primary"
                  icon={<CheckOutlined />}
                  loading={nsSaving}
                  onClick={completeNextStep}
                  style={{ backgroundColor: '#16A34A', borderColor: '#16A34A' }}
                >
                  تم
                </Button>
                <Button size="small" icon={<EditOutlined />} onClick={openNsEditor}>تعديل</Button>
              </div>
            )}
          </div>
        ) : (
          canActDirectly && isActiveStage && (
            <button
              onClick={openNsEditor}
              className="w-full text-right p-3 rounded-lg border border-dashed border-gray-300 text-gray-500 hover:border-[#D72B2B] hover:text-[#D72B2B] transition-colors text-sm flex items-center gap-2"
            >
              <PlusOutlined /> أضِف خطوة تالية (Next Step)
            </button>
          )
        )}
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
                  <Descriptions.Item label="مرحلة القمع (Pipeline Stage)">
                    {canActDirectly ? (
                      <>
                        <Select
                          size="small"
                          value={lead.pipeline_stage || 'NEW'}
                          style={{ width: '100%' }}
                          onChange={async (v) => {
                            const now = new Date().toISOString();
                            const newStage = v as PipelineStage;
                            const stage_timestamps = { ...((lead.stage_timestamps as Record<string, string>) || {}), [newStage]: now };
                            const { error } = await supabase.from('leads')
                              .update({ pipeline_stage: newStage, stage_timestamps, updated_at: now })
                              .eq('id', lead.id);
                            if (error) return message.error('فشل تحديث المرحلة');
                            supabase.from('lead_activities').insert({
                              lead_id: lead.id, user_id: user?.id, type: 'status_change',
                              body: `${lead.pipeline_stage || 'NEW'} → ${newStage}`,
                              org_id: lead.org_id ?? currentOrgId,
                            });
                            message.success('تم تحديث المرحلة');
                            onAssigned?.();
                          }}
                          options={PIPELINE_STAGES.map((s) => ({
                            value: s.value,
                            label: `${s.emoji} ${s.labelAr}`,
                          }))}
                        />
                        {lead.pipeline_stage === 'LOST' && (
                          <div className="mt-2">
                            <Select
                              size="small"
                              style={{ width: '100%' }}
                              defaultValue={lead.lost_reason ?? undefined}
                              placeholder="سبب الخسارة (Lost reason)"
                              onChange={async (v) => {
                                await supabase.from('leads').update({ lost_reason: v }).eq('id', lead.id);
                                onAssigned?.();
                              }}
                              options={LOST_REASONS.map((r) => ({ value: r.value, label: r.labelAr }))}
                            />
                          </div>
                        )}
                      </>
                    ) : (
                      <Tooltip title={lead.assigned_to_user ? 'فقط المالك أو قائد الفريق يمكنه تغيير المرحلة' : 'استلم الليد أولاً لتتمكن من تغيير مرحلته'}>
                        <Tag color={PIPELINE_STAGES.find((s) => s.value === (lead.pipeline_stage || 'NEW'))?.color}>
                          {PIPELINE_STAGES.find((s) => s.value === (lead.pipeline_stage || 'NEW'))?.labelAr || lead.pipeline_stage}
                        </Tag>
                      </Tooltip>
                    )}
                  </Descriptions.Item>
                  {lead.deal_value != null && (
                    <Descriptions.Item label="قيمة الصفقة (Deal Value)">
                      <Text strong style={{ color: '#52C41A' }}>
                        ${lead.deal_value.toLocaleString()}
                      </Text>
                    </Descriptions.Item>
                  )}
                  {lead.last_contact_date && (
                    <Descriptions.Item label="آخر تواصل (Last Contact)">
                      {formatDate(lead.last_contact_date)}
                    </Descriptions.Item>
                  )}
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

                {lead.stage_timestamps && Object.keys(lead.stage_timestamps).length > 0 && (
                  <>
                    <Divider>سجل المراحل (Stage History)</Divider>
                    <div className="bg-gray-50 rounded-lg p-3 space-y-1 mb-4 max-h-48 overflow-y-auto">
                      {Object.entries(lead.stage_timestamps)
                        .sort(([, a], [, b]) => new Date(b as string).getTime() - new Date(a as string).getTime())
                        .map(([stage, ts]) => (
                          <div key={stage} className="flex justify-between text-xs">
                            <span>{PIPELINE_STAGES.find(s => s.value === stage)?.labelAr || stage}</span>
                            <span className="text-gray-500">{formatDate(ts as string)}</span>
                          </div>
                        ))}
                    </div>
                  </>
                )}
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

                {/* Claim button for unassigned leads */}
                {!lead.assigned_to_user && (
                  <Button
                    block
                    type="primary"
                    loading={claiming}
                    style={{ backgroundColor: '#D72B2B', borderColor: '#D72B2B', marginBottom: 8 }}
                    onClick={claimLead}
                  >
                    استلام (Claim)
                  </Button>
                )}

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

                {/* Manual assign/reassign — owner or leader/manager only (T014).
                    A non-owner, non-leader must claim first rather than
                    silently reassigning/re-teaming a lead they don't hold. */}
                {canActDirectly ? (
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
                      تعيين
                    </Button>
                    {lead?.assigned_by && (
                      <Button
                        block
                        loading={assigning}
                        onClick={handleReturnToSender}
                        style={{ marginTop: 8 }}
                      >
                        ↩️ رجّع للمُرسِل
                      </Button>
                    )}
                  </div>
                ) : lead.assigned_to_user ? (
                  <Text type="secondary" className="text-xs">
                    هذا الليد مُستلم من عضو آخر — فقط المالك أو قائد الفريق يمكنه إعادة تعيينه.
                  </Text>
                ) : null}
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
                      <Form.Item name="notes" label="وصف المكالمة" rules={[{ required: true, message: 'اكتب وصف للمكالمة' }]}>
                        <Input.TextArea rows={3} placeholder="ملخص ما تم مناقشته في المكالمة..." />
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
                              items={(boq.boq_items || []).filter(
                                (i) => i.unit_type !== Y_BRANCH_TYPE
                              )}
                              subtotal={boq.subtotal}
                              yBranchQty={Number(boq.boq_items?.find(
                                (i) => i.unit_type === Y_BRANCH_TYPE
                              )?.quantity) || 0}
                              yBranchUnitPrice={Number(boq.boq_items?.find(
                                (i) => i.unit_type === Y_BRANCH_TYPE
                              )?.unit_price) || Y_BRANCH_DEFAULT_PRICE}
                              yBranchTotal={
                                (Number(boq.boq_items?.find(
                                  (i) => i.unit_type === Y_BRANCH_TYPE
                                )?.quantity) || 0) *
                                (Number(boq.boq_items?.find(
                                  (i) => i.unit_type === Y_BRANCH_TYPE
                                )?.unit_price) || Y_BRANCH_DEFAULT_PRICE)
                              }
                              grandTotal={boq.grand_total}
                              discountPercent={boq.discount_percent}
                              discountAmount={
                                ((Number(boq.subtotal) || 0) +
                                  (Number(boq.boq_items?.find(
                                    (i) => i.unit_type === Y_BRANCH_TYPE
                                  )?.quantity) || 0) *
                                    (Number(boq.boq_items?.find(
                                      (i) => i.unit_type === Y_BRANCH_TYPE
                                    )?.unit_price) || Y_BRANCH_DEFAULT_PRICE)) *
                                ((Number(boq.discount_percent) || 0) / 100)
                              }
                              discountedTotal={Number(boq.grand_total) || 0}
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
