import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import type { VoucherType } from '@/lib/accounting/types';
import {
  buildSalesVoucherLines,
  DEFAULT_SALES_VOUCHER_PATTERN,
  resolveSalesAmounts,
  type SalesVoucherSource,
} from '@/lib/accounting/salesVoucherPattern';
import type { AutoVoucherPattern } from '@/lib/accounting/autoVoucherPattern';
import { nextVoucherNo } from '@/lib/accounting/purchaseVoucher.server';

function sumLines(lines: { debit?: number; credit?: number }[]) {
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

export async function loadSalesVoucherPattern(storeId: string): Promise<AutoVoucherPattern> {
  const doc = await adminDb.collection('accounting_settings').doc(storeId).get();
  const saved = doc.data()?.salesVoucherPattern;
  if (saved?.lines?.length) {
    return { splitVat: saved.splitVat !== false, lines: saved.lines };
  }
  return DEFAULT_SALES_VOUCHER_PATTERN;
}

export interface ProcessSalesVoucherResult {
  salesId: string;
  ok: boolean;
  voucherId?: string;
  voucherNo?: string;
  error?: string;
}

export async function processSalesToVoucher(params: {
  storeId: string;
  uid: string;
  salesId: string;
  pattern?: AutoVoucherPattern;
  autoApprove?: boolean;
}): Promise<ProcessSalesVoucherResult> {
  const { storeId, uid, salesId, autoApprove } = params;
  const pattern = params.pattern || await loadSalesVoucherPattern(storeId);

  const snap = await adminDb.collection('daily_reports').doc(salesId).get();
  if (!snap.exists) return { salesId, ok: false, error: '매출 일보 없음' };

  const data = snap.data()!;
  if (String(data.storeId) !== storeId) return { salesId, ok: false, error: '매장 불일치' };
  if (data.accountingVoucherId) return { salesId, ok: false, error: '이미 전표 처리됨' };

  const netSales = Number(data.netSales ?? data.netSale ?? data.totalSales ?? 0);
  if (netSales <= 0) return { salesId, ok: false, error: '매출 금액 없음' };

  const sale: SalesVoucherSource = {
    id: salesId,
    reportDate: String(data.reportDate || ''),
    netSales,
    totalSales: Number(data.totalSales || 0),
    cashSale: Number(data.cashSale || 0),
    cardSale: Number(data.cardSale || 0),
    customerCount: Number(data.customerCount || 0),
    source: String(data.source || ''),
    memo: `POS 일매출 ${data.reportDate || ''}`,
  };

  if (!sale.reportDate) return { salesId, ok: false, error: '매출일자 없음' };

  const accountNames = await loadAccountNameMap(storeId);
  const lines = buildSalesVoucherLines(sale, pattern, accountNames);
  const { totalDebit, totalCredit } = sumLines(lines);

  if (totalDebit !== totalCredit || totalDebit <= 0) {
    return { salesId, ok: false, error: '분개 금액 불균형' };
  }

  const settingsSnap = await adminDb.collection('accounting_settings').doc(storeId).get();
  const approvalRequired = settingsSnap.data()?.voucherApprovalRequired !== false;
  const status = autoApprove || !approvalRequired ? 'approved' : 'pending';

  const voucherNo = await nextVoucherNo(storeId, sale.reportDate);
  const amounts = resolveSalesAmounts(sale);
  const description = `매출전표 ${sale.reportDate} · ${amounts.total.toLocaleString()}원`;

  const voucherRef = await adminDb.collection('accounting_vouchers').add({
    storeId,
    voucherNo,
    voucherDate: sale.reportDate,
    voucherType: 'sales' as VoucherType,
    status,
    description,
    lines,
    totalDebit,
    totalCredit,
    sourceType: 'pos',
    sourceId: salesId,
    createdBy: uid,
    ...(status === 'approved' ? { approvedBy: uid, approvedAt: FieldValue.serverTimestamp() } : {}),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await snap.ref.update({
    accountingVoucherId: voucherRef.id,
    accountingVoucherNo: voucherNo,
    accountingVoucherStatus: status,
    accountingLinkedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { salesId, ok: true, voucherId: voucherRef.id, voucherNo };
}

function reportScore(data: Record<string, unknown>): number {
  const net = Number(data.netSales ?? data.netSale ?? data.totalSales ?? 0);
  const src = String(data.source || '');
  if (src === 'pos_bridge' && net > 0) return Infinity;
  if (src === 'pos_bridge' && net === 0) return -1;
  return net;
}

/** 해당 일자 최우선 daily_reports 1건 (POS bridge 우선) */
export async function pickBestDailyReportForDate(
  storeId: string,
  reportDate: string,
): Promise<{ id: string; data: FirebaseFirestore.DocumentData } | null> {
  const snap = await adminDb.collection('daily_reports')
    .where('storeId', '==', storeId)
    .where('reportDate', '==', reportDate)
    .get();

  let best: { id: string; data: FirebaseFirestore.DocumentData; score: number } | null = null;

  for (const doc of snap.docs) {
    const data = doc.data();
    const net = Number(data.netSales ?? data.netSale ?? data.totalSales ?? 0);
    if (net <= 0) continue;
    const score = reportScore(data);
    if (!best || score > best.score) {
      best = { id: doc.id, data, score };
    }
  }

  return best ? { id: best.id, data: best.data } : null;
}

export function mapDailyReportToSalesSource(
  id: string,
  data: FirebaseFirestore.DocumentData,
): SalesVoucherSource {
  const netSales = Number(data.netSales ?? data.netSale ?? data.totalSales ?? 0);
  return {
    id,
    reportDate: String(data.reportDate || ''),
    netSales,
    totalSales: Number(data.totalSales || 0),
    cashSale: Number(data.cashSale || 0),
    cardSale: Number(data.cardSale || 0),
    customerCount: Number(data.customerCount || 0),
    source: String(data.source || ''),
    memo: `일매출 ${data.reportDate || ''}${data.customerCount ? ` · ${data.customerCount}명` : ''}`,
  };
}

export async function listSalesForVoucherIntegration(
  storeId: string,
  opts?: { startDate?: string; endDate?: string; linked?: 'all' | 'pending' | 'done' },
) {
  const snap = await adminDb.collection('daily_reports')
    .where('storeId', '==', storeId)
    .limit(500)
    .get();

  const bestByDate = new Map<string, ReturnType<typeof mapRow>>();

  function mapRow(id: string, data: FirebaseFirestore.DocumentData) {
    const netSales = Number(data.netSales ?? data.netSale ?? data.totalSales ?? 0);
    const amounts = resolveSalesAmounts({
      id,
      reportDate: String(data.reportDate || ''),
      netSales,
      totalSales: Number(data.totalSales || 0),
      cashSale: Number(data.cashSale || 0),
      cardSale: Number(data.cardSale || 0),
      customerCount: Number(data.customerCount || 0),
      source: String(data.source || ''),
    });
    return {
      id,
      reportDate: String(data.reportDate || ''),
      netSales,
      totalSales: Number(data.totalSales || 0),
      cashSale: Number(data.cashSale || 0),
      cardSale: Number(data.cardSale || 0),
      customerCount: Number(data.customerCount || 0),
      supplyAmount: amounts.supply,
      taxAmount: amounts.tax,
      source: String(data.source || ''),
      accountingVoucherId: data.accountingVoucherId ? String(data.accountingVoucherId) : '',
      accountingVoucherNo: data.accountingVoucherNo ? String(data.accountingVoucherNo) : '',
      accountingVoucherStatus: data.accountingVoucherStatus ? String(data.accountingVoucherStatus) : '',
    };
  }

  for (const doc of snap.docs) {
    const data = doc.data();
    const date = String(data.reportDate || '');
    if (!date) continue;
    const net = Number(data.netSales ?? data.netSale ?? data.totalSales ?? 0);
    if (net <= 0) continue;

    const row = mapRow(doc.id, data);
    const prev = bestByDate.get(date);
    if (!prev || reportScore(data) > reportScore({ netSales: prev.netSales, source: prev.source })) {
      bestByDate.set(date, row);
    }
  }

  let rows = [...bestByDate.values()];

  if (opts?.startDate) rows = rows.filter(r => r.reportDate >= opts.startDate!);
  if (opts?.endDate) rows = rows.filter(r => r.reportDate <= opts.endDate!);
  if (opts?.linked === 'pending') rows = rows.filter(r => !r.accountingVoucherId);
  else if (opts?.linked === 'done') rows = rows.filter(r => !!r.accountingVoucherId);

  return rows.sort((a, b) => b.reportDate.localeCompare(a.reportDate));
}
