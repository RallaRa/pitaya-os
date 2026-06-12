import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import type { CommercialAreaContext, FootTrafficWithComparisons } from '@/lib/areaContext';
import { resolveTradeAreaCode } from '@/lib/areaContext';

export interface TradeAreaSnapshot {
  storeId: string;
  date: string;
  tradeAreaCode: string;
  tradeAreaCodeSource: 'store' | 'sigungu_fallback' | 'none';
  regionSido: string;
  regionSigungu: string;
  commercial: CommercialAreaContext;
  footTraffic: Pick<FootTrafficWithComparisons, 'index' | 'level' | 'source' | 'summary'>;
  sources: {
    commercial: 'api' | 'estimate';
    footTraffic: 'api' | 'estimate';
    commercialQuery?: 'trdarCdN' | 'signguCd' | 'estimate';
  };
  savedAt: string;
}

export function tradeAreaSnapshotDocId(storeId: string, dateYmd: string): string {
  return `${storeId}_${dateYmd}`;
}

export function buildTradeAreaSnapshot(params: {
  storeId: string;
  dateYmd: string;
  regionSido: string;
  regionSigungu: string;
  tradeAreaCode?: string;
  commercial: CommercialAreaContext;
  footTraffic: FootTrafficWithComparisons;
}): TradeAreaSnapshot {
  const resolved = resolveTradeAreaCode(params.tradeAreaCode, params.regionSigungu);

  return {
    storeId: params.storeId,
    date: params.dateYmd,
    tradeAreaCode: resolved.code,
    tradeAreaCodeSource: resolved.source,
    regionSido: params.regionSido,
    regionSigungu: params.regionSigungu,
    commercial: params.commercial,
    footTraffic: {
      index: params.footTraffic.index,
      level: params.footTraffic.level,
      source: params.footTraffic.source,
      summary: params.footTraffic.summary,
    },
    sources: {
      commercial: params.commercial.source,
      footTraffic: params.footTraffic.source,
      commercialQuery: params.commercial.apiQuery,
    },
    savedAt: new Date().toISOString(),
  };
}

export async function saveTradeAreaSnapshot(snapshot: TradeAreaSnapshot): Promise<void> {
  if (!snapshot.storeId) return;
  const docId = tradeAreaSnapshotDocId(snapshot.storeId, snapshot.date);
  await adminDb.collection('store_trade_area').doc(docId).set({
    ...snapshot,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}
