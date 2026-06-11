import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import type { AccountingPeriod } from '@/lib/accounting/types';

function periodDocId(storeId: string, period: string) {
  return `${storeId}_${period}`;
}

export async function listAccountingPeriods(storeId: string, year?: string): Promise<AccountingPeriod[]> {
  const snap = await adminDb.collection('accounting_periods')
    .where('storeId', '==', storeId)
    .limit(24)
    .get();

  let rows = snap.docs.map(d => d.data() as AccountingPeriod);
  if (year) rows = rows.filter(r => String(r.period).startsWith(`${year}-`));
  return rows.sort((a, b) => String(b.period).localeCompare(String(a.period)));
}

export async function setAccountingPeriodClosed(params: {
  storeId: string;
  period: string;
  closed: boolean;
  uid: string;
}) {
  const { storeId, period, closed, uid } = params;
  const ref = adminDb.collection('accounting_periods').doc(periodDocId(storeId, period));
  await ref.set({
    storeId,
    period,
    closed,
    ...(closed
      ? { closedAt: FieldValue.serverTimestamp(), closedBy: uid }
      : { reopenedAt: FieldValue.serverTimestamp(), reopenedBy: uid }),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

export async function getPaymentSchedule(storeId: string, daysAhead = 60) {
  const snap = await adminDb.collection('purchase_records')
    .where('storeId', '==', storeId)
    .limit(300)
    .get();

  const today = new Date(Date.now() + 9 * 3600_000);
  const end = new Date(today.getTime() + daysAhead * 86400000);

  const rows = snap.docs.map(d => {
    const data = d.data();
    const purchaseDate = String(data.purchaseDate || '');
    const totalAmount = Number(data.totalAmount || 0);
    if (!purchaseDate || totalAmount <= 0) return null;

    const due = new Date(`${purchaseDate}T00:00:00+09:00`);
    due.setDate(due.getDate() + 30);

    return {
      id: d.id,
      supplierName: String(data.supplierName || ''),
      purchaseDate,
      dueDate: due.toISOString().slice(0, 10),
      totalAmount,
      invoiceNumber: String(data.invoiceNumber || ''),
      accountingVoucherNo: String(data.accountingVoucherNo || ''),
      status: data.accountingVoucherId ? '전표반영' : '미반영',
    };
  }).filter(Boolean) as Array<{
    id: string;
    supplierName: string;
    purchaseDate: string;
    dueDate: string;
    totalAmount: number;
    invoiceNumber: string;
    accountingVoucherNo: string;
    status: string;
  }>;

  return rows
    .filter(r => {
      const due = new Date(`${r.dueDate}T00:00:00+09:00`);
      return due >= today && due <= end;
    })
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
