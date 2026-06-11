import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { ensureNightMonitorChannel, ensureSalesAlertChannel, postMessengerCard } from '@/lib/messenger/channels.server';
import { getPosAlertSettings } from '@/lib/pos/posAlertSettings';

export interface StockThresholdRow {
  itemName: string;
  openingQty: number;
  alertBelowQty: number;
  unit?: string;
}

function normalizeItemKey(name: string): string {
  return String(name || '').trim().slice(0, 50);
}

function alertDocId(storeId: string, date: string, itemName: string): string {
  return `${storeId}_${date}_${normalizeItemKey(itemName)}`.replace(/[/\\#?]/g, '_').slice(0, 500);
}

function isNightHourKST(date = new Date()): boolean {
  const hour = parseInt(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', hour12: false }).format(date),
    10,
  );
  return hour >= 21 || hour < 9;
}

export async function getStockThresholds(storeId: string): Promise<StockThresholdRow[]> {
  const doc = await adminDb.collection('store_settings').doc(storeId).get();
  const raw = doc.data()?.posStockThresholds;
  if (!Array.isArray(raw)) return [];
  return raw
    .map(r => ({
      itemName: normalizeItemKey(String(r.itemName || '')),
      openingQty: Number(r.openingQty ?? r.maxDailyQty ?? 0),
      alertBelowQty: Number(r.alertBelowQty ?? 2),
      unit: String(r.unit || 'kg'),
    }))
    .filter(r => r.itemName && r.openingQty > 0);
}

export async function saveStockThresholds(storeId: string, rows: StockThresholdRow[]): Promise<StockThresholdRow[]> {
  const cleaned = rows
    .map(r => ({
      itemName: normalizeItemKey(r.itemName),
      openingQty: Number(r.openingQty || 0),
      alertBelowQty: Number(r.alertBelowQty || 2),
      unit: String(r.unit || 'kg'),
    }))
    .filter(r => r.itemName && r.openingQty > 0);

  await adminDb.collection('store_settings').doc(storeId).set({
    storeId,
    posStockThresholds: cleaned,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return cleaned;
}

export async function checkStockWarnings(
  storeId: string,
  date: string,
  items: Array<{ name?: string; qty?: number }>,
): Promise<{ alerted: number }> {
  const settings = await getPosAlertSettings(storeId);
  if (!settings.stockWarningEnabled) return { alerted: 0 };

  const thresholds = await getStockThresholds(storeId);
  if (!thresholds.length) return { alerted: 0 };

  const qtyByName = new Map<string, number>();
  for (const it of items) {
    const name = normalizeItemKey(String(it.name || ''));
    if (!name) continue;
    qtyByName.set(name, (qtyByName.get(name) || 0) + Number(it.qty || 0));
  }

  const roomId = isNightHourKST()
    ? await ensureNightMonitorChannel(storeId)
    : await ensureSalesAlertChannel(storeId);

  let alerted = 0;
  for (const th of thresholds) {
    const sold = qtyByName.get(th.itemName) || 0;
    const remaining = th.openingQty - sold;
    if (remaining > th.alertBelowQty) continue;

    const dedupeRef = adminDb.collection('pos_stock_alert_sent').doc(alertDocId(storeId, date, th.itemName));
    if ((await dedupeRef.get()).exists) continue;

    const message = [
      '📦 재고 경고',
      `품목: ${th.itemName}`,
      `현재 추정 재고: ${Math.max(0, remaining)}${th.unit || 'kg'}`,
      `오늘 판매: ${sold}${th.unit || 'kg'}`,
    ].join('\n');

    await adminDb.collection('notifications').add({
      storeId,
      type: 'pos_stock_warning',
      message,
      itemName: th.itemName,
      soldQty: sold,
      remainingQty: Math.max(0, remaining),
      openingQty: th.openingQty,
      saleDate: date,
      createdAt: FieldValue.serverTimestamp(),
    });

    await postMessengerCard({
      roomId,
      type: 'stock_alert',
      text: message.replace(/\n/g, ' · '),
      cardData: {
        title: '📦 재고 경고',
        fields: [
          { label: '품목', value: th.itemName },
          { label: '추정 재고', value: `${Math.max(0, remaining)}${th.unit || 'kg'}` },
          { label: '오늘 판매', value: `${sold}${th.unit || 'kg'}` },
        ],
        footer: '추정치 — POS 재고 미연동',
      },
    });

    await dedupeRef.set({
      storeId, date, itemName: th.itemName, soldQty: sold, sentAt: FieldValue.serverTimestamp(),
    });
    alerted += 1;
  }

  return { alerted };
}
