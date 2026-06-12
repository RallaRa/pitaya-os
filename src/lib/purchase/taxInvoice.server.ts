import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { enqueuePurchaseAutoVoucher } from '@/lib/accounting/autoVoucherQueue.server';
import { fetchPurchaseRecordsForStore } from '@/lib/purchaseRecordsQuery.server';
import {
  canReleaseToAutoVoucher,
  normalizeTaxDocWorkflowStatus,
  type TaxDocType,
  type TaxDocWorkflowStatus,
} from '@/lib/purchase/taxInvoiceWorkflow';
import { normalizeAttachments, type PurchaseAttachment } from '@/lib/purchaseAttachments';

export interface PurchaseTaxInvoiceRow {
  id: string;
  purchaseDate: string;
  supplierName: string;
  invoiceNumber: string;
  supplyAmount: number;
  taxAmount: number;
  totalAmount: number;
  paymentMethod?: string;
  memo?: string;
  taxDocWorkflowStatus: TaxDocWorkflowStatus;
  taxDocType: TaxDocType;
  taxDocNumber: string;
  physicalMatchOk: boolean;
  physicalMatchNote: string;
  accountingVoucherId: string;
  accountingAutoVoucherId: string;
  purchaseAttachments: PurchaseAttachment[];
  imageUrls: string[];
}

function mapPurchaseTaxRow(id: string, data: Record<string, unknown>): PurchaseTaxInvoiceRow {
  const att = normalizeAttachments(
    data.purchaseAttachments as PurchaseAttachment[] | undefined,
    data.imageUrls as string[] | undefined,
  );
  return {
    id,
    purchaseDate: String(data.purchaseDate || ''),
    supplierName: String(data.supplierName || ''),
    invoiceNumber: String(data.invoiceNumber || ''),
    supplyAmount: Number(data.supplyAmount || 0),
    taxAmount: Number(data.taxAmount || 0),
    totalAmount: Number(data.totalAmount || 0),
    paymentMethod: String(data.paymentMethod || ''),
    memo: String(data.memo || ''),
    taxDocWorkflowStatus: normalizeTaxDocWorkflowStatus(
      data.taxDocWorkflowStatus as string | undefined,
    ),
    taxDocType: (data.taxDocType as TaxDocType) || 'none',
    taxDocNumber: String(data.taxDocNumber || data.invoiceNumber || ''),
    physicalMatchOk: data.physicalMatchOk === true,
    physicalMatchNote: String(data.physicalMatchNote || ''),
    accountingVoucherId: String(data.accountingVoucherId || ''),
    accountingAutoVoucherId: String(data.accountingAutoVoucherId || ''),
    purchaseAttachments: att,
    imageUrls: att.map(a => a.url),
  };
}

export async function listPurchasesForTaxInvoiceProcessing(
  storeId: string,
  opts?: {
    startDate?: string;
    endDate?: string;
    status?: TaxDocWorkflowStatus | 'all';
  },
): Promise<PurchaseTaxInvoiceRow[]> {
  const records = await fetchPurchaseRecordsForStore(storeId, {
    startDate: opts?.startDate,
    endDate: opts?.endDate,
    limit: 500,
  });

  let rows = records.map(r => mapPurchaseTaxRow(r.id, r as Record<string, unknown>));

  if (opts?.status && opts.status !== 'all') {
    rows = rows.filter(r => r.taxDocWorkflowStatus === opts.status);
  }

  return rows;
}

