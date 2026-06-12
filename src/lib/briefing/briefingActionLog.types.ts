import type { BriefingActionParams, BriefingActionType } from '@/lib/briefingActions';

export type BriefingActionLogStatus = 'started' | 'completed' | 'cancelled';

export interface BriefingActionAttributionMetrics {
  baselineAvg: number;
  impactAvg: number;
  deltaPct: number | null;
  baselineDays: number;
  impactDays: number;
  trackingDaysLeft: number;
  calculatedAt: string;
}

export interface BriefingActionLogRecord {
  id: string;
  storeId: string;
  executeDateYmd: string;
  briefingDateYmd?: string;
  actionType: BriefingActionType;
  text: string;
  basis?: string;
  params?: BriefingActionParams;
  status: BriefingActionLogStatus;
  startedAt: string;
  completedAt?: string;
  result?: Record<string, unknown>;
  attribution?: BriefingActionAttributionMetrics;
}
