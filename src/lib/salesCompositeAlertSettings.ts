import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import {
  COMPOSITE_AVG_TICKET_THETA,
  COMPOSITE_MIN_ABSOLUTE,
  COMPOSITE_MIN_EXPECTED,
  COMPOSITE_PRESETS,
  COMPOSITE_Z_SCORE,
  type CompositePresetId,
  type CompositeWeights,
} from '@/lib/salesCompositeAlert.config';

export interface SalesCompositeAlertSettings {
  enabled: boolean;
  intradayEnabled: boolean;
  eodEnabled: boolean;
  preset: CompositePresetId;
  /** preset 가중치 개별 오버라이드 (선택) */
  weightOverrides?: Partial<CompositeWeights>;
  metrics: {
    netSales: boolean;
    customerCount: boolean;
    avgTicket: boolean;
  };
  /** AI 한 줄 코멘트 (실패 시 규칙 기반 메시지만 발송) */
  aiEnrichmentEnabled: boolean;
  zScoreEnabled: boolean;
}

export const DEFAULT_SALES_COMPOSITE_ALERT_SETTINGS: SalesCompositeAlertSettings = {
  enabled: true,
  intradayEnabled: true,
  eodEnabled: true,
  preset: 'balanced',
  metrics: {
    netSales: true,
    customerCount: true,
    avgTicket: true,
  },
  aiEnrichmentEnabled: true,
  zScoreEnabled: COMPOSITE_Z_SCORE.enabled,
};

export function resolveCompositeWeights(settings: SalesCompositeAlertSettings): CompositeWeights {
  const base = COMPOSITE_PRESETS[settings.preset]?.weights
    ?? COMPOSITE_PRESETS.balanced.weights;
  return { ...base, ...settings.weightOverrides };
}

export function resolveCompositePreset(settings: SalesCompositeAlertSettings) {
  return COMPOSITE_PRESETS[settings.preset] ?? COMPOSITE_PRESETS.balanced;
}

export function resolveThetaPercent(
  settings: SalesCompositeAlertSettings,
  scope: 'intraday' | 'eod',
): number {
  const preset = resolveCompositePreset(settings);
  return scope === 'intraday' ? preset.theta.intraday : preset.theta.eod;
}

export function resolveKOfN(settings: SalesCompositeAlertSettings): { k: number; n: number } {
  const preset = resolveCompositePreset(settings);
  return { k: preset.k, n: preset.n };
}

export function resolveAvgTicketTheta(): number {
  return COMPOSITE_AVG_TICKET_THETA;
}

export function resolveMinAbsolute() {
  return COMPOSITE_MIN_ABSOLUTE;
}

export function resolveMinExpected() {
  return COMPOSITE_MIN_EXPECTED;
}

export function resolveZScoreConfig(settings: SalesCompositeAlertSettings) {
  if (!settings.zScoreEnabled) {
    return { enabled: false, trigger: COMPOSITE_Z_SCORE.trigger, suppressBelow: COMPOSITE_Z_SCORE.suppressBelow };
  }
  return COMPOSITE_Z_SCORE;
}

export async function getSalesCompositeAlertSettings(
  storeId: string,
): Promise<SalesCompositeAlertSettings> {
  const doc = await adminDb.collection('store_settings').doc(storeId).get();
  const raw = (doc.data()?.salesCompositeAlerts || {}) as Partial<SalesCompositeAlertSettings>;
  return {
    ...DEFAULT_SALES_COMPOSITE_ALERT_SETTINGS,
    ...raw,
    metrics: {
      ...DEFAULT_SALES_COMPOSITE_ALERT_SETTINGS.metrics,
      ...raw.metrics,
    },
  };
}

export type SalesCompositeAlertSettingsPatch = Omit<Partial<SalesCompositeAlertSettings>, 'metrics'> & {
  metrics?: Partial<SalesCompositeAlertSettings['metrics']>;
};

export async function saveSalesCompositeAlertSettings(
  storeId: string,
  patch: SalesCompositeAlertSettingsPatch,
): Promise<SalesCompositeAlertSettings> {
  const current = await getSalesCompositeAlertSettings(storeId);
  const merged: SalesCompositeAlertSettings = {
    ...current,
    ...patch,
    metrics: patch.metrics
      ? { ...current.metrics, ...patch.metrics }
      : current.metrics,
    weightOverrides: patch.weightOverrides
      ? { ...current.weightOverrides, ...patch.weightOverrides }
      : current.weightOverrides,
  };
  await adminDb.collection('store_settings').doc(storeId).set(
    { storeId, salesCompositeAlerts: merged, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
  return merged;
}
