import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { addDaysYMD, getKSTTodayYMD } from '@/lib/dateUtils';
import { ensureSalesAlertChannel, postMessengerCard } from '@/lib/messenger/channels.server';
import { getPosAlertSettings } from '@/lib/pos/posAlertSettings';
import type { SaleEventInput } from '@/lib/pos/saleEventNotify.server';
import { formatSaleTimeDisplay } from '@/lib/pos/saleEventNotify.server';

export interface FirstPurchaseEvent extends SaleEventInput {
  cusCode?: string;
  cusName?: string;
}

function customerDocId(storeId: string, cusCode: string): string {
  return `${storeId}_${cusCode}`.replace(/[/\\#?]/g, '_').slice(0, 500);
}

function dedupeDocId(storeId: string, date: string, cusCode: string): string {
  return `${storeId}_${date}_${cusCode}`.replace(/[/\\#?]/g, '_').slice(0, 500);
}

export function buildFirstPurchaseMessage(event: FirstPurchaseEvent): string {
  const label = event.cusName?.trim() || event.cusCode || '신규 고객';
  return [
    '🆕 신규 고객 방문',
    `고객: ${label}`,
    `금액: ${Math.round(event.amount).toLocaleString('ko-KR')}원`,
    `시간: ${formatSaleTimeDisplay(event.saleTime)}`,
  ].join('\n');
}

async function hadPriorVisits(storeId: string, cusCode: string, date: string): Promise<boolean> {
  try {
    const snap = await adminDb.collection('pos_customer_sales')
      .where('storeId', '==', storeId)
      .where('cusCode', '==', cusCode)
      .limit(30)
      .get();
    return snap.docs.some(d => String(d.data().date || '') < date);
  } catch {
    const reg = await adminDb.collection('pos_new_customers').doc(customerDocId(storeId, cusCode)).get();
    return reg.exists;
  }
}

export async function processFirstPurchaseEvents(
  storeId: string,
  date: string,
  events: FirstPurchaseEvent[],
): Promise<{ detected: number; skipped: number; disabled?: boolean }> {
  const settings = await getPosAlertSettings(storeId);
  if (!settings.firstPurchaseEnabled) {
    return { detected: 0, skipped: events.length, disabled: true };
  }

  const memberEvents = events.filter(e => String(e.cusCode || '').trim());
  if (!memberEvents.length) return { detected: 0, skipped: 0 };

  const roomId = await ensureSalesAlertChannel(storeId);
  let detected = 0;

  for (const event of memberEvents) {
    const cusCode = String(event.cusCode || '').trim();
    const cusName = String(event.cusName || '').trim();
    const dedupeRef = adminDb.collection('pos_first_purchase_sent').doc(dedupeDocId(storeId, date, cusCode));
    if ((await dedupeRef.get()).exists) continue;

    const registryRef = adminDb.collection('pos_new_customers').doc(customerDocId(storeId, cusCode));
    if ((await registryRef.get()).exists) {
      await dedupeRef.set({ storeId, date, cusCode, skipped: 'already_registered', sentAt: FieldValue.serverTimestamp() });
      continue;
    }

    if (await hadPriorVisits(storeId, cusCode, date)) {
      await dedupeRef.set({ storeId, date, cusCode, skipped: 'prior_visits', sentAt: FieldValue.serverTimestamp() });
      continue;
    }

    const message = buildFirstPurchaseMessage(event);
    const displayLabel = cusName || cusCode;

    await registryRef.set({
      storeId,
      cusCode,
      name: cusName || cusCode,
      grade: '신규',
      firstVisitDate: date,
      firstSaleNum: event.saleNum,
      firstAmount: event.amount,
      detectedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    await adminDb.collection('pos_customers').doc(customerDocId(storeId, cusCode)).set({
      storeId,
      cusCode,
      name: cusName || cusCode,
      grade: '신규',
      pitayaGrade: '일반',
      firstVisitDate: date,
      source: 'first_visit_detect',
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    await adminDb.collection('notifications').add({
      storeId,
      type: 'pos_first_purchase',
      message,
      cusCode,
      cusName: displayLabel,
      amount: event.amount,
      saleNum: event.saleNum,
      saleDate: date,
      createdAt: FieldValue.serverTimestamp(),
    });

    await postMessengerCard({
      roomId,
      type: 'sales_report',
      text: message.replace(/\n/g, ' · '),
      cardData: {
        title: '🆕 신규 고객 방문',
        fields: [
          { label: '고객', value: displayLabel },
          { label: '금액', value: `${Math.round(event.amount).toLocaleString('ko-KR')}원` },
          { label: '시간', value: formatSaleTimeDisplay(event.saleTime) },
        ],
      },
    });

    await dedupeRef.set({
      storeId, date, cusCode, cusName: displayLabel, amount: event.amount, sentAt: FieldValue.serverTimestamp(),
    });
    detected += 1;
  }

  return { detected, skipped: memberEvents.length - detected };
}

export async function sendNewCustomerDailyReport(storeId: string, reportDate: string): Promise<{
  count: number;
  notified: boolean;
}> {
  const settings = await getPosAlertSettings(storeId);
  if (!settings.firstPurchaseEnabled) return { count: 0, notified: false };

  let customers: Array<{ cusCode: string; name: string }> = [];
  try {
    const snap = await adminDb.collection('pos_new_customers')
      .where('storeId', '==', storeId)
      .where('firstVisitDate', '==', reportDate)
      .get();
    customers = snap.docs.map(d => {
      const data = d.data();
      return { cusCode: String(data.cusCode || ''), name: String(data.name || data.cusCode || '') };
    });
  } catch {
    const snap = await adminDb.collection('pos_new_customers')
      .where('storeId', '==', storeId)
      .limit(500)
      .get();
    customers = snap.docs
      .map(d => d.data())
      .filter(d => d.firstVisitDate === reportDate)
      .map(d => ({ cusCode: String(d.cusCode || ''), name: String(d.name || d.cusCode || '') }));
  }

  if (!customers.length) return { count: 0, notified: false };

  const dedupeRef = adminDb.collection('pos_new_customer_report_sent').doc(`${storeId}_${reportDate}`);
  if ((await dedupeRef.get()).exists) return { count: customers.length, notified: false };

  const names = customers.slice(0, 5).map(c => c.name).join(', ');
  const suffix = customers.length > 5 ? ` 외 ${customers.length - 5}명` : '';
  const message = `📋 어제 신규 고객 ${customers.length}명\n${names}${suffix}`;

  const roomId = await ensureSalesAlertChannel(storeId);
  await postMessengerCard({
    roomId,
    type: 'sales_report',
    text: message.replace(/\n/g, ' · '),
    cardData: {
      title: `📋 ${reportDate} 신규 고객`,
      fields: [
        { label: '신규 고객', value: `${customers.length}명` },
        { label: '목록', value: names + suffix },
      ],
    },
  });

  await dedupeRef.set({ storeId, reportDate, count: customers.length, sentAt: FieldValue.serverTimestamp() });
  return { count: customers.length, notified: true };
}

export async function runNewCustomerDailyReportAllStores(): Promise<{
  stores: number;
  reports: number;
  totalNew: number;
}> {
  const today = getKSTTodayYMD();
  const yesterday = addDaysYMD(today, -1);
  const storesSnap = await adminDb.collection('stores').where('status', '==', 'active').get();
  let reports = 0;
  let totalNew = 0;

  for (const storeDoc of storesSnap.docs) {
    try {
      const result = await sendNewCustomerDailyReport(storeDoc.id, yesterday);
      if (result.notified) reports += 1;
      totalNew += result.count;
    } catch (e) {
      console.error('[new-customer-report]', storeDoc.id, e);
    }
  }

  return { stores: storesSnap.size, reports, totalNew };
}
