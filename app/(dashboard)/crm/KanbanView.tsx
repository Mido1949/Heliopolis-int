'use client';

import { useState } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Card, Tag, Typography, Button, message, Modal, Input } from 'antd';
import { WhatsAppOutlined } from '@ant-design/icons';
import { PIPELINE_STAGES, PIPELINE_ZONES } from '@/lib/constants';
import type { Lead, PipelineStage } from '@/types';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useOrg } from '@/context/OrgContext';
import { getWhatsAppUrl } from '@/lib/utils';

const { Text, Title } = Typography;

interface KanbanViewProps {
  leads: Lead[];
  onLeadClick: (lead: Lead) => void;
  onRefresh: () => void;
}

function stageAgeDays(lead: Lead) {
  const ts = lead.stage_timestamps?.[lead.pipeline_stage || 'NEW'];
  if (!ts) return 0;
  return Math.floor((Date.now() - new Date(ts).getTime()) / 86_400_000);
}

export default function KanbanView({ leads, onLeadClick, onRefresh }: KanbanViewProps) {
  const { user, isStaff } = useAuth();
  const { currentOrgId } = useOrg();
  const supabase = createClient();
  const [pendingWon, setPendingWon] = useState<{ leadId: string; fromStage: string } | null>(null);
  const [dealValue, setDealValue] = useState<number | null>(null);
  const [dealName, setDealName] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  // Manual-philosophy guard (T014): a non-owner, non-leader/manager may only
  // claim a lead — never silently change its stage/owner via drag or the
  // drawer. Owner + leaders (admin/Manager/CS|Tech Team Leader) act normally.
  const canActOn = (lead: Lead) => isStaff || lead.assigned_to_user === user?.id;

  const claim = async (lead: Lead) => {
    if (claimingId) return;
    setClaimingId(lead.id);
    try {
      const res = await fetch(`/api/leads/${lead.id}/claim`, { method: 'POST' });
      if (res.status === 409) {
        message.warning('تم استلام هذا العميل بالفعل');
        onRefresh();
        return;
      }
      if (!res.ok) {
        message.error('فشل الاستلام');
        return;
      }
      message.success('تم الاستلام');
      onRefresh();
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
    const moved = leads.find((l) => l.id === leadId);
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
    onRefresh();
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

    setSubmitting(false);
    setPendingWon(null);
    onRefresh();
  };

  // Group columns by zone
  const zones = PIPELINE_ZONES.map((z) => ({
    ...z,
    stages: PIPELINE_STAGES.filter((s) => s.zone === z.value),
  }));

  const columns = PIPELINE_STAGES.map((s) => ({
    key: s.value,
    title: `${s.emoji} ${s.labelAr}`,
    color: s.color,
    zone: s.zone,
    items: leads.filter((l) => (l.pipeline_stage || 'NEW') === s.value),
  }));

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
                            {col.items.length}
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
                                        {/* stage age */}
                                        {lead.stage_timestamps?.[lead.pipeline_stage || 'NEW'] && (
                                          <div className="text-[10px] text-gray-400 mt-1">
                                            {stageAgeDays(lead)} يوم في هذه المرحلة
                                          </div>
                                        )}
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
                                              <a
                                                href={getWhatsAppUrl(lead.phone)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                onClick={(e) => e.stopPropagation()}
                                              >
                                                <WhatsAppOutlined style={{ color: '#25D366', fontSize: '14px' }} />
                                              </a>
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
