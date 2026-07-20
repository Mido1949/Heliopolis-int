'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Card, Tag, Typography, Button, message, Modal, Input } from 'antd';
import { PIPELINE_STAGES, PIPELINE_ZONES, slaColor, stageAgeDays } from '@/lib/constants';
import type { Lead, PipelineStage } from '@/types';
import { createClient } from '@/lib/supabase/client';
import { withTimeout } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { useOrg } from '@/context/OrgContext';
import WhatsAppTemplateButton from './WhatsAppTemplateButton';

const { Text, Title } = Typography;

const STAGE_PAGE_SIZE = 50;

interface KanbanViewProps {
  search?: string;
  // crm-ksa scopes its board to Saudi regions and, for non-admin/manager reps,
  // to their own leads only — mirrors that page's own fetchLeads filters.
  regionIn?: string[];
  restrictToUserId?: string;
  onLeadClick: (lead: Lead) => void;
}

// SLA color → readable text color for the stage-age indicator on the card.
const SLA_TEXT_COLOR: Record<'green' | 'amber' | 'red', string> = {
  green: '#52C41A',
  amber: '#FA8C16',
  red: '#FF4D4F',
};

export default function KanbanView({ search, regionIn, restrictToUserId, onLeadClick }: KanbanViewProps) {
  const { user, isStaff } = useAuth();
  const { currentOrgId } = useOrg();
  const supabase = createClient();
  const [pendingWon, setPendingWon] = useState<{ leadId: string; fromStage: string } | null>(null);
  const [dealValue, setDealValue] = useState<number | null>(null);
  const [dealName, setDealName] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  // Each stage column loads (and paginates) its own leads instead of the
  // board grouping one globally-paginated list client-side — otherwise a
  // small page size means most stages render empty even when they hold
  // hundreds of leads (the query's global order puts them all in one place).
  const [stageLeads, setStageLeads] = useState<Record<string, Lead[]>>({});
  const [stageCounts, setStageCounts] = useState<Record<string, number>>({});
  const [stagePages, setStagePages] = useState<Record<string, number>>({});
  const [loadingStages, setLoadingStages] = useState<Record<string, boolean>>({});

  // Manual-philosophy guard (T014): a non-owner, non-leader/manager may only
  // claim a lead — never silently change its stage/owner via drag or the
  // drawer. Owner + leaders (admin/Manager/CS|Tech Team Leader) act normally.
  const canActOn = (lead: Lead) => isStaff || lead.assigned_to_user === user?.id;

  const leads = useMemo(() => Object.values(stageLeads).flat(), [stageLeads]);

  const buildStageQuery = useCallback((stage: string) => {
    let q = supabase
      .from('leads')
      .select('*, assigned_user:profiles!leads_assigned_to_user_fkey(id, name)', { count: 'exact' })
      .eq('pipeline_stage', stage);
    if (search) {
      const safe = search.replace(/[,()\*]/g, ' ').trim();
      if (safe) q = q.or(`name.ilike.%${safe}%,company.ilike.%${safe}%,phone.ilike.%${safe}%`);
    }
    if (regionIn && regionIn.length > 0) q = q.in('region', regionIn);
    if (restrictToUserId) q = q.eq('assigned_to_user', restrictToUserId);
    return q.order('updated_at', { ascending: false });
  }, [supabase, search, regionIn, restrictToUserId]);

  const loadStagePage = useCallback(async (stage: string, page: number) => {
    setLoadingStages((p) => ({ ...p, [stage]: true }));
    try {
      const from = (page - 1) * STAGE_PAGE_SIZE;
      const to = page * STAGE_PAGE_SIZE - 1;
      const { data, count } = await withTimeout(
        buildStageQuery(stage).range(from, to),
        15000,
        'Stage leads'
      );
      setStageLeads((prev) => ({
        ...prev,
        [stage]: page === 1 ? ((data || []) as Lead[]) : [...(prev[stage] || []), ...((data || []) as Lead[])],
      }));
      setStageCounts((prev) => ({ ...prev, [stage]: count ?? 0 }));
      setStagePages((prev) => ({ ...prev, [stage]: page }));
    } catch {
      message.error('فشل تحميل بيانات المرحلة');
    } finally {
      setLoadingStages((p) => ({ ...p, [stage]: false }));
    }
  }, [buildStageQuery]);

  const refreshStages = useCallback((stages: string[]) => {
    Array.from(new Set(stages)).forEach((s) => loadStagePage(s, 1));
  }, [loadStagePage]);

  // Fire all ten stage loads independently (not Promise.all) so each column
  // populates as its own request finishes instead of the whole board waiting
  // on the slowest one.
  useEffect(() => {
    PIPELINE_STAGES.forEach((s) => loadStagePage(s.value, 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, currentOrgId, regionIn, restrictToUserId]);

  const claim = async (lead: Lead) => {
    if (claimingId) return;
    setClaimingId(lead.id);
    try {
      const res = await fetch(`/api/leads/${lead.id}/claim`, { method: 'POST' });
      if (res.status === 409) {
        message.warning('تم استلام هذا العميل بالفعل');
        refreshStages([lead.pipeline_stage || 'NEW']);
        return;
      }
      if (!res.ok) {
        message.error('فشل الاستلام');
        return;
      }
      message.success('تم الاستلام');
      refreshStages([lead.pipeline_stage || 'NEW']);
    } catch {
      message.error('فشل الاستلام');
    } finally {
      setClaimingId(null);
    }
  };

  const onDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const newStage = destination.droppableId as PipelineStage;
    const leadId = draggableId;
    const lead = leads.find(l => l.id === leadId);

    if (lead && !canActOn(lead)) {
      message.warning(
        lead.assigned_to_user ? 'هذا العميل مُستلم من شخص آخر' : 'يجب استلام العميل أولاً قبل نقل مرحلته'
      );
      return;
    }

    if (newStage === 'WON') {
      setDealName(lead?.name || '');
      setPendingWon({ leadId, fromStage: source.droppableId });
      setDealValue(null);
      return;
    }

    const now = new Date().toISOString();
    const moved = lead;
    const stage_timestamps = { ...(moved?.stage_timestamps || {}), [newStage]: now };

    const { error } = await supabase.from('leads')
      .update({ pipeline_stage: newStage, stage_timestamps, updated_at: now })
      .eq('id', leadId);
    if (error) { message.error('فشل تحديث المرحلة'); return; }

    supabase.from('lead_activities').insert({
      lead_id: leadId,
      user_id: user?.id,
      type: 'status_change',
      body: `${moved?.pipeline_stage || 'NEW'} → ${newStage}`,
      org_id: moved?.org_id ?? currentOrgId,
    });
    refreshStages([source.droppableId, newStage]);
  };

  const confirmWon = async () => {
    if (!pendingWon || dealValue === null || dealValue <= 0) {
      message.error('يرجى إدخال قيمة الصفقة');
      return;
    }
    setSubmitting(true);
    const now = new Date().toISOString();
    const moved = leads.find((l) => l.id === pendingWon.leadId);
    const stage_timestamps = { ...(moved?.stage_timestamps || {}), WON: now };

    const { error } = await supabase.from('leads')
      .update({ pipeline_stage: 'WON', stage_timestamps, updated_at: now, deal_value: dealValue })
      .eq('id', pendingWon.leadId);
    if (error) {
      message.error('فشل تحديث المرحلة');
      setSubmitting(false);
      return;
    }

    supabase.from('lead_activities').insert({
      lead_id: pendingWon.leadId,
      user_id: user?.id,
      type: 'status_change',
      body: `${moved?.pipeline_stage || 'NEW'} → WON`,
      org_id: moved?.org_id ?? currentOrgId,
    });

    const fromStage = pendingWon.fromStage;
    setSubmitting(false);
    setPendingWon(null);
    refreshStages([fromStage, 'WON']);
  };

  // Group columns by zone
  const zones = PIPELINE_ZONES.map((z) => ({
    ...z,
    stages: PIPELINE_STAGES.filter((s) => s.zone === z.value),
  }));

  const columns = PIPELINE_STAGES.map((s) => {
    const items = stageLeads[s.value] || [];
    const total = stageCounts[s.value] ?? items.length;
    return {
      key: s.value,
      title: `${s.emoji} ${s.labelAr}`,
      color: s.color,
      zone: s.zone,
      items,
      total,
      hasMore: items.length < total,
      loading: !!loadingStages[s.value],
    };
  });

  return (
    <>
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="space-y-6 overflow-x-auto pb-4">
          {zones.map((zone) => (
            <div key={zone.value}>
              <div className="flex items-center gap-2 mb-2 px-1">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: zone.color }} />
                <Text strong style={{ fontSize: '13px', color: zone.color }}>{zone.labelAr}</Text>
              </div>
              <div className="flex gap-4">
                {zone.stages.map((stage) => {
                  const col = columns.find((c) => c.key === stage.value)!;
                  return (
                    <div key={stage.value} className="flex-shrink-0 w-72">
                      <div className="bg-gray-100 rounded-xl p-3 h-full flex flex-col">
                        <div className="flex justify-between items-center mb-4 px-1">
                          <Title level={5} style={{ margin: 0, fontSize: '13px' }}>{col.title}</Title>
                          <Tag color={stage.color} style={{ fontSize: '10px' }}>
                            {col.loading && col.items.length === 0 ? '…' : col.total}
                          </Tag>
                        </div>

                        <Droppable droppableId={stage.value}>
                          {(provided, snapshot) => (
                            <div
                              {...provided.droppableProps}
                              ref={provided.innerRef}
                              className={`flex-grow space-y-3 p-1 transition-colors rounded-lg ${snapshot.isDraggingOver ? 'bg-gray-200' : ''}`}
                              style={{ minHeight: 100 }}
                            >
                              {col.loading && col.items.length === 0 && (
                                <div className="text-center py-6 text-gray-400 text-xs">جاري التحميل...</div>
                              )}
                              {col.items.map((lead, index) => (
                                <Draggable key={lead.id} draggableId={lead.id} index={index}>
                                  {(prov, snap) => (
                                    <div
                                      ref={prov.innerRef}
                                      {...prov.draggableProps}
                                      {...prov.dragHandleProps}
                                      onClick={() => onLeadClick(lead)}
                                      style={{ ...prov.draggableProps.style, userSelect: 'none' }}
                                    >
                                      <Card
                                        size="small"
                                        className={`shadow-sm cursor-pointer hover:border-accent transition-all ${snap.isDragging ? 'shadow-lg ring-1 ring-accent' : ''}`}
                                        styles={{ body: { padding: '12px' } }}
                                      >
                                        <Title level={5} style={{ fontSize: '14px', marginBottom: '4px' }}>{lead.name}</Title>
                                        {lead.company && <Text type="secondary" style={{ fontSize: '12px', display: 'block' }}>{lead.company}</Text>}
                                        {lead.deal_value != null && stage.value === 'WON' && (
                                          <Text strong style={{ fontSize: '12px', color: '#52C41A' }}>
                                            ${lead.deal_value.toLocaleString()}
                                          </Text>
                                        )}
                                        {/* stage age with SLA color (US4) */}
                                        {lead.stage_timestamps?.[lead.pipeline_stage || 'NEW'] && (() => {
                                          const sla = slaColor(lead);
                                          return (
                                            <div
                                              className="text-[10px] mt-1 flex items-center gap-1"
                                              style={{ color: sla ? SLA_TEXT_COLOR[sla] : '#9CA3AF' }}
                                            >
                                              {sla && (
                                                <span
                                                  className="inline-block w-2 h-2 rounded-full shrink-0"
                                                  style={{ backgroundColor: SLA_TEXT_COLOR[sla] }}
                                                />
                                              )}
                                              <span>{stageAgeDays(lead)} يوم في هذه المرحلة</span>
                                            </div>
                                          );
                                        })()}
                                        <div className="mt-2 flex items-center justify-between gap-1">
                                          <div className="flex items-center gap-1 min-w-0">
                                            {/* owner or claim */}
                                            {lead.assigned_user?.name ? (
                                              <Tag style={{ fontSize: '10px', margin: 0 }}>{lead.assigned_user.name}</Tag>
                                            ) : (
                                              <Button
                                                size="small"
                                                loading={claimingId === lead.id}
                                                style={{ fontSize: '10px', height: '22px', padding: '0 6px' }}
                                                onClick={(e) => { e.stopPropagation(); claim(lead); }}
                                              >
                                                استلام
                                              </Button>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-1 shrink-0">
                                            <Text type="secondary" style={{ fontSize: '10px' }}>{lead.region || '—'}</Text>
                                            {lead.phone && (
                                              <WhatsAppTemplateButton lead={lead} variant="icon" />
                                            )}
                                          </div>
                                        </div>
                                      </Card>
                                    </div>
                                  )}
                                </Draggable>
                              ))}
                              {provided.placeholder}
                            </div>
                          )}
                        </Droppable>

                        {col.hasMore && (
                          <Button
                            size="small"
                            type="dashed"
                            block
                            loading={col.loading}
                            onClick={() => loadStagePage(stage.value, (stagePages[stage.value] || 1) + 1)}
                            style={{ marginTop: 8 }}
                          >
                            تحميل المزيد ({col.total - col.items.length}) — Load more
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </DragDropContext>

      <Modal
        title="تم الفوز — أدخل قيمة الصفقة (Won — enter deal value)"
        open={!!pendingWon}
        onCancel={() => setPendingWon(null)}
        onOk={confirmWon}
        okText="تأكيد (Confirm)"
        cancelText="إلغاء"
        confirmLoading={submitting}
        okButtonProps={{ disabled: dealValue === null || dealValue <= 0 }}
      >
        <p className="mb-3">العميل: <strong>{dealName}</strong></p>
        <p className="text-sm text-gray-500 mb-3">قيمة الصفقة مطلوبة عند نقل العميل إلى مرحلة &ldquo;تم الفوز&rdquo;.</p>
        <Input
          type="number"
          min={1}
          placeholder="قيمة الصفقة (USD)"
          value={dealValue ?? ''}
          onChange={(e) => setDealValue(e.target.value ? Number(e.target.value) : null)}
          prefix="$"
        />
      </Modal>
    </>
  );
}
