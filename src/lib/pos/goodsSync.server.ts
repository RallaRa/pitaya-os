import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { ensureSalesAlertChannel, postMessengerCard } from '@/lib/messenger/channels.server';
import { getPosAlertSettings } from '@/lib/pos/posAlertSettings';
import type { PosGoodInput } from '@/lib/posBarCode';
import { normalizePosBarCode } from '@/lib/posBarCode';

export interface GoodsSnapshotItem {
  name: string;
  sellPri: number;
  categoryName?: string;
}

export interface GoodsChangeResult {
  initialized: boolean;
  added: PosGoodInput[];
  removed: Array<{ posBarCode: string; name: string }>;
  priceChanged: Array<{ posBarCode: string; name: string; oldPrice: number; newPrice: number }>;
}

function toSnapshotMap(goods: PosGoodInput[]): Record<string, GoodsSnapshotItem> {
  const map: Record<string, GoodsSnapshotItem> = {};
  for (const g of goods) {
    const code = normalizePosBarCode(g.posBarCode);
    map[code] = {
      name: String(g.name || code).trim(),
      sellPri: Number(g.sellPri ?? 0),
      categoryName: g.categoryName || '',
    };
  }
  return map;
}

export function detectGoodsChanges(
  prev: Record<string, GoodsSnapshotItem> | null,
  goods: PosGoodInput[],
): GoodsChangeResult {
  const incoming = toSnapshotMap(goods);
  const prevKeys = prev ? Object.keys(prev) : [];
  const incomingKeys = Object.keys(incoming);

  if (!prev || prevKeys.length === 0) {
    return {
      initialized: true,
      added: goods,
      removed: [],
      priceChanged: [],
    };
  }

  const added: PosGoodInput[] = [];
  const removed: Array<{ posBarCode: string; name: string }> = [];
  const priceChanged: GoodsChangeResult['priceChanged'] = [];

  for (const code of incomingKeys) {
    if (!prev[code]) {
      const found = goods.find(g => normalizePosBarCode(g.posBarCode) === code);
      if (found) added.push(found);
      continue;
    }
    if (prev[code].sellPri !== incoming[code].sellPri) {
      priceChanged.push({
        posBarCode: code,
        name: incoming[code].name,
        oldPrice: prev[code].sellPri,
        newPrice: incoming[code].sellPri,
      });
    }
  }

  for (const code of prevKeys) {
    if (!incoming[code]) {
      removed.push({ posBarCode: code, name: prev[code].name });
    }
  }

  return { initialized: false, added, removed, priceChanged };
}

export function buildGoodsChangeMessage(changes: GoodsChangeResult): string | null {
  const parts: string[] = ['🔄 POS 품목 변경 감지'];
  let hasChange = false;

  if (changes.added.length > 0) {
    hasChange = true;
    const names = changes.added.slice(0, 5).map(g => g.name || g.posBarCode).join(', ');
    const suffix = changes.added.length > 5 ? ` 외 ${changes.added.length - 5}건` : '';
    parts.push(`추가: ${names} (${changes.added.length}개)${suffix}`);
  }

  if (changes.removed.length > 0) {
    hasChange = true;
    const names = changes.removed.slice(0, 5).map(r => r.name).join(', ');
    const suffix = changes.removed.length > 5 ? ` 외 ${changes.removed.length - 5}건` : '';
    parts.push(`삭제: ${names} (${changes.removed.length}개)${suffix}`);
  }

  if (changes.priceChanged.length > 0) {
    hasChange = true;
    const names = changes.priceChanged.slice(0, 3).map(p =>
      `${p.name} ${p.oldPrice.toLocaleString()}→${p.newPrice.toLocaleString()}원`,
    ).join(', ');
    const suffix = changes.priceChanged.length > 3 ? ` 외 ${changes.priceChanged.length - 3}건` : '';
    parts.push(`가격변경: ${names}${suffix}`);
  }

  if (!hasChange) return null;
  return parts.join('\n');
}

export async function syncProductsCollection(
  storeId: string,
  goods: PosGoodInput[],
  removed: Array<{ posBarCode: string; name: string }>,
  syncedAt: string,
): Promise<number> {
  let count = 0;
  const BATCH = 400;

  for (let i = 0; i < goods.length; i += BATCH) {
    const chunk = goods.slice(i, i + BATCH);
    const batch = adminDb.batch();
    for (const g of chunk) {
      const posBarCode = normalizePosBarCode(g.posBarCode);
      const docId = `${storeId}_${posBarCode}`.replace(/[/\\#?]/g, '_').slice(0, 500);
      batch.set(
        adminDb.collection('products').doc(docId),
        {
          storeId,
          posBarCode,
          name: g.name || posBarCode,
          sellPri: g.sellPri ?? 0,
          categoryCode: g.categoryCode || '',
          categoryName: g.categoryName || '',
          scaleUse: g.scaleUse || '',
          active: true,
          source: 'pos_sync',
          syncedAt,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      count += 1;
    }
    await batch.commit();
  }

  for (const r of removed) {
    const docId = `${storeId}_${r.posBarCode}`.replace(/[/\\#?]/g, '_').slice(0, 500);
    await adminDb.collection('products').doc(docId).set({
      active: false,
      deactivatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    const scaleId = `${storeId}_${r.posBarCode}`;
    await adminDb.collection('scale_codes').doc(scaleId).set({
      active: false,
      deactivatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  return count;
}

export async function processGoodsSyncChanges(
  storeId: string,
  goods: PosGoodInput[],
  syncedAt: string,
): Promise<{
  changes: GoodsChangeResult;
  notified: boolean;
  message?: string;
}> {
  const snapRef = adminDb.collection('pos_goods_snapshot').doc(storeId);
  const snapDoc = await snapRef.get();
  const prev = (snapDoc.data()?.items || null) as Record<string, GoodsSnapshotItem> | null;

  const changes = detectGoodsChanges(prev, goods);
  const incomingMap = toSnapshotMap(goods);

  await syncProductsCollection(storeId, goods, changes.removed, syncedAt);

  await snapRef.set({
    storeId,
    items: incomingMap,
    itemCount: goods.length,
    syncedAt,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  if (changes.initialized) {
    return { changes, notified: false };
  }

  const message = buildGoodsChangeMessage(changes);
  if (!message) {
    return { changes, notified: false };
  }

  const settings = await getPosAlertSettings(storeId);
  if (!settings.goodsSyncNotifyEnabled) {
    return { changes, notified: false, message };
  }

  const roomId = await ensureSalesAlertChannel(storeId);
  await postMessengerCard({
    roomId,
    type: 'stock_alert',
    text: message.replace(/\n/g, ' · '),
    cardData: {
      title: '🔄 POS 품목 변경',
      fields: [
        ...(changes.added.length ? [{ label: '추가', value: `${changes.added.length}개` }] : []),
        ...(changes.removed.length ? [{ label: '삭제', value: `${changes.removed.length}개` }] : []),
        ...(changes.priceChanged.length ? [{ label: '가격변경', value: `${changes.priceChanged.length}개` }] : []),
      ],
      footer: changes.added.slice(0, 2).map(g => g.name).join(', ') || undefined,
    },
  });

  return { changes, notified: true, message };
}
