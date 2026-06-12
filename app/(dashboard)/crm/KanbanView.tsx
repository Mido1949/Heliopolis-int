'use client';

import { useState } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Card, Tag, Typography, message, Modal, Input } from 'antd';
import { PIPELINE_STAGES } from '@/lib/constants';
import type { Lead, PipelineStage } from '@/types';
import { logLeadActivity } from '@/lib/supabase/activities';

const { Text, Title } = Typography;

interface KanbanViewProps {
  leads: Lead[];
  onLeadClick: (lead: Lead) => void;
  onRefresh: () => void;
}

export default function KanbanView({ leads, onLeadClick, onRefresh }: KanbanViewProps) {
  const [pendingWon, setPendingWon] = useState<{ leadId: string; fromStage: string } | null>(null);
  const [dealValue, setDealValue] = useState<number | null>(null);
  const [dealName, setDealName] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const moveStage = async (leadId: string, newStage: PipelineStage, deal_value: number | null = null) => {
    try {
      const res = await fetch(`/api/leads/${leadId}/stage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pipeline_stage: newStage, deal_value }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Update failed');

      await logLeadActivity(leadId, 'status_change', { to: newStage, deal_value });
      const stageLabel = PIPELINE_STAGES.find(s => s.value === newStage)?.labelAr || newStage;
      message.success(`تم نقل العميل إلى ${stageLabel}`);
      onRefresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'فشل تحديث حالة العميل';
      message.error(msg);
    }
  };

  const onDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const newStage = destination.droppableId as PipelineStage;
    const leadId = draggableId;
    const lead = leads.find(l => l.id === leadId);

    if (newStage === 'WON') {
      // T037: prompt for deal_value before allowing WON
      setDealName(lead?.name || '');
      setPendingWon({ leadId, fromStage: source.droppableId });
      setDealValue(null);
      return;
    }

    await moveStage(leadId, newStage);
  };

  const confirmWon = async () => {
    if (!pendingWon || dealValue === null || dealValue <= 0) {
      message.error('يرجى إدخال قيمة الصفقة');
      return;
    }
    setSubmitting(true);
    await moveStage(pendingWon.leadId, 'WON', dealValue);
    setSubmitting(false);
    setPendingWon(null);
  };

  return (
    <>
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4 min-h-[500px]">
          {PIPELINE_STAGES.map((status) => (
            <div key={status.value} className="flex-shrink-0 w-80">
              <div className="bg-gray-100 rounded-xl p-3 h-full flex flex-col">
                <div className="flex justify-between items-center mb-4 px-1">
                  <Title level={5} style={{ margin: 0 }}>{status.labelAr}</Title>
                  <Tag color={status.color}>
                    {leads.filter(l => (l.pipeline_stage || 'NEW') === status.value).length}
                  </Tag>
                </div>

                <Droppable droppableId={status.value}>
                  {(provided, snapshot) => (
                    <div
                      {...provided.droppableProps}
                      ref={provided.innerRef}
                      className={`flex-grow space-y-3 p-1 transition-colors rounded-lg ${snapshot.isDraggingOver ? 'bg-gray-200' : ''}`}
                      style={{ minHeight: 100 }}
                    >
                      {leads
                        .filter((l) => (l.pipeline_stage || 'NEW') === status.value)
                        .map((lead, index) => (
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
                                  {lead.deal_value != null && status.value === 'WON' && (
                                    <Text strong style={{ fontSize: '12px', color: '#52C41A' }}>
                                      ${lead.deal_value.toLocaleString()}
                                    </Text>
                                  )}
                                  <div className="mt-3 flex justify-between items-center">
                                    <Text type="secondary" style={{ fontSize: '11px' }}>{lead.region || '—'}</Text>
                                    <Tag color="blue" style={{ fontSize: '10px' }}>{lead.source}</Tag>
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