export async function updatePurchaseTaxDocDraft(params: {
  storeId: string;
  purchaseId: string;
  uid: string;
  taxDocType?: TaxDocType;
  taxDocNumber?: string;
  physicalMatchOk?: boolean;
  physicalMatchNote?: string;
  taxDocWorkflowStatus?: TaxDocWorkflowStatus;
}) {
  const ref = adminDb.collection('purchase_records').doc(params.purchaseId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('매입 전표 없음');
  if (String(snap.data()?.storeId) !== params.storeId) throw new Error('매장 불일치');

  const current = normalizeTaxDocWorkflowStatus(snap.data()?.taxDocWorkflowStatus);
  if (current === 'released') throw new Error('이미 자동전표 처리로 넘어간 건입니다.');

  const payload: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (params.taxDocType !== undefined) payload.taxDocType = params.taxDocType;
  if (params.taxDocNumber !== undefined) payload.taxDocNumber = params.taxDocNumber.trim();
  if (params.physicalMatchOk !== undefined) payload.physicalMatchOk = params.physicalMatchOk;
  if (params.physicalMatchNote !== undefined) payload.physicalMatchNote = params.physicalMatchNote.trim();

  if (params.taxDocWorkflowStatus === 'verified' && params.physicalMatchOk !== false) {
    payload.taxDocWorkflowStatus = 'verified';
    payload.taxDocVerifiedAt = FieldValue.serverTimestamp();
    payload.taxDocVerifiedBy = params.uid;
  } else if (params.taxDocWorkflowStatus === 'excluded') {
    payload.taxDocWorkflowStatus = 'excluded';
    payload.taxDocVerifiedAt = FieldValue.serverTimestamp();
    payload.taxDocVerifiedBy = params.uid;
  } else if (params.taxDocWorkflowStatus === 'pending_review') {
    payload.taxDocWorkflowStatus = 'pending_review';
  }

  await ref.update(payload);
  return mapPurchaseTaxRow(params.purchaseId, { ...snap.data(), ...payload, id: params.purchaseId });
}

export interface ReleasePurchaseTaxResult {
  purchaseId: string;
  ok: boolean;
  autoVoucherId?: string;
  error?: string;
}

export async function verifyAndReleasePurchaseToAutoVoucher(params: {
  storeId: string;
  purchaseId: string;
  uid: string;
  taxDocType: TaxDocType;
  taxDocNumber?: string;
  physicalMatchOk: boolean;
  physicalMatchNote?: string;
}): Promise<ReleasePurchaseTaxResult> {
  const { storeId, purchaseId, uid } = params;
  const ref = adminDb.collection('purchase_records').doc(purchaseId);
  const snap = await ref.get();

  if (!snap.exists) return { purchaseId, ok: false, error: '매입 전표 없음' };
  const data = snap.data()!;
  if (String(data.storeId) !== storeId) return { purchaseId, ok: false, error: '매장 불일치' };

  const status = normalizeTaxDocWorkflowStatus(data.taxDocWorkflowStatus);
  if (status === 'excluded') return { purchaseId, ok: false, error: '전표 제외 건입니다.' };
  if (data.accountingVoucherId) {
    return { purchaseId, ok: false, error: '이미 회계전표 처리됨' };
  }
  if (status === 'released' && data.accountingAutoVoucherId) {
    return { purchaseId, ok: true, autoVoucherId: String(data.accountingAutoVoucherId), error: '이미 전표대기 등록됨' };
  }

  if (!params.physicalMatchOk) {
    return { purchaseId, ok: false, error: '실물·전자 계산서 대조 확인이 필요합니다.' };
  }
  if (params.taxDocType === 'none') {
    return { purchaseId, ok: false, error: '증빙 유형을 선택하세요.' };
  }

  await ref.update({
    taxDocType: params.taxDocType,
    taxDocNumber: String(params.taxDocNumber || data.invoiceNumber || '').trim(),
    physicalMatchOk: true,
    physicalMatchNote: String(params.physicalMatchNote || '').trim(),
    taxDocWorkflowStatus: 'verified',
    taxDocVerifiedAt: FieldValue.serverTimestamp(),
    taxDocVerifiedBy: uid,
    updatedAt: FieldValue.serverTimestamp(),
  });

  const enqueue = await enqueuePurchaseAutoVoucher({
    storeId,
    purchaseId,
    uid,
    sourceScreen: '세금계산서처리',
  });

  if (!enqueue.ok) {
    return { purchaseId, ok: false, error: enqueue.error || '자동전표 등록 실패' };
  }

  await ref.update({
    taxDocWorkflowStatus: 'released',
    taxDocReleasedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { purchaseId, ok: true, autoVoucherId: enqueue.autoVoucherId };
}

export async function batchReleasePurchasesToAutoVoucher(params: {
  storeId: string;
  purchaseIds: string[];
  uid: string;
  defaults?: {
    taxDocType?: TaxDocType;
    physicalMatchOk?: boolean;
  };
}) {
  const results: ReleasePurchaseTaxResult[] = [];
  for (const purchaseId of params.purchaseIds) {
    const snap = await adminDb.collection('purchase_records').doc(purchaseId).get();
    if (!snap.exists) {
      results.push({ purchaseId, ok: false, error: '없음' });
      continue;
    }
    const data = snap.data()!;
    const result = await verifyAndReleasePurchaseToAutoVoucher({
      storeId: params.storeId,
      purchaseId,
      uid: params.uid,
      taxDocType: (data.taxDocType as TaxDocType) || params.defaults?.taxDocType || 'tax_invoice',
      taxDocNumber: String(data.taxDocNumber || data.invoiceNumber || ''),
      physicalMatchOk: data.physicalMatchOk === true || params.defaults?.physicalMatchOk === true,
      physicalMatchNote: String(data.physicalMatchNote || ''),
    });
    results.push(result);
  }
  return results;
}
