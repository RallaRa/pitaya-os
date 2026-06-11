import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { ensureSalesAlertChannel, postMessengerCard } from '@/lib/messenger/channels.server';
import { getPosAlertSettings } from '@/lib/pos/posAlertSettings';

export interface SaleEventItem {
  name: string;
  qty?: number;
  price?: number;
  sellPrice?: number;
  totalPrice?: number;
  discountAmount?: number;
}

export interface SaleEventInput {
  saleNum: string;
  saleTime?: string;
  amount: number;
  items?: SaleEventItem[];
  itemSummary?: string;
  cusCode?: string;
  cusName?: string;
}

function formatAmount(amount: number): string {
  return `${Math.round(amount).toLocaleString('ko-KR')}원`;
}

export function formatSaleTimeDisplay(saleTime?: string): string {
  const raw = String(saleTime || '').trim();
  if (!raw) return '-';
  const digits = raw.replace(/\D/g, '');
  if (digits.length >= 4) return `${digits.slice(0, 2)}:${digits.slice(2, 4)}`;
  return raw.slice(0, 5);
}

export function buildRealtimeSaleMessage(event: SaleEventInput): string {
  const items =
    event.itemSummary
    || event.items?.map(i => {
      const qty = i.qty && i.qty > 0 ? ` ${i.qty}개` : '';
      return `${i.name}${qty}`;
    }).join(', ')
    || '품목 정보 없음';

  return [
    '🛒 방금 결제',
    `품목: ${items}`,
    `금액: ${formatAmount(event.amount)}`,
    `시간: ${formatSaleTimeDisplay(event.saleTime)}`,
  ].join('\n');
}

export async function processSaleEvents(
  storeId: string,
  date: string,
  events: SaleEventInput[],
): Promise<{ processed: number; skipped: number; disabled?: boolean }> {
  const settings = await getPosAlertSettings(storeId);
  if (!settings.realtimeSaleEnabled) {
    return { processed: 0, skipped: events.length, disabled: true };
  }
  if (!events.length) return { processed: 0, skipped: 0 };

  const roomId = await ensureSalesAlertChannel(storeId);
  let processed = 0;

  for (const event of events) {
    const dedupeId = `${storeId}_${date}_${event.saleNum}`.replace(/[/\\#?]/g, '_').slice(0, 500);
    const dedupeRef = adminDb.collection('pos_sale_events_sent').doc(dedupeId);
    if ((await dedupeRef.get()).exists) continue;

    const message = buildRealtimeSaleMessage(event);
    const items = event.items || [];
    const itemLabel = event.itemSummary || items.map(i => i.name).filter(Boolean).join(', ') || '품목 정보 없음';

    await adminDb.collection('notifications').add({
      storeId,
      type: 'pos_realtime_sale',
      message,
      amount: event.amount,
      items,
      saleNum: event.saleNum,
      saleDate: date,
      saleTime: event.saleTime || '',
      createdAt: FieldValue.serverTimestamp(),
    });

    await postMessengerCard({
      roomId,
      type: 'sales_report',
      text: message.replace(/\n/g, ' · '),
      cardData: {
        title: '🛒 방금 결제',
        fields: [
          { label: '품목', value: itemLabel },
          { label: '금액', value: formatAmount(event.amount) },
          { label: '시간', value: formatSaleTimeDisplay(event.saleTime) },
        ],
      },
    });

    await dedupeRef.set({ storeId, date, saleNum: event.saleNum, amount: event.amount, sentAt: FieldValue.serverTimestamp() });
    processed += 1;
  }

  return { processed, skipped: events.length - processed };
}
