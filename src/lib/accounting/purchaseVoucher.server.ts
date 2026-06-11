import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import type { AccountingVoucher, VoucherLine, VoucherType } from '@/lib/accounting/types';
import {
  buildPurchaseVoucherLines,
  DEFAULT_PURCHASE_VOUCHER_PATTERN,
  type PurchaseVoucherPattern,
  type PurchaseVoucherSource,
} from '@/lib/accounting/purchaseVoucherPattern';

function sumLines(lines: VoucherLine[]) {
  let totalDebit = 0;
  let totalCredit = 0;
  for (const l of lines) {
    totalDebit += Number(l.debit || 0);
    totalCredit += Number(l.credit || 0);
  }
  return { totalDebit, totalCredit };
}

export async function nextVoucherNo(storeId: string, date: string): Promise<string> {
  const prefix = date.replace(/-/g, '');
  const snap = await adminDb.collection('accounting_vouchers')
    .where('storeId', '==', storeId)
    .where('voucherDate', '==', date)
    .get();

  let max = 0;
  for (const d of snap.docs) {
    const no = String(d.data().voucherNo || '');
    const seq = parseInt(no.split('-').pop() || '0', 10);
    if (seq > max) max = seq;
  }
  return `${prefix}-${String(max + 1).padStart(3, '0')}`;
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

export async function loadPurchaseVoucherPattern(storeId: string): Promise<PurchaseVoucherPattern> {
  const doc = await adminDb.collection('accounting_settings').doc(storeId).get();
  const saved = doc.data()?.purchaseVoucherPattern;
  if (saved?.lines?.length) {
    return {
      splitVat: saved.splitVat !== false,
      lines: saved.lines,
    };
  }
  return DEFAULT_PURCHASE_VOUCHER_PATTERN;
}

export interface ProcessPurchaseVoucherResult {
  purchaseId: string;
  ok: boolean;
  voucherId?: string;
  voucherNo?: string;
  error?: string;
}

export async function processPurchaseToVoucher(params: {
  storeId: string;
  uid: string;
  purchaseId: string;
  pattern?: PurchaseVoucherPattern;
  autoApprove?: boolean;
}): Promise<ProcessPurchaseVoucherResult> {
  const { storeId, uid, purchaseId, autoApprove } = params;
  const pattern = params.pattern || await loadPurchaseVoucherPattern(storeId);

  const purchaseSnap = await adminDb.collection('purchase_records').doc(purchaseId).get();
  if (!purchaseSnap.exists) {
    return { purchaseId, ok: false, error: '매입 전표 없음' };
  }

  const data = purchaseSnap.data()!;
  if (String(data.storeId) !== storeId) {
    return { purchaseId, ok: false, error: '매장 불일치' };
  }
  if (data.accountingVoucherId) {
    return { purchaseId, ok: false, error: '이미 전표 처리됨' };
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
    return { purchaseId, ok: false, error: '매입일자 없음' };
  }

  const accountNames = await loadAccountNameMap(storeId);
  const lines = buildPurchaseVoucherLines(purchase, pattern, accountNames);
  const { totalDebit, totalCredit } = sumLines(lines);

  if (totalDebit !== totalCredit || totalDebit <= 0) {
    return { purchaseId, ok: false, error: '분개 금액 불균형' };
  }

  const settingsSnap = await adminDb.collection('accounting_settings').doc(storeId).get();
  const approvalRequired = settingsSnap.data()?.voucherApprovalRequired !== false;
  const status = autoApprove || !approvalRequired ? 'approved' : 'pending';

  const voucherNo = await nextVoucherNo(storeId, purchase.purchaseDate);
  const description = `매입전표 ${purchase.supplierName}${purchase.invoiceNumber ? ` #${purchase.invoiceNumber}` : ''}`;

  const voucherRef = await adminDb.collection('accounting_vouchers').add({
    storeId,
    voucherNo,
    voucherDate: purchase.purchaseDate,
    voucherType: 'purchase' as VoucherType,
    status,
    description,
    lines,
    totalDebit,
    totalCredit,
    sourceType: 'purchase',
    sourceId: purchaseId,
    createdBy: uid,
    ...(status === 'approved' ? { approvedBy: uid, approvedAt: FieldValue.serverTimestamp() } : {}),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await purchaseSnap.ref.update({
    accountingVoucherId: voucherRef.id,
    accountingVoucherNo: voucherNo,
    accountingVoucherStatus: status,
    accountingLinkedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { purchaseId, ok: true, voucherId: voucherRef.id, voucherNo };
}

export async function listPurchasesForVoucherIntegration(
  storeId: string,
  opts?: { startDate?: string; endDate?: string; linked?: 'all' | 'pending' | 'done' },
) {
  const snap = await adminDb.collection('purchase_records')
    .where('storeId', '==', storeId)
    .limit(500)
    .get();

  let rows = snap.docs.map(d => {
    const data = d.data();
    return {
      id: d.id,
      purchaseDate: String(data.purchaseDate || ''),
      supplierName: String(data.supplierName || ''),
      invoiceNumber: String(data.invoiceNumber || ''),
      supplyAmount: Number(data.supplyAmount || 0),
      taxAmount: Number(data.taxAmount || 0),
      totalAmount: Number(data.totalAmount || 0),
      memo: String(data.memo || ''),
      accountingVoucherId: data.accountingVoucherId ? String(data.accountingVoucherId) : '',
      accountingVoucherNo: data.accountingVoucherNo ? String(data.accountingVoucherNo) : '',
      accountingVoucherStatus: data.accountingVoucherStatus ? String(data.accountingVoucherStatus) : '',
    };
  });

  if (opts?.startDate) rows = rows.filter(r => r.purchaseDate >= opts.startDate!);
  if (opts?.endDate) rows = rows.filter(r => r.purchaseDate <= opts.endDate!);

  if (opts?.linked === 'pending') {
    rows = rows.filter(r => !r.accountingVoucherId);
  } else if (opts?.linked === 'done') {
    rows = rows.filter(r => !!r.accountingVoucherId);
  }

  return rows.sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate));
}

export type { PurchaseVoucherPattern, PurchaseVoucherSource, AccountingVoucher };
