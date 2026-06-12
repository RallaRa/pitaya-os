import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { loadAccountingSettings } from '@/lib/accounting/accountingSettings.server';
import {
  buildExpenseVoucherLines,
  type ExpenseVoucherSource,
} from '@/lib/accounting/expenseVoucherPattern';
import type {
  AccountingAutoVoucher,
  AutoVoucherQueueStatus,
  AutoVoucherSourceType,
  VoucherLine,
  VoucherType,
} from '@/lib/accounting/types';
import {
  buildPurchaseVoucherLines,
  type PurchaseVoucherSource,
} from '@/lib/accounting/purchaseVoucherPattern';
import {
  isAccountingPeriodClosed,
  nextVoucherNo,
} from '@/lib/accounting/voucher.server';
import {
  listPurchasesForVoucherIntegration,
  loadPurchaseVoucherPattern,
} from '@/lib/accounting/purchaseVoucher.server';
import {
  buildSalesVoucherLines,
  resolveSalesAmounts,
} from '@/lib/accounting/salesVoucherPattern';
import {
  listSalesForVoucherIntegration,
  loadSalesVoucherPattern,
  mapDailyReportToSalesSource,
  pickBestDailyReportForDate,
} from '@/lib/accounting/salesVoucher.server';

function sumLines(lines: VoucherLine[]) {
  let totalDebit = 0;
  let totalCredit = 0;
  for (const l of lines) {
    totalDebit += Number(l.debit || 0);
    totalCredit += Number(l.credit || 0);
  }
  return { totalDebit, totalCredit };
}

async function loadAccountNameMap(storeId: string): Promise<Map<string, string>> {
  const snap = await adminDb.collection('accounting_accounts').where('storeId', '==', storeId).get();
  const map = new Map<string, string>();
  for (const doc of snap.docs) {
    const d = doc.data();
    map.set(String(d.code || ''), String(d.name || ''));
  }
  return map;
}

async function findPendingAutoVoucherBySource(
  storeId: string,
  sourceType: AutoVoucherSourceType,
  sourceId: string,
) {
  const snap = await adminDb.collection('accounting_auto_vouchers')
    .where('storeId', '==', storeId)
    .where('sourceType', '==', sourceType)
    .where('sourceId', '==', sourceId)
    .where('status', '==', 'pending')
    .limit(1)
    .get();
  return snap.docs[0] || null;
}

export interface EnqueuePurchaseAutoVoucherResult {
  ok: boolean;
  autoVoucherId?: string;
  skipped?: boolean;
  error?: string;
}

