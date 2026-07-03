'use client';

import { useEffect, useState, useCallback } from 'react';
import { Tag, Button, Select, Empty, Spin, Tooltip, message } from 'antd';
import { EyeOutlined, CheckOutlined } from '@ant-design/icons';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useOrg } from '@/context/OrgContext';
import { PIPELINE_STAGES, slaColor, stageAgeDays } from '@/lib/constants';
import type { Lead, PipelineStage } from '@/types';
import WhatsAppTemplateButton from '../crm/WhatsAppTemplateButton';

interface NextStep {
  id: string;
  description: string | null;
  title: string;
  due_date: string | null;
}

interface MyDayItem {
  lead: Lead;
  sla: 'green' | 'amber' | 'red' | null;
  nextStep: NextStep | null;
  overdueMs: number;   // >0 when a next step is past due
  group: number;       // 0 = overdue next step, 1 = SLA-red
  sortVal: number;
}

interface MyDayListProps {
  /** Host decides how to open a lead (its own drawer). */
  onOpen: (lead: Lead) => void;
  /** Bump to force a refetch after host-side mutations (e.g. drawer edits). */
  reloadToken?: number;
}

const TERMINAL = ['WON', 'LOST', 'POSTPONED'];

export default function MyDayList({ onOpen, reloadToken = 0 }: MyDayListProps) {
  const { user } = useAuth();
  const { currentOrgId } = useOrg();
  const supabase = createClient();
  const [items, setItems] = useState<MyDayItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchMyDay = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [{ data: leadsData }, { data: tasksData }] = await Promise.all([
        supabase
          .from('leads')
          .select('*, assigned_user:profiles!leads_assigned_to_user_fkey(id, name)')
          .eq('assigned_to_user', user.id)
          .not('pipeline_stage', 'in', `(${TERMINAL.join(',')})`)
          .limit(500),
        supabase
          .from('tasks')
          .select('id, lead_id, description, title, due_date')
          .eq('assigned_to', user.id)
          .eq('auto_created', false)
          .eq('status', 'pending')
          .not('lead_id', 'is', null)
          .not('due_date', 'is', null),
      ]);

      // Nearest-due open next step per lead.
      const stepByLead: Record<string, NextStep> = {};
      (tasksData || []).forEach((t) => {
        const row = t as NextStep & { lead_id: string };
        const existing = stepByLead[row.lead_id];
        if (!existing || (row.due_date && existing.due_date && row.due_date < existing.due_date)) {
          stepByLead[row.lead_id] = { id: row.id, description: row.description, title: row.title, due_date: row.due_date };
        }
      });

      const now = Date.now();
      const built: MyDayItem[] = [];
      for (const lead of (leadsData || []) as Lead[]) {
        const sla = slaColor(lead);
        const nextStep = stepByLead[lead.id] || null;
        const dueMs = nextStep?.due_date ? new Date(nextStep.due_date).getTime() : null;
        const overdueMs = dueMs !== null ? now - dueMs : -Infinity;
        const hasDueStep = overdueMs >= 0;

        // Include SLA-red leads OR leads with a due/overdue next step.
        if (sla !== 'red' && !hasDueStep) continue;

        const group = hasDueStep ? 0 : 1;
        const sortVal = hasDueStep ? overdueMs : stageAgeDays(lead);
        built.push({ lead, sla, nextStep, overdueMs, group, sortVal });
      }

      built.sort((a, b) => (a.group - b.group) || (b.sortVal - a.sortVal));
      setItems(built);
    } catch (err) {
      console.error('MyDay fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [user, supabase]);

  useEffect(() => { fetchMyDay(); }, [fetchMyDay, reloadToken]);

  // Inline advance-stage — the current user is the owner, so this is allowed
  // (mirrors the drawer's manual stage change + activity log). No auto-move.
  const advanceStage = async (lead: Lead, newStage: PipelineStage) => {
    setBusyId(lead.id);
    try {
      const nowIso = new Date().toISOString();
      const stage_timestamps = { ...((lead.stage_timestamps as Record<string, string>) || {}), [newStage]: nowIso };
      const { error } = await supabase.from('leads')
        .update({ pipeline_stage: newStage, stage_timestamps, updated_at: nowIso })
        .eq('id', lead.id);
      if (error) { message.error('فشل تحديث المرحلة'); return; }
      supabase.from('lead_activities').insert({
        lead_id: lead.id, user_id: user?.id, type: 'status_change',
        body: `${lead.pipeline_stage || 'NEW'} → ${newStage}`,
        org_id: lead.org_id ?? currentOrgId,
      });
      message.success('تم تحديث المرحلة');
      fetchMyDay();
    } finally {
      setBusyId(null);
    }
  };

  const completeStep = async (lead: Lead, step: NextStep) => {
    setBusyId(lead.id);
    try {
      const res = await fetch(`/api/leads/${lead.id}/next-step`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: step.id }),
      });
      if (!res.ok) { message.error('فشل إنجاز الخطوة'); return; }
      message.success('تم إنجاز الخطوة');
      fetchMyDay();
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <div className="p-12 text-center"><Spin /></div>;

  if (items.length === 0) {
    return (
      <div className="p-10 bg-white rounded-xl border border-slate-100 shadow-sm">
        <Empty description={<span className="text-slate-500">لا يوجد ما يحتاج إجراء اليوم — كل حاجة تمام ✅</span>} />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map(({ lead, sla, nextStep, overdueMs }) => {
        const stageCfg = PIPELINE_STAGES.find((s) => s.value === (lead.pipeline_stage || 'NEW'));
        const isOverdueStep = overdueMs >= 0 && nextStep;
        return (
          <div
            key={lead.id}
            className="bg-white rounded-xl border border-slate-100 shadow-sm p-3 flex flex-wrap items-center gap-3"
          >
            {/* urgency dot */}
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: isOverdueStep ? '#FF4D4F' : sla === 'red' ? '#FF4D4F' : '#FA8C16' }}
            />
            {/* name + stage */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[#0D2137] truncate">{lead.name}</span>
                {stageCfg && <Tag color={stageCfg.color} style={{ margin: 0, fontSize: 10 }}>{stageCfg.labelAr}</Tag>}
              </div>
              {nextStep ? (
                <div className="text-xs mt-0.5">
                  <span className={isOverdueStep ? 'text-red-500 font-medium' : 'text-slate-500'}>
                    ⭐ {nextStep.description || nextStep.title}
                    {nextStep.due_date && ` — ${isOverdueStep ? 'متأخرة' : 'اليوم'}`}
                  </span>
                </div>
              ) : (
                <div className="text-xs mt-0.5 text-red-500">🔴 متأخر في هذه المرحلة ({stageAgeDays(lead)} يوم)</div>
              )}
            </div>
            {/* actions */}
            <div className="flex items-center gap-1 shrink-0">
              {nextStep && (
                <Tooltip title="إنجاز الخطوة">
                  <Button
                    size="small"
                    icon={<CheckOutlined />}
                    loading={busyId === lead.id}
                    onClick={() => completeStep(lead, nextStep)}
                    style={{ color: '#16A34A', borderColor: '#16A34A' }}
                  />
                </Tooltip>
              )}
              <Select
                size="small"
                value={lead.pipeline_stage || 'NEW'}
                style={{ width: 130 }}
                disabled={busyId === lead.id}
                onChange={(v) => advanceStage(lead, v as PipelineStage)}
                options={PIPELINE_STAGES.map((s) => ({ value: s.value, label: `${s.emoji} ${s.labelAr}` }))}
              />
              {lead.phone && <WhatsAppTemplateButton lead={lead} variant="icon" />}
              <Tooltip title="فتح">
                <Button size="small" icon={<EyeOutlined />} onClick={() => onOpen(lead)} />
              </Tooltip>
            </div>
          </div>
        );
      })}
    </div>
  );
}
