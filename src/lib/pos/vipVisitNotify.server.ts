import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { normDateYMD } from '@/lib/dateUtils';
import { ensureSalesAlertChannel, postMessengerCard } from '@/lib/messenger/channels.server';
import { getPosAlertSettings } from '@/lib/pos/posAlertSettings';
import type { SaleEventInput } from '@/lib/pos/saleEventNotify.server';
import { formatSaleTimeDisplay } from '@/lib/pos/saleEventNotify.server';
import type { PitayaGrade } from '@/lib/customerGrade';

export interface VipVisitEvent extends SaleEventInput {
  cusCode?: string;
  cusName?: string;
}

function customerDocId(storeId: string, cusCode: string): string {
  return `${storeId}_${cusCode}`.replace(/[/\\#?]/g, '_').slice(0, 500);
}

function dedupeDocId(storeId: string, date: string, cusCode: string): string {
  return `${storeId}_${date}_${cusCode}`.replace(/[/\\#?]/g, '_').slice(0, 500);
}

function daysBetween(fromYmd: string, toYmd: string): number {
  if (!fromYmd || !toYmd) return 999;
  const a = new Date(`${fromYmd.slice(0, 10)}T12:00:00+09:00`).getTime();
  const b = new Date(`${toYmd.slice(0, 10)}T12:00:00+09:00`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 999;
  return Math.floor((b - a) / 86400000);
}

export function isDaytimeVisitAlertWindow(saleTime?: string, now = new Date()): boolean {
  const digits = String(saleTime || '').replace(/\D/g, '');
  let hour = 12;
  if (digits.length >= 2) {
    hour = parseInt(digits.slice(0, 2), 10);
  } else {
    hour = parseInt(
      new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', hour12: false }).format(now),
      10,
    );
  }
  return hour >= 9 && hour < 21;
}

export function buildVipVisitMessage(params: {
  grade: PitayaGrade | string;
  name: string;
  daysSinceLastVisit: number | null;
  totalPurchase: number;
}): string {
  const daysLabel = params.daysSinceLastVisit != null
    ? `${params.daysSinceLastVisit}일 전`
    : '정보 없음';
  const icon = params.grade === 'VIP' ? '⭐' : '💛';
  return [
    `${icon} ${params.grade} 고객 방문`,
    `이름: ${params.name}`,
    `최근 방문: ${daysLabel}`,
    `누적 구매: ${Math.round(params.totalPurchase).toLocaleString('ko-KR')}원`,
  ].join('\n');
}

export async function processVipVisitEvents(
  storeId: string,
  date: string,
  events: VipVisitEvent[],
): Promise<{ notified: number; skipped: number; disabled?: boolean }> {
  const settings = await getPosAlertSettings(storeId);
  if (!settings.vipVisitEnabled && !settings.regularVisitEnabled) {
    return { notified: 0, skipped: events.length, disabled: true };
  }

  const memberEvents = events.filter(e => String(e.cusCode || '').trim());
  if (!memberEvents.length) return { notified: 0, skipped: 0 };

  const roomId = await ensureSalesAlertChannel(storeId);
  let notified = 0;

  for (const event of memberEvents) {
    const cusCode = String(event.cusCode || '').trim();
    if (!isDaytimeVisitAlertWindow(event.saleTime)) continue;

    const dedupeRef = adminDb.collection('pos_vip_visit_sent').doc(dedupeDocId(storeId, date, cusCode));
    if ((await dedupeRef.get()).exists) continue;

    const custDoc = await adminDb.collection('pos_customers').doc(customerDocId(storeId, cusCode)).get();
    if (!custDoc.exists) continue;

    const cust = custDoc.data() || {};
    const pitayaGrade = String(cust.pitayaGrade || cust.grade || '일반') as PitayaGrade;
    const isVip = pitayaGrade === 'VIP';
    const isRegular = pitayaGrade === '단골';

    if (isVip && !settings.vipVisitEnabled) continue;
    if (isRegular && !settings.regularVisitEnabled) continue;
    if (!isVip && !isRegular) continue;

    const name = String(event.cusName || cust.name || cusCode);
    const lastVisit = normDateYMD(String(cust.lastVisitDate || ''));
    const daysSince = lastVisit && lastVisit < date
      ? daysBetween(lastVisit, date)
      : (lastVisit === date ? 0 : null);
    const totalPurchase = Number(cust.totalPurchase || 0);

    const message = buildVipVisitMessage({
      grade: pitayaGrade,
      name,
      daysSinceLastVisit: daysSince,
      totalPurchase,
    });

    await adminDb.collection('notifications').add({
      storeId,
      type: isVip ? 'pos_vip_visit' : 'pos_regular_visit',
      message,
      cusCode,
      cusName: name,
      pitayaGrade,
      amount: event.amount,
      saleDate: date,
      createdAt: FieldValue.serverTimestamp(),
    });

    await postMessengerCard({
      roomId,
      type: 'sales_report',
      text: message.replace(/\n/g, ' · '),
      cardData: {
        title: isVip ? '⭐ VIP 고객 방문' : '💛 단골 고객 방문',
        fields: [
          { label: '이름', value: name },
          { label: '최근 방문', value: daysSince != null ? `${daysSince}일 전` : '-' },
          { label: '누적 구매', value: `${Math.round(totalPurchase).toLocaleString('ko-KR')}원` },
          { label: '시간', value: formatSaleTimeDisplay(event.saleTime) },
        ],
      },
    });

    await dedupeRef.set({
      storeId, date, cusCode, pitayaGrade, notifiedAt: FieldValue.serverTimestamp(),
    });
    notified += 1;
  }

  return { notified, skipped: memberEvents.length - notified };
}
