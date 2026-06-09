import { adminDb } from '@/lib/firebase/admin';
import { getKSTTodayYMD, isKstTodayTimestamp } from '@/lib/dateUtils';
import { detectAnalysisPack } from './detectPack';
import { runSalesOperationsAnalysis } from './runSalesOperationsAnalysis';
import { buildAnalysisPackResult } from './formatPrompt';
import type { AnalysisPackId, AnalysisPackResult, SalesOperationsAnalysis } from './types';

function cacheDocId(storeId: string, date: string) {
  return `ai_analysis_ops_${storeId}_${date}`;
}

async function readCache(storeId: string): Promise<SalesOperationsAnalysis | null> {
  const date = getKSTTodayYMD();
  const snap = await adminDb.collection('dashboard_cache').doc(cacheDocId(storeId, date)).get();
  if (!snap.exists) return null;
  const d = snap.data();
  if (!isKstTodayTimestamp(d?.updatedAt)) return null;
  return (d?.payload as SalesOperationsAnalysis) ?? null;
}

async function writeCache(storeId: string, payload: SalesOperationsAnalysis) {
  const date = getKSTTodayYMD();
  await adminDb.collection('dashboard_cache').doc(cacheDocId(storeId, date)).set({
    storeId,
    date,
    type: 'ai_analysis_ops',
    payload,
    updatedAt: new Date(),
  }, { merge: true });
}

/** 분석 모드용 데이터 팩 — 당일 캐시 후 pack별 프롬프트 생성 */
export async function loadAnalysisPack(
  storeId: string,
  message: string,
): Promise<AnalysisPackResult> {
  const pack: AnalysisPackId = detectAnalysisPack(message);

  let data = await readCache(storeId);
  if (!data) {
    data = await runSalesOperationsAnalysis(storeId);
    await writeCache(storeId, data).catch(err => {
      console.error('[aiAnalysis] cache write failed:', err);
    });
  }

  return buildAnalysisPackResult(pack, data);
}

export type { AnalysisPackResult, AnalysisPackId, SalesOperationsAnalysis };
