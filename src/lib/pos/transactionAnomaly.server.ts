import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { ensureNightMonitorChannel, postMessengerCard } from '@/lib/messenger/channels.server';
import { getPosAlertSettings } from '@/lib/pos/posAlertSettings';
import type { DiscountLineInput } from '@/lib/pos/discountAbuse.server';

export type TransactionAnomalyType =
  | 'negative_amount'
  | 'bulk_qty'
  | 'night_sale'
  | 'heavy_discount';

export interface TransactionAnomalyEventInput {
  saleNum: string;
  saleTime?: string;
  amount: number;
  lines?: DiscountLineInput[];
}

export interface DetectedAnomaly {
  type: TransactionAnomalyType;
  description: string;
}

function dedupeDocId(storeId: string, date: string, saleNum: string, type: string): string {
  return `${storeId}_${date}_${saleNum}_${type}`.replace(/[/\\#?]/g, '_').slice(0, 500);
}

function parseHour(saleTime?: string): number | null {
  const digits = String(saleTime || '').replace(/\D/g, '');
  if (digits.length < 2) return null;
  return parseInt(digits.slice(0, 2), 10);
}

export function detectTransactionAnomalies(event: TransactionAnomalyEventInput): DetectedAnomaly[] {
  const found: DetectedAnomaly[] = [];

  if (Number(event.amount) < 0) {
    found.push({
      type: 'negative_amount',
      description: `마이너스 금액 거래 ${Math.round(event.amount).toLocaleString('ko-KR')}원`,
    });
  }

  const hour = parseHour(event.saleTime);
  if (hour != null && hour >= 0 && hour < 6) {
    found.push({
      type: 'night_sale',
      description: `야간 시간대 거래 (${String(event.saleTime).slice(0, 4).replace(/(\d{2})(\d{2})/, '$1:$2')})`,
    });
  }

  for (const line of event.lines || []) {
    const qty = Number(line.qty || 0);
    if (qty >= 10) {
      found.push({
        type: 'bulk_qty',
        description: `${line.name} ${qty}개 한 거래`,
      });
      break;
    }

    const sell = Number(line.sellPrice || 0);
    const total = Number(line.totalPrice || 0);
    const dec = Number(line.discountAmount || 0);
    const base = sell * Math.max(qty, 1);
    const discountAmt = dec > 0 ? dec : (base > 0 && total > 0 ? base - total : 0);
    if (base > 0 && discountAmt / base >= 0.5) {
      found.push({
        type: 'heavy_discount',
        description: `${line.name} 50% 이상 할인 (${Math.round((discountAmt / base) * 100)}%)`,
      });
      break;
    }
  }

  return found;
}

export function buildAnomalyMessage(event: TransactionAnomalyEventInput, anomaly: DetectedAnomaly): string {
  return [
    '🚨 POS 이상 거래',
    anomaly.description,
    `영수증: ${event.saleNum}`,
    `금액: ${Math.round(event.amount).toLocaleString('ko-KR')}원`,
  ].join('\n');
}

export async function processTransactionAnomalyEvents(
  storeId: string,
  date: string,
  events: TransactionAnomalyEventInput[],
): Promise<{ detected: number; skipped: number; disabled?: boolean }> {
  const settings = await getPosAlertSettings(storeId);
  if (!settings.transactionAnomalyEnabled) {
    return { detected: 0, skipped: events.length, disabled: true };
  }

  const roomId = await ensureNightMonitorChannel(storeId);
  let detected = 0;

  for (const event of events) {
    const anomalies = detectTransactionAnomalies(event);
    for (const anomaly of anomalies) {
      const dedupeRef = adminDb.collection('anomaly_logs').doc(
        dedupeDocId(storeId, date, event.saleNum, anomaly.type),
      );
      if ((await dedupeRef.get()).exists) continue;

      const message = buildAnomalyMessage(event, anomaly);
      await dedupeRef.set({
        storeId,
        date,
        type: anomaly.type,
        description: anomaly.description,
        receiptNo: event.saleNum,
        amount: event.amount,
        saleTime: event.saleTime || '',
        status: 'open',
        detectedAt: FieldValue.serverTimestamp(),
      });

      await adminDb.collection('notifications').add({
        storeId,
        type: 'pos_transaction_anomaly',
        message,
        anomalyType: anomaly.type,
        saleNum: event.saleNum,
        amount: event.amount,
        saleDate: date,
        createdAt: FieldValue.serverTimestamp(),
      });

      await postMessengerCard({
        roomId,
        type: 'stock_alert',
        text: message.replace(/\n/g, ' · '),
        cardData: {
          title: '🚨 POS 이상 거래',
          fields: [
            { label: '유형', value: anomaly.type },
            { label: '내용', value: anomaly.description },
            { label: '영수증', value: event.saleNum },
          ],
        },
      });

      detected += 1;
    }
  }

  return { detected, skipped: events.length };
}
