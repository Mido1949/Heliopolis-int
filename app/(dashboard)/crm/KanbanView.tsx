'use client';

import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Card, Tag, Typography, message } from 'antd';
import { LEAD_STATUSES } from '@/lib/constants';
import type { Lead } from '@/types';
import { createClient } from '@/lib/supabase/client';
import { logLeadActivity } from '@/lib/supabase/activities';

const { Text, Title } = Typography;

interface KanbanViewProps {
  leads: Lead[];
  onLeadClick: (lead: Lead) => void;
  onRefresh: () => void;
}

export default function KanbanView({ leads, onLeadClick, onRefresh }: KanbanViewProps) {
  const supabase = createClient();

  const onDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const newStatus = destination.droppableId;
    const leadId = draggableId;

    try {
      const { error } = await supabase
        .from('leads')
        .update({ status: newStatus })
        .eq('id', leadId);

      if (error) throw error;

      await logLeadActivity(leadId, 'status_change', { from: source.droppableId, to: newStatus });
      message.success(`تم نقل العميل إلى ${LEAD_STATUSES.find(s => s.value === newStatus)?.labelAr}`);
      onRefresh();
    } catch {
      message.error('فشل تحديث حالة العميل');
    }
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4 min-h-[500px]">
        {LEAD_STATUSES.map((status) => (
          <div key={status.value} className="flex-shrink-0 w-80">
            <div className="bg-gray-100 rounded-xl p-3 h-full flex flex-col">
              <div className="flex justify-between items-center mb-4 px-1">
                <Title level={5} style={{ margin: 0 }}>{status.labelAr}</Title>
                <Tag color={status.color}>{leads.filter(l => l.status === status.value).length}</Tag>
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
                      .filter((l) => l.status === status.value)
                      .map((lead, index) => (
                        <Draggable key={lead.id} draggableId={lead.id} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              onClick={() => onLeadClick(lead)}
                              style={{
                                ...provided.draggableProps.style,
                                userSelect: 'none',
                              }}
                            >
                              <Card
                                size="small"
                                className={`shadow-sm cursor-pointer hover:border-accent transition-all ${snapshot.isDragging ? 'shadow-lg ring-1 ring-accent' : ''}`}
                                styles={{ body: { padding: '12px' } }}
                              >
                                <Title level={5} style={{ fontSize: '14px', marginBottom: '4px' }}>{lead.name}</Title>
                                {lead.company && <Text type="secondary" style={{ fontSize: '12px', display: 'block' }}>{lead.company}</Text>}
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
  );
}
