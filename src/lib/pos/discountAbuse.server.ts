import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { addDaysYMD, getKSTTodayYMD } from '@/lib/dateUtils';
import { ensureNightMonitorChannel, postMessengerCard } from '@/lib/messenger/channels.server';
import { getPosAlertSettings } from '@/lib/pos/posAlertSettings';

export interface DiscountLineInput {
  name: string;
  sellPrice?: number;
  totalPrice?: number;
  discountAmount?: number;
  qty?: number;
}

export interface DiscountAbuseEventInput {
  saleNum: string;
  saleTime?: string;
  amount: number;
  lines?: DiscountLineInput[];
}

function dedupeDocId(storeId: string, date: string, saleNum: string): string {
  return `${storeId}_${date}_${saleNum}`.replace(/[/\\#?]/g, '_').slice(0, 500);
}

export function countDiscountedLines(lines: DiscountLineInput[]): number {
  let count = 0;
  for (const line of lines) {
    const sell = Number(line.sellPrice || 0);
    const total = Number(line.totalPrice || 0);
    const dec = Number(line.discountAmount || 0);
    const qty = Number(line.qty || 1);
    const lineSell = sell * qty;
    if (dec > 0) { count += 1; continue; }
    if (lineSell > 0 && total > 0 && total < lineSell - 1) count += 1;
  }
  return count;
}

export function buildDiscountAbuseMessage(event: DiscountAbuseEventInput, discountCount: number): string {
  return [
    '⚠️ 할인 중복 감지',
    `영수증: ${event.saleNum}`,
    `시간: ${String(event.saleTime || '-').replace(/(\d{2})(\d{2})/, '$1:$2').slice(0, 5)}`,
    `할인 적용 횟수: ${discountCount}회`,
  ].join('\n');
}

export async function processDiscountAbuseEvents(
  storeId: string,
  date: string,
  events: DiscountAbuseEventInput[],
): Promise<{ detected: number; skipped: number; disabled?: boolean }> {
  const settings = await getPosAlertSettings(storeId);
  if (!settings.discountAbuseEnabled) {
    return { detected: 0, skipped: events.length, disabled: true };
  }

  const roomId = await ensureNightMonitorChannel(storeId);
  let detected = 0;

  for (const event of events) {
    const lines = event.lines || [];
    const discountCount = countDiscountedLines(lines);
    if (discountCount < 2) continue;

    const dedupeRef = adminDb.collection('abuse_logs').doc(dedupeDocId(storeId, date, event.saleNum));
    if ((await dedupeRef.get()).exists) continue;

    const message = buildDiscountAbuseMessage(event, discountCount);
    await dedupeRef.set({
      storeId,
      receiptNo: event.saleNum,
      discountCount,
      amount: event.amount,
      saleTime: event.saleTime || '',
      date,
      detectedAt: FieldValue.serverTimestamp(),
    });

    await adminDb.collection('notifications').add({
      storeId,
      type: 'pos_discount_abuse',
      message,
      saleNum: event.saleNum,
      discountCount,
      amount: event.amount,
      saleDate: date,
      createdAt: FieldValue.serverTimestamp(),
    });

    await postMessengerCard({
      roomId,
      type: 'stock_alert',
      text: message.replace(/\n/g, ' · '),
      cardData: {
        title: '⚠️ 할인 중복 감지',
        fields: [
          { label: '영수증', value: event.saleNum },
          { label: '할인 횟수', value: `${discountCount}회` },
          { label: '금액', value: `${Math.round(event.amount).toLocaleString('ko-KR')}원` },
        ],
      },
    });

    detected += 1;
  }

  return { detected, skipped: events.length - detected };
}

export async function sendDiscountAbuseDailyReport(storeId: string, reportDate: string): Promise<{
  count: number;
  notified: boolean;
}> {
  const settings = await getPosAlertSettings(storeId);
  if (!settings.discountAbuseEnabled) return { count: 0, notified: false };

  let logs: Array<{ receiptNo: string; discountCount: number; amount: number }> = [];
  try {
    const snap = await adminDb.collection('abuse_logs')
      .where('storeId', '==', storeId)
      .where('date', '==', reportDate)
      .get();
    logs = snap.docs.map(d => {
      const data = d.data();
      return {
        receiptNo: String(data.receiptNo || ''),
        discountCount: Number(data.discountCount || 0),
        amount: Number(data.amount || 0),
      };
    });
  } catch {
    return { count: 0, notified: false };
  }

  if (!logs.length) return { count: 0, notified: false };

  const dedupeRef = adminDb.collection('abuse_daily_report_sent').doc(`${storeId}_${reportDate}`);
  if ((await dedupeRef.get()).exists) return { count: logs.length, notified: false };

  const message = `📋 ${reportDate} 할인 중복 ${logs.length}건\n${logs.slice(0, 3).map(l => `${l.receiptNo}(${l.discountCount}회)`).join(', ')}`;
  const roomId = await ensureNightMonitorChannel(storeId);
  await postMessengerCard({
    roomId,
    type: 'stock_alert',
    text: message.replace(/\n/g, ' · '),
    cardData: {
      title: `📋 ${reportDate} 할인 남용`,
      fields: [{ label: '건수', value: `${logs.length}건` }],
    },
  });

  await dedupeRef.set({ storeId, reportDate, count: logs.length, sentAt: FieldValue.serverTimestamp() });
  return { count: logs.length, notified: true };
}

export async function runDiscountAbuseDailyReportAllStores(): Promise<{ stores: number; reports: number }> {
  const today = getKSTTodayYMD();
  const yesterday = addDaysYMD(today, -1);
  const storesSnap = await adminDb.collection('stores').where('status', '==', 'active').get();
  let reports = 0;

  for (const storeDoc of storesSnap.docs) {
    try {
      const result = await sendDiscountAbuseDailyReport(storeDoc.id, yesterday);
      if (result.notified) reports += 1;
    } catch (e) {
      console.error('[discount-abuse-report]', storeDoc.id, e);
    }
  }

  return { stores: storesSnap.size, reports };
}
