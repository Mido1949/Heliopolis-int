import type { LeadStatus, PipelineStage } from '@/types';

/**
 * Single source of truth for the pipeline_stage → status mirror.
 *
 * pipeline_stage is canonical; status is a derived legacy column kept only
 * because Analytics, Dashboard, DashboardCharts, Reports, and NormalUserShell
 * all display/aggregate by status today. Every writer that changes a lead's
 * pipeline_stage must set status through statusForStage() in the same write —
 * do not set status to a literal string anywhere else.
 */
export const STAGE_TO_STATUS: Record<PipelineStage, LeadStatus> = {
  NEW: 'New',
  WELCOME_SENT: 'Contacted',
  NO_RESPONSE: 'No Response',
  INTERESTED: 'Interested',
  PRICING: 'Pricing',
  QUOTED: 'Quote Sent',
  NEGOTIATION: 'Negotiation',
  WON: 'Won',
  LOST: 'Lost',
  POSTPONED: 'Postponed',
};

export function statusForStage(stage: PipelineStage): LeadStatus {
  return STAGE_TO_STATUS[stage] ?? 'New';
}