export async function enqueuePurchaseAutoVoucher(params: {
  storeId: string;
  purchaseId: string;
  uid: string;
  sourceScreen?: string;
}): Promise<EnqueuePurchaseAutoVoucherResult> {
  const { storeId, purchaseId, uid } = params;
  const sourceScreen = params.sourceScreen || '매입입력';

  const purchaseSnap = await adminDb.collection('purchase_records').doc(purchaseId).get();
  if (!purchaseSnap.exists) {
    return { ok: false, error: '매입 전표 없음' };
  }

  const data = purchaseSnap.data()!;
  if (String(data.storeId) !== storeId) {
    return { ok: false, error: '매장 불일치' };
  }
  if (data.accountingVoucherId) {
    return { ok: false, skipped: true, error: '이미 회계전표 처리됨' };
  }

  const workflowStatus = String(data.taxDocWorkflowStatus || 'pending_review');
  if (workflowStatus === 'pending_review') {
    return { ok: false, error: '세금계산서 처리 후 자동전표로 넘길 수 있습니다.' };
  }
  if (workflowStatus === 'excluded') {
    return { ok: false, skipped: true, error: '전표 제외 건' };
  }

  const existingPending = await findPendingAutoVoucherBySource(storeId, 'purchase', purchaseId);
  if (existingPending) {
    return { ok: true, autoVoucherId: existingPending.id, skipped: true };
  }

  const purchase: PurchaseVoucherSource = {
    id: purchaseId,
    purchaseDate: String(data.purchaseDate || ''),
    supplierName: String(data.supplierName || ''),
    invoiceNumber: String(data.invoiceNumber || ''),
    supplyAmount: Number(data.supplyAmount || 0),
    taxAmount: Number(data.taxAmount || 0),
    totalAmount: Number(data.totalAmount || 0),
    memo: String(data.memo || ''),
  };

  if (!purchase.purchaseDate) {
    return { ok: false, error: '매입일자 없음' };
  }

  const pattern = await loadPurchaseVoucherPattern(storeId);
  const accountNames = await loadAccountNameMap(storeId);
  const lines = buildPurchaseVoucherLines(purchase, pattern, accountNames);
  const { totalDebit, totalCredit } = sumLines(lines);

  if (totalDebit !== totalCredit || totalDebit <= 0) {
    return { ok: false, error: '분개 금액 불균형' };
  }

  const description = `매입전표 ${purchase.supplierName}${purchase.invoiceNumber ? ` #${purchase.invoiceNumber}` : ''}`;

  const ref = await adminDb.collection('accounting_auto_vouchers').add({
    storeId,
    sourceType: 'purchase' as AutoVoucherSourceType,
    sourceScreen,
    sourceId: purchaseId,
    status: 'pending' as AutoVoucherQueueStatus,
    voucherDate: purchase.purchaseDate,
    voucherType: 'purchase' as VoucherType,
    description,
    lines,
    totalDebit,
    totalCredit,
    sourceSummary: {
      supplierName: purchase.supplierName,
      invoiceNumber: purchase.invoiceNumber,
      totalAmount: purchase.totalAmount,
      supplyAmount: purchase.supplyAmount,
      taxAmount: purchase.taxAmount,
    },
    createdBy: uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await purchaseSnap.ref.update({
    accountingAutoVoucherId: ref.id,
    updatedAt: FieldValue.serverTimestamp(),
  });

  const settings = await loadAccountingSettings(storeId);
  if (!settings.voucherApprovalRequired) {
    await approveAutoVoucher({ storeId, uid, autoVoucherId: ref.id });
  }

  return { ok: true, autoVoucherId: ref.id };
}

export interface EnqueueExpenseAutoVoucherResult {
  ok: boolean;
  autoVoucherId?: string;
  skipped?: boolean;
  error?: string;
}

export async function enqueueExpenseAutoVoucher(params: {
  storeId: string;
  evidenceId: string;
  uid: string;
  sourceScreen?: string;
}): Promise<EnqueueExpenseAutoVoucherResult> {
  const { storeId, evidenceId, uid } = params;
  const sourceScreen = params.sourceScreen || '카드경비';

  const evSnap = await adminDb.collection('purchase_evidence').doc(evidenceId).get();
  if (!evSnap.exists) return { ok: false, error: '카드 증빙 없음' };

  const data = evSnap.data()!;
  if (String(data.storeId) !== storeId) return { ok: false, error: '매장 불일치' };
  if (data.sourceType !== 'card') return { ok: false, error: '카드 증빙만 경비 전표 가능' };
  if (data.matchedPurchaseId) return { ok: false, skipped: true, error: '매입 매칭된 카드' };
  if (data.accountingVoucherId) return { ok: false, skipped: true, error: '이미 회계전표 처리됨' };

  const existingPending = await findPendingAutoVoucherBySource(storeId, 'expense', evidenceId);
  if (existingPending) {
    return { ok: true, autoVoucherId: existingPending.id, skipped: true };
  }

  const source: ExpenseVoucherSource = {
    id: evidenceId,
    txnDate: String(data.txnDate || ''),
    merchantName: String(data.merchantName || ''),
    supplyAmount: Number(data.supplyAmount || 0),
    taxAmount: Number(data.taxAmount || 0),
    totalAmount: Number(data.totalAmount || 0),
    memo: String(data.memo || ''),
  };

  if (!source.txnDate || source.totalAmount <= 0) {
    return { ok: false, error: '일자·금액 없음' };
  }

  const accountNames = await loadAccountNameMap(storeId);
  const lines = buildExpenseVoucherLines(source, accountNames);
  const { totalDebit, totalCredit } = sumLines(lines);
  if (totalDebit !== totalCredit || totalDebit <= 0) {
    return { ok: false, error: '분개 금액 불균형' };
  }

  const description = `경비전표 ${source.merchantName} · ${source.totalAmount.toLocaleString()}원`;

  const ref = await adminDb.collection('accounting_auto_vouchers').add({
    storeId,
    sourceType: 'expense' as AutoVoucherSourceType,
    sourceScreen,
    sourceId: evidenceId,
    status: 'pending' as AutoVoucherQueueStatus,
    voucherDate: source.txnDate,
    voucherType: 'payment' as VoucherType,
    description,
    lines,
    totalDebit,
    totalCredit,
    sourceSummary: {
      merchantName: source.merchantName,
      totalAmount: source.totalAmount,
      supplyAmount: source.supplyAmount,
      taxAmount: source.taxAmount,
      evidenceSource: 'card',
    },
    createdBy: uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await evSnap.ref.update({
    accountingAutoVoucherId: ref.id,
    updatedAt: FieldValue.serverTimestamp(),
  });

  const settings = await loadAccountingSettings(storeId);
  if (!settings.voucherApprovalRequired) {
    await approveAutoVoucher({ storeId, uid, autoVoucherId: ref.id });
  }

  return { ok: true, autoVoucherId: ref.id };
}

/** 매입 미매칭 카드 증빙 → 경비 자동전표 대기열 */
export async function syncCardExpensesToAutoVoucherQueue(
  storeId: string,
  uid: string,
  opts?: { startDate?: string; endDate?: string },
): Promise<{ synced: number; skipped: number; errors: string[] }> {
  const settings = await loadAccountingSettings(storeId);
  if (!settings.autoVoucherFromExpense) {
    return { synced: 0, skipped: 0, errors: [] };
  }

  const snap = await adminDb.collection('purchase_evidence')
    .where('storeId', '==', storeId)
    .where('sourceType', '==', 'card')
    .limit(500)
    .get();

  let cards = snap.docs.filter(d => {
    const data = d.data();
    return !data.matchedPurchaseId && !data.accountingVoucherId && Number(data.totalAmount || 0) > 0;
  });

  if (opts?.startDate) {
    cards = cards.filter(d => String(d.data().txnDate || '') >= opts.startDate!);
  }
  if (opts?.endDate) {
    cards = cards.filter(d => String(d.data().txnDate || '') <= opts.endDate!);
  }

  let synced = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const doc of cards) {
    const result = await enqueueExpenseAutoVoucher({
      storeId,
      evidenceId: doc.id,
      uid,
      sourceScreen: '카드경비',
    });
    if (result.ok && !result.skipped) synced += 1;
    else if (result.skipped) skipped += 1;
    else if (result.error) errors.push(`${doc.id}: ${result.error}`);
  }

  return { synced, skipped, errors };
}

export interface EnqueueSalesAutoVoucherResult {
  ok: boolean;
  autoVoucherId?: string;
  skipped?: boolean;
  error?: string;
}

export async function enqueueSalesAutoVoucher(params: {
  storeId: string;
  salesId: string;
  uid: string;
  sourceScreen?: string;
}): Promise<EnqueueSalesAutoVoucherResult> {
  const { storeId, salesId, uid } = params;
  const sourceScreen = params.sourceScreen || '일별매출집계';

  const reportSnap = await adminDb.collection('daily_reports').doc(salesId).get();
  if (!reportSnap.exists) {
    return { ok: false, error: '매출 일보 없음' };
  }

  const data = reportSnap.data()!;
  if (String(data.storeId) !== storeId) {
    return { ok: false, error: '매장 불일치' };
  }
  if (data.accountingVoucherId) {
    return { ok: false, skipped: true, error: '이미 회계전표 처리됨' };
  }

  const existingPending = await findPendingAutoVoucherBySource(storeId, 'sales', salesId);
  if (existingPending) {
    return { ok: true, autoVoucherId: existingPending.id, skipped: true };
  }

  const sale = mapDailyReportToSalesSource(salesId, data);
  if (!sale.reportDate) return { ok: false, error: '매출일자 없음' };
  if (sale.netSales <= 0) return { ok: false, error: '매출 금액 없음' };

  const pattern = await loadSalesVoucherPattern(storeId);
  const accountNames = await loadAccountNameMap(storeId);
  const lines = buildSalesVoucherLines(sale, pattern, accountNames);
  const { totalDebit, totalCredit } = sumLines(lines);

  if (totalDebit !== totalCredit || totalDebit <= 0) {
    return { ok: false, error: '분개 금액 불균형' };
  }

  const amounts = resolveSalesAmounts(sale);
  const description = `매출전표 ${sale.reportDate} · ${amounts.total.toLocaleString()}원`;

  const ref = await adminDb.collection('accounting_auto_vouchers').add({
    storeId,
    sourceType: 'sales' as AutoVoucherSourceType,
    sourceScreen,
    sourceId: salesId,
    status: 'pending' as AutoVoucherQueueStatus,
    voucherDate: sale.reportDate,
    voucherType: 'sales' as VoucherType,
    description,
    lines,
    totalDebit,
    totalCredit,
    sourceSummary: {
      reportDate: sale.reportDate,
      totalAmount: amounts.total,
      supplyAmount: amounts.supply,
      taxAmount: amounts.tax,
      cashSale: amounts.cash,
      cardSale: amounts.card,
      customerCount: sale.customerCount,
    },
    createdBy: uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await reportSnap.ref.update({
    accountingAutoVoucherId: ref.id,
    updatedAt: FieldValue.serverTimestamp(),
  });

  const settings = await loadAccountingSettings(storeId);
  if (!settings.voucherApprovalRequired) {
    await approveAutoVoucher({ storeId, uid, autoVoucherId: ref.id });
  }

  return { ok: true, autoVoucherId: ref.id };
}

/** 특정 일자 매출 → 자동전표 대기열 (크론·수동 동기화) */
export async function enqueueDailySalesAutoVoucher(params: {
  storeId: string;
  reportDate: string;
  uid: string;
  sourceScreen?: string;
}): Promise<EnqueueSalesAutoVoucherResult> {
  const picked = await pickBestDailyReportForDate(params.storeId, params.reportDate);
  if (!picked) return { ok: false, error: `${params.reportDate} 매출 집계 없음` };
  return enqueueSalesAutoVoucher({
    storeId: params.storeId,
    salesId: picked.id,
    uid: params.uid,
    sourceScreen: params.sourceScreen || '일별매출집계',
  });
}

export async function syncSalesToAutoVoucherQueue(
  storeId: string,
  uid: string,
  opts?: { startDate?: string; endDate?: string },
): Promise<{ synced: number; skipped: number; errors: string[] }> {
  const sales = await listSalesForVoucherIntegration(storeId, {
    linked: 'pending',
    startDate: opts?.startDate,
    endDate: opts?.endDate,
  });

  let synced = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const s of sales) {
    const result = await enqueueSalesAutoVoucher({
      storeId,
      salesId: s.id,
      uid,
      sourceScreen: '일별매출집계',
    });
    if (result.ok && !result.skipped) synced += 1;
    else if (result.skipped) skipped += 1;
    else if (result.error) errors.push(`${s.reportDate}: ${result.error}`);
  }

  return { synced, skipped, errors };
}

export async function syncPurchasesToAutoVoucherQueue(
  storeId: string,
  uid: string,
): Promise<{ synced: number; skipped: number; errors: string[] }> {
  const settings = await loadAccountingSettings(storeId);
  if (!settings.autoVoucherFromPurchase) {
    return { synced: 0, skipped: 0, errors: [] };
  }

  const purchases = await listPurchasesForVoucherIntegration(storeId, { linked: 'pending' });
  let synced = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const p of purchases) {
    const snap = await adminDb.collection('purchase_records').doc(p.id).get();
    const status = String(snap.data()?.taxDocWorkflowStatus || 'pending_review');
    if (status !== 'verified') continue;

    const result = await enqueuePurchaseAutoVoucher({
      storeId,
      purchaseId: p.id,
      uid,
      sourceScreen: '세금계산서처리',
    });
    if (result.ok && !result.skipped) {
      await adminDb.collection('purchase_records').doc(p.id).update({
        taxDocWorkflowStatus: 'released',
        taxDocReleasedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      synced += 1;
    } else if (result.skipped) skipped += 1;
    else if (result.error) errors.push(`${p.id}: ${result.error}`);
  }

  return { synced, skipped, errors };
}

export async function listAutoVoucherQueue(
  storeId: string,
  opts?: { status?: AutoVoucherQueueStatus | 'all'; startDate?: string; endDate?: string },
): Promise<AccountingAutoVoucher[]> {
  let q = adminDb.collection('accounting_auto_vouchers').where('storeId', '==', storeId);
  if (opts?.status && opts.status !== 'all') {
    q = q.where('status', '==', opts.status) as typeof q;
  }

  const snap = await q.limit(500).get();
  let rows = snap.docs.map(d => ({ id: d.id, ...d.data() } as AccountingAutoVoucher));

  if (opts?.startDate) rows = rows.filter(r => r.voucherDate >= opts.startDate!);
  if (opts?.endDate) rows = rows.filter(r => r.voucherDate <= opts.endDate!);

  return rows.sort((a, b) => {
    const dateCmp = String(b.voucherDate).localeCompare(String(a.voucherDate));
    if (dateCmp !== 0) return dateCmp;
    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  });
}

export interface ProcessAutoVoucherResult {
  id: string;
  ok: boolean;
  voucherId?: string;
  voucherNo?: string;
  error?: string;
}

export async function approveAutoVoucher(params: {
  storeId: string;
  uid: string;
  autoVoucherId: string;
}): Promise<ProcessAutoVoucherResult> {
  const { storeId, uid, autoVoucherId } = params;
  const ref = adminDb.collection('accounting_auto_vouchers').doc(autoVoucherId);
  const snap = await ref.get();

  if (!snap.exists) return { id: autoVoucherId, ok: false, error: '자동전표 없음' };

  const auto = { id: snap.id, ...snap.data() } as AccountingAutoVoucher;
  if (auto.storeId !== storeId) return { id: autoVoucherId, ok: false, error: '매장 불일치' };
  if (auto.status !== 'pending') return { id: autoVoucherId, ok: false, error: '이미 처리됨' };

  if (await isAccountingPeriodClosed(storeId, auto.voucherDate)) {
    return { id: autoVoucherId, ok: false, error: '마감된 회계기간입니다.' };
  }

  if (auto.sourceType === 'purchase') {
    const purchaseSnap = await adminDb.collection('purchase_records').doc(auto.sourceId).get();
    if (purchaseSnap.exists && purchaseSnap.data()?.accountingVoucherId) {
      return { id: autoVoucherId, ok: false, error: '매입이 이미 회계전표와 연결됨' };
    }
  }

  if (auto.sourceType === 'sales' || auto.sourceType === 'pos') {
    const reportSnap = await adminDb.collection('daily_reports').doc(auto.sourceId).get();
    if (reportSnap.exists && reportSnap.data()?.accountingVoucherId) {
      return { id: autoVoucherId, ok: false, error: '매출이 이미 회계전표와 연결됨' };
    }
  }

  if (auto.sourceType === 'expense') {
    const evSnap = await adminDb.collection('purchase_evidence').doc(auto.sourceId).get();
    if (evSnap.exists && evSnap.data()?.accountingVoucherId) {
      return { id: autoVoucherId, ok: false, error: '카드 증빙이 이미 회계전표와 연결됨' };
    }
  }

  const voucherNo = await nextVoucherNo(storeId, auto.voucherDate);
  const voucherRef = await adminDb.collection('accounting_vouchers').add({
    storeId,
    voucherNo,
    voucherDate: auto.voucherDate,
    voucherType: auto.voucherType,
    status: 'approved',
    description: auto.description || '',
    lines: auto.lines,
    totalDebit: auto.totalDebit,
    totalCredit: auto.totalCredit,
    sourceType: auto.sourceType === 'purchase'
      ? 'purchase'
      : auto.sourceType === 'sales' || auto.sourceType === 'pos'
        ? 'pos'
        : auto.sourceType === 'expense'
          ? 'expense'
          : 'manual',
    sourceId: auto.sourceId,
    autoVoucherId: autoVoucherId,
    createdBy: auto.createdBy || uid,
    approvedBy: uid,
    approvedAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  if (auto.sourceType === 'purchase') {
    await adminDb.collection('purchase_records').doc(auto.sourceId).set({
      accountingVoucherId: voucherRef.id,
      accountingVoucherNo: voucherNo,
      accountingVoucherStatus: 'approved',
      accountingLinkedAt: FieldValue.serverTimestamp(),
      accountingAutoVoucherId: autoVoucherId,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  if (auto.sourceType === 'sales' || auto.sourceType === 'pos') {
    await adminDb.collection('daily_reports').doc(auto.sourceId).set({
      accountingVoucherId: voucherRef.id,
      accountingVoucherNo: voucherNo,
      accountingVoucherStatus: 'approved',
      accountingLinkedAt: FieldValue.serverTimestamp(),
      accountingAutoVoucherId: autoVoucherId,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  if (auto.sourceType === 'expense') {
    await adminDb.collection('purchase_evidence').doc(auto.sourceId).set({
      accountingVoucherId: voucherRef.id,
      accountingVoucherNo: voucherNo,
      accountingVoucherStatus: 'approved',
      accountingLinkedAt: FieldValue.serverTimestamp(),
      accountingAutoVoucherId: autoVoucherId,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  await ref.update({
    status: 'approved',
    voucherId: voucherRef.id,
    voucherNo,
    approvedBy: uid,
    approvedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { id: autoVoucherId, ok: true, voucherId: voucherRef.id, voucherNo };
}

export async function rejectAutoVoucher(params: {
  storeId: string;
  uid: string;
  autoVoucherId: string;
  reason?: string;
}): Promise<ProcessAutoVoucherResult> {
  const { storeId, uid, autoVoucherId, reason } = params;
  const ref = adminDb.collection('accounting_auto_vouchers').doc(autoVoucherId);
  const snap = await ref.get();

  if (!snap.exists) return { id: autoVoucherId, ok: false, error: '자동전표 없음' };

  const auto = snap.data() as AccountingAutoVoucher;
  if (auto.storeId !== storeId) return { id: autoVoucherId, ok: false, error: '매장 불일치' };
  if (auto.status !== 'pending') return { id: autoVoucherId, ok: false, error: '이미 처리됨' };

  await ref.update({
    status: 'rejected',
    rejectReason: reason || '',
    rejectedBy: uid,
    rejectedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { id: autoVoucherId, ok: true };
}

export async function getAutoVoucherById(
  storeId: string,
  id: string,
): Promise<AccountingAutoVoucher | null> {
  const snap = await adminDb.collection('accounting_auto_vouchers').doc(id).get();
  if (!snap.exists) return null;
  const data = { id: snap.id, ...snap.data() } as AccountingAutoVoucher;
  if (data.storeId !== storeId) return null;
  return data;
}
