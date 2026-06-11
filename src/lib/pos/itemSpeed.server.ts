import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { addDaysYMD } from '@/lib/dateUtils';
import { ensureSalesAlertChannel, postMessengerCard } from '@/lib/messenger/channels.server';
import { getPosAlertSettings } from '@/lib/pos/posAlertSettings';
import { updateSignageTopSeller } from '@/lib/pos/signageAutoSwitch.server';

export interface ItemSpeedRow {
  name: string;
  qty: number;
}

export interface ItemSpeedWindowInput {
  date: string;
  windowStart: string;
  windowEnd: string;
  items: ItemSpeedRow[];
}

export interface ItemSpeedAlertCandidate {
  name: string;
  qty: number;
  avgQty: number;
  ratioPct: number;
}

const MIN_BASELINE_QTY = 1;
const MIN_CURRENT_QTY = 2;
const ALERT_RATIO = 2;
const BASELINE_DAYS = 7;
const MIN_BASELINE_DAYS = 3;

function normalizeItemName(name: string): string {
  return String(name || '').trim().slice(0, 50);
}

function windowDocId(storeId: string, date: string, windowEnd: string): string {
  const hm = windowEnd.replace(':', '');
  return `${storeId}_${date}_${hm}`.replace(/[/\\#?]/g, '_').slice(0, 500);
}

function alertDocId(storeId: string, date: string, windowEnd: string, itemName: string): string {
  const key = normalizeItemName(itemName).replace(/[/\\#?]/g, '_').slice(0, 80);
  return `${storeId}_${date}_${windowEnd.replace(':', '')}_${key}`.replace(/[/\\#?]/g, '_').slice(0, 500);
}

export function buildItemSpeedMessage(alert: ItemSpeedAlertCandidate): string {
  return [
    `⚡ ${alert.name} 판매 속도 빠름`,
    `현재 시간대 평균 대비 ${alert.ratioPct}%`,
    '재고 확인 권장',
  ].join('\n');
}

export function detectFastMovingItems(
  currentItems: ItemSpeedRow[],
  historicalWindows: Array<Record<string, { qty: number }>>,
): ItemSpeedAlertCandidate[] {
  if (!historicalWindows.length) return [];

  const avgByName: Record<string, { sum: number; days: number }> = {};
  for (const window of historicalWindows) {
    for (const [name, row] of Object.entries(window)) {
      if (!avgByName[name]) avgByName[name] = { sum: 0, days: 0 };
      avgByName[name].sum += row.qty;
      avgByName[name].days += 1;
    }
  }

  const alerts: ItemSpeedAlertCandidate[] = [];
  for (const item of currentItems) {
    const name = normalizeItemName(item.name);
    const qty = Number(item.qty || 0);
    if (!name || qty < MIN_CURRENT_QTY) continue;

    const baseline = avgByName[name];
    if (!baseline || baseline.days < MIN_BASELINE_DAYS) continue;

    const avgQty = baseline.sum / baseline.days;
    if (avgQty < MIN_BASELINE_QTY) continue;

    const ratio = qty / avgQty;
    if (ratio < ALERT_RATIO) continue;

    alerts.push({
      name,
      qty,
      avgQty: Math.round(avgQty * 10) / 10,
      ratioPct: Math.round(ratio * 100),
    });
  }

  return alerts.sort((a, b) => b.ratioPct - a.ratioPct);
}

async function saveItemSpeedWindow(
  storeId: string,
  input: ItemSpeedWindowInput,
): Promise<void> {
  const itemsMap: Record<string, { name: string; qty: number }> = {};
  for (const row of input.items) {
    const name = normalizeItemName(row.name);
    if (!name) continue;
    itemsMap[name] = { name, qty: Number(row.qty || 0) };
  }

  await adminDb.collection('pos_item_speed_windows').doc(
    windowDocId(storeId, input.date, input.windowEnd),
  ).set({
    storeId,
    date: input.date,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    items: itemsMap,
    itemCount: Object.keys(itemsMap).length,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

async function fetchHistoricalWindows(
  storeId: string,
  windowEnd: string,
  excludeDate: string,
): Promise<Array<Record<string, { qty: number }>>> {
  const since = addDaysYMD(excludeDate, -BASELINE_DAYS);
  try {
    const snap = await adminDb.collection('pos_item_speed_windows')
      .where('storeId', '==', storeId)
      .where('windowEnd', '==', windowEnd)
      .where('date', '>=', since)
      .where('date', '<', excludeDate)
      .orderBy('date', 'desc')
      .limit(BASELINE_DAYS)
      .get();
    return snap.docs.map(d => (d.data().items || {}) as Record<string, { qty: number }>);
  } catch (err) {
    console.warn('[itemSpeed] historical query failed, fallback scan:', err);
    const snap = await adminDb.collection('pos_item_speed_windows')
      .where('storeId', '==', storeId)
      .limit(500)
      .get();
    return snap.docs
      .map(d => d.data())
      .filter(d =>
        d.windowEnd === windowEnd
        && d.date >= since
        && d.date < excludeDate,
      )
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, BASELINE_DAYS)
      .map(d => (d.items || {}) as Record<string, { qty: number }>);
  }
}

export async function processItemSpeedCheck(
  storeId: string,
  input: ItemSpeedWindowInput,
): Promise<{
  saved: boolean;
  alerts: ItemSpeedAlertCandidate[];
  notified: number;
  disabled?: boolean;
  signageUpdated?: boolean;
}> {
  if (!storeId || !input.date || !input.windowEnd) {
    return { saved: false, alerts: [], notified: 0 };
  }

  const normalizedItems = input.items
    .map(row => ({ name: normalizeItemName(row.name), qty: Number(row.qty || 0) }))
    .filter(row => row.name && row.qty > 0);

  await saveItemSpeedWindow(storeId, { ...input, items: normalizedItems });

  let signageUpdated = false;
  try {
    const signage = await updateSignageTopSeller(storeId, normalizedItems);
    signageUpdated = signage.updated;
  } catch (err) {
    console.error('[itemSpeed] signage auto switch failed:', err);
  }

  const settings = await getPosAlertSettings(storeId);
  if (!settings.itemSpeedAlertEnabled) {
    return { saved: true, alerts: [], notified: 0, disabled: true, signageUpdated };
  }

  const historical = await fetchHistoricalWindows(storeId, input.windowEnd, input.date);
  const alerts = detectFastMovingItems(normalizedItems, historical);
  if (!alerts.length) {
    return { saved: true, alerts: [], notified: 0, signageUpdated };
  }

  const roomId = await ensureSalesAlertChannel(storeId);
  let notified = 0;

  for (const alert of alerts.slice(0, 5)) {
    const dedupeRef = adminDb.collection('pos_item_speed_alert_sent').doc(
      alertDocId(storeId, input.date, input.windowEnd, alert.name),
    );
    if ((await dedupeRef.get()).exists) continue;

    const message = buildItemSpeedMessage(alert);
    await adminDb.collection('notifications').add({
      storeId,
      type: 'pos_item_speed',
      message,
      itemName: alert.name,
      qty: alert.qty,
      avgQty: alert.avgQty,
      ratioPct: alert.ratioPct,
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
      saleDate: input.date,
      createdAt: FieldValue.serverTimestamp(),
    });

    await postMessengerCard({
      roomId,
      type: 'stock_alert',
      text: message.replace(/\n/g, ' · '),
      cardData: {
        title: '⚡ 품목 판매 속도',
        fields: [
          { label: '품목', value: alert.name },
          { label: '최근 1시간', value: `${alert.qty}개` },
          { label: '평균 대비', value: `${alert.ratioPct}%` },
        ],
        footer: '재고 확인 권장',
      },
    });

    await dedupeRef.set({
      storeId,
      date: input.date,
      windowEnd: input.windowEnd,
      itemName: alert.name,
      notifiedAt: FieldValue.serverTimestamp(),
    });
    notified += 1;
  }

  return { saved: true, alerts, notified, signageUpdated };
}
