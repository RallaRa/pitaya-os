import { addDaysYMD, getKSTTodayYMD } from '@/lib/dateUtils';
import type { PurchaseEvidenceSource } from '@/lib/purchase/purchaseEvidence';
import {
  importPurchaseEvidence,
  loadExistingExternalKeys,
} from '@/lib/purchase/purchaseReconciliation.server';
import { fetchHometaxPurchaseEvidence } from '@/lib/purchase/hometaxFetch.server';
import {
  loadHometaxCookies,
  markHometaxSyncResult,
  verifyHometaxSession,
} from '@/lib/purchase/hometaxSession.server';
import { appendHometaxSyncLog, type HometaxSyncTrigger } from '@/lib/purchase/hometaxSyncLog.server';
import type { HometaxSyncResult } from '@/lib/purchase/hometaxTypes';

const EMPTY_COUNTS = { tax_invoice: 0, cash_receipt: 0, card: 0, total: 0 };

function resolveDateRange(params: {
  startDate?: string;
  endDate?: string;
  lookbackDays?: number;
}) {
  const endDate = params.endDate || getKSTTodayYMD();
  const lookback = params.lookbackDays && params.lookbackDays > 0 ? params.lookbackDays : 90;
  const startDate = params.startDate || addDaysYMD(endDate, -lookback);
  return { startDate, endDate };
}

function buildFailureResult(message: string, sessionValid: boolean, errors: string[]): HometaxSyncResult {
  return {
    ok: false,
    sessionValid,
    message,
    imported: { ...EMPTY_COUNTS },
    skipped: { ...EMPTY_COUNTS },
    errors,
  };
}

export async function syncHometaxEvidence(params: {
  storeId: string;
  uid: string;
  startDate?: string;
  endDate?: string;
  lookbackDays?: number;
  skipVerify?: boolean;
  trigger?: HometaxSyncTrigger;
}): Promise<HometaxSyncResult> {
  const startedAt = new Date();
  const trigger = params.trigger || 'manual';
  const { startDate, endDate } = resolveDateRange(params);

  const finish = async (result: HometaxSyncResult) => {
    await appendHometaxSyncLog({
      storeId: params.storeId,
      uid: params.uid,
      trigger,
      startDate,
      endDate,
      startedAt,
      result,
    }).catch(() => {});
    return result;
  };

  const cookies = await loadHometaxCookies(params.storeId);
  if (!cookies?.length) {
    return finish(buildFailureResult(
      '홈택스 세션이 없습니다. 설정에서 연결하세요.',
      false,
      ['no_session'],
    ));
  }

  if (!params.skipVerify) {
    const verify = await verifyHometaxSession(params.storeId);
    if (!verify.valid) {
      await markHometaxSyncResult(params.storeId, {
        ok: false,
        message: verify.message,
        importedTotal: 0,
      });
      return finish(buildFailureResult(verify.message, false, ['session_expired']));
    }
  }

  const errors: string[] = [];
  const imported = { ...EMPTY_COUNTS };
  const skipped = { ...EMPTY_COUNTS };
  const existingKeys = await loadExistingExternalKeys(params.storeId);

  const sources: PurchaseEvidenceSource[] = ['tax_invoice', 'cash_receipt', 'card'];

  for (const sourceType of sources) {
    try {
      const fetched = await fetchHometaxPurchaseEvidence({
        storeId: params.storeId,
        cookies,
        sourceType,
        startDate,
        endDate,
      });
      if (fetched.note) errors.push(fetched.note);

      if (fetched.records.length > 0) {
        const result = await importPurchaseEvidence({
          storeId: params.storeId,
          uid: params.uid,
          sourceType,
          records: fetched.records,
          importSource: 'hometax',
          existingKeys,
        });
        imported[sourceType] = result.imported;
        skipped[sourceType] = result.skipped;
        imported.total += result.imported;
        skipped.total += result.skipped;
      }
    } catch (e) {
      errors.push(`${sourceType}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const message = imported.total > 0
    ? `${imported.total}건 신규 · ${skipped.total}건 중복 제외`
    : skipped.total > 0
      ? `신규 없음 (${skipped.total}건 이미 존재)`
      : errors.length > 0
        ? '동기화 중 일부 오류가 발생했습니다.'
        : '해당 기간에 가져올 증빙이 없습니다.';

  const ok = imported.total > 0 || (errors.length === 0 && skipped.total >= 0);

  await markHometaxSyncResult(params.storeId, {
    ok,
    message,
    importedTotal: imported.total,
  });

  return finish({
    ok,
    sessionValid: true,
    message,
    imported,
    skipped,
    errors,
  });
}
