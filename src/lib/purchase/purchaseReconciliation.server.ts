import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { loadAccountingSettings } from '@/lib/accounting/accountingSettings.server';
import { verifyAndReleasePurchaseToAutoVoucher } from '@/lib/purchase/taxInvoice.server';
import { listPurchasesForTaxInvoiceProcessing } from '@/lib/purchase/taxInvoice.server';
import type { PurchaseEvidence, PurchaseEvidenceSource } from '@/lib/purchase/purchaseEvidence';
import {
  buildReconciliationRows,
  summarizeReconciliation,
} from '@/lib/purchase/purchaseReconciliationMatch';
import type { TaxDocType } from '@/lib/purchase/taxInvoiceWorkflow';

function mapEvidence(id: string, data: Record<string, unknown>): PurchaseEvidence {
  return {
    id,
    storeId: String(data.storeId || ''),
    sourceType: data.sourceType as PurchaseEvidenceSource,
    txnDate: String(data.txnDate || ''),
    merchantName: String(data.merchantName || ''),
    supplierBizNo: String(data.supplierBizNo || ''),
    supplyAmount: Number(data.supplyAmount || 0) || undefined,
    taxAmount: Number(data.taxAmount || 0) || undefined,
    totalAmount: Number(data.totalAmount || 0),
    docNumber: String(data.docNumber || ''),
    approvalNo: String(data.approvalNo || ''),
    cardName: String(data.cardName || ''),
    memo: String(data.memo || ''),
    importBatchId: String(data.importBatchId || ''),
    externalKey: String(data.externalKey || '') || undefined,
    importSource: (data.importSource as PurchaseEvidence['importSource']) || undefined,
    matchedPurchaseId: String(data.matchedPurchaseId || '') || undefined,
    matchScore: Number(data.matchScore || 0) || undefined,
    matchStatus: (data.matchStatus as PurchaseEvidence['matchStatus']) || 'unmatched',
    importedAt: data.importedAt,
    importedBy: String(data.importedBy || ''),
  };
}

export async function listPurchaseEvidence(
  storeId: string,
  opts?: { startDate?: string; endDate?: string; sourceType?: PurchaseEvidenceSource | 'all' },
): Promise<PurchaseEvidence[]> {
  const snap = await adminDb.collection('purchase_evidence')
    .where('storeId', '==', storeId)
    .limit(2000)
    .get();

  let rows = snap.docs.map(d => mapEvidence(d.id, d.data() as Record<string, unknown>));

  if (opts?.startDate) {
    rows = rows.filter(r => r.txnDate >= opts.startDate!);
  }
  if (opts?.endDate) {
    rows = rows.filter(r => r.txnDate <= opts.endDate!);
  }
  if (opts?.sourceType && opts.sourceType !== 'all') {
    rows = rows.filter(r => r.sourceType === opts.sourceType);
  }

  return rows.sort((a, b) => b.txnDate.localeCompare(a.txnDate));
}

export async function loadExistingExternalKeys(storeId: string): Promise<Set<string>> {
  const snap = await adminDb.collection('purchase_evidence')
    .where('storeId', '==', storeId)
    .select('externalKey')
    .get();

  const keys = new Set<string>();
  for (const doc of snap.docs) {
    const key = String(doc.data().externalKey || '').trim();
    if (key) keys.add(key);
  }
  return keys;
}

export async function importPurchaseEvidence(params: {
  storeId: string;
  uid: string;
  sourceType: PurchaseEvidenceSource;
  records: Omit<PurchaseEvidence, 'id'>[];
  importSource?: 'upload' | 'hometax';
  existingKeys?: Set<string>;
}) {
  const batchId = `imp_${Date.now()}`;
  const batch = adminDb.batch();
  let imported = 0;
  let skipped = 0;
  const knownKeys = params.existingKeys;

  for (const rec of params.records) {
    if (rec.totalAmount <= 0 || !rec.txnDate) continue;

    if (rec.externalKey && knownKeys?.has(rec.externalKey)) {
      skipped++;
      continue;
    }

    const ref = adminDb.collection('purchase_evidence').doc();
    batch.set(ref, {
      ...rec,
      storeId: params.storeId,
      sourceType: params.sourceType,
      importSource: params.importSource || rec.importSource || 'upload',
      importBatchId: batchId,
      matchStatus: 'unmatched',
      importedAt: FieldValue.serverTimestamp(),
      importedBy: params.uid,
    });
    if (rec.externalKey) knownKeys?.add(rec.externalKey);
    imported++;
  }

  if (imported > 0) await batch.commit();
  return { imported, skipped, batchId };
}

export async function deletePurchaseEvidenceBatch(params: {
  storeId: string;
  importBatchId: string;
}) {
  const snap = await adminDb.collection('purchase_evidence')
    .where('storeId', '==', params.storeId)
    .where('importBatchId', '==', params.importBatchId)
    .get();

  if (snap.empty) return { deleted: 0 };

  const batch = adminDb.batch();
  snap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
  return { deleted: snap.size };
}

export async function getReconciliationView(
  storeId: string,
  opts?: { startDate?: string; endDate?: string },
) {
  const [purchases, evidence] = await Promise.all([
    listPurchasesForTaxInvoiceProcessing(storeId, {
      startDate: opts?.startDate,
      endDate: opts?.endDate,
      status: 'all',
    }),
    listPurchaseEvidence(storeId, {
      startDate: opts?.startDate,
      endDate: opts?.endDate,
    }),
  ]);

  const rows = buildReconciliationRows(purchases, evidence);
  return {
    rows,
    summary: summarizeReconciliation(rows),
    evidenceCount: evidence.length,
  };
}

function inferTaxDocType(
  row: ReturnType<typeof buildReconciliationRows>[number],
): TaxDocType {
  if (row.taxInvoice) return 'tax_invoice';
  if (row.cashReceipt) return 'cash_receipt';
  return 'tax_invoice';
}

export async function confirmReconciliation(params: {
  storeId: string;
  purchaseId: string;
  uid: string;
  releaseToAutoVoucher?: boolean;
  note?: string;
}) {
  const view = await getReconciliationView(params.storeId, {});
  const row = view.rows.find(r => r.purchaseId === params.purchaseId);
  if (!row) throw new Error('대조 행을 찾을 수 없습니다.');
  if (row.status !== 'full_match') {
    throw new Error('3자 대조가 완료되지 않았습니다.');
  }

  const purchaseRef = adminDb.collection('purchase_records').doc(params.purchaseId);
  const snap = await purchaseRef.get();
  if (!snap.exists) throw new Error('매입 전표 없음');
  if (String(snap.data()?.storeId) !== params.storeId) throw new Error('매장 불일치');

  const evidenceIds = [row.card?.id, row.cashReceipt?.id, row.taxInvoice?.id].filter(Boolean) as string[];
  const taxDocNumber = row.taxInvoice?.docNumber
    || row.taxInvoice?.approvalNo
    || row.taxDocNumber
    || '';

  const batch = adminDb.batch();
  for (const evId of evidenceIds) {
    batch.update(adminDb.collection('purchase_evidence').doc(evId), {
      matchedPurchaseId: params.purchaseId,
      matchStatus: 'manual_matched',
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  batch.update(purchaseRef, {
    physicalMatchOk: true,
    physicalMatchNote: String(params.note || '카드·현금영수증·세금계산서 3자 대조 완료').trim(),
    taxDocType: inferTaxDocType(row),
    taxDocNumber: taxDocNumber.trim(),
    reconciliationEvidenceIds: evidenceIds,
    reconciliationConfirmedAt: FieldValue.serverTimestamp(),
    reconciliationConfirmedBy: params.uid,
    updatedAt: FieldValue.serverTimestamp(),
  });

  await batch.commit();

  if (params.releaseToAutoVoucher) {
    return verifyAndReleasePurchaseToAutoVoucher({
      storeId: params.storeId,
      purchaseId: params.purchaseId,
      uid: params.uid,
      taxDocType: inferTaxDocType(row),
      taxDocNumber,
      physicalMatchOk: true,
      physicalMatchNote: String(params.note || '증빙 대조 후 자동전표 전송'),
    });
  }

  return { purchaseId: params.purchaseId, ok: true };
}

export async function batchConfirmReconciliation(params: {
  storeId: string;
  purchaseIds: string[];
  uid: string;
  releaseToAutoVoucher?: boolean;
}) {
  const results = [];
  for (const purchaseId of params.purchaseIds) {
    try {
      const result = await confirmReconciliation({
        storeId: params.storeId,
        purchaseId,
        uid: params.uid,
        releaseToAutoVoucher: params.releaseToAutoVoucher,
      });
      results.push({ purchaseId, ok: true, ...result });
    } catch (e) {
      results.push({
        purchaseId,
        ok: false,
        error: e instanceof Error ? e.message : '실패',
      });
    }
  }
  return results;
}

/** 3자 일치 매입 → 설정 시 자동 대조 확정·전표 전송 (Track A) */
export async function autoReleaseMatchedPurchases(params: {
  storeId: string;
  uid: string;
  startDate?: string;
  endDate?: string;
}) {
  const settings = await loadAccountingSettings(params.storeId);
  if (!settings.autoVoucherFromPurchase) {
    return { released: 0, skipped: 0, errors: [] as string[] };
  }

  const view = await getReconciliationView(params.storeId, {
    startDate: params.startDate,
    endDate: params.endDate,
  });

  const targets = view.rows.filter(r => r.canConfirm && r.purchaseId);
  let released = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of targets) {
    try {
      await confirmReconciliation({
        storeId: params.storeId,
        purchaseId: row.purchaseId!,
        uid: params.uid,
        releaseToAutoVoucher: true,
        note: '홈택스 동기화 후 3자 일치 자동 전표',
      });
      released += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : '자동 전표 실패';
      if (/이미|skipped/i.test(msg)) skipped += 1;
      else errors.push(`${row.purchaseId}: ${msg}`);
    }
  }

  return { released, skipped, errors };
}

export async function manualLinkEvidence(params: {
  storeId: string;
  purchaseId: string;
  evidenceId: string;
  uid: string;
}) {
  const [purchaseSnap, evidenceSnap] = await Promise.all([
    adminDb.collection('purchase_records').doc(params.purchaseId).get(),
    adminDb.collection('purchase_evidence').doc(params.evidenceId).get(),
  ]);

  if (!purchaseSnap.exists) throw new Error('매입 전표 없음');
  if (!evidenceSnap.exists) throw new Error('증빙 내역 없음');
  if (String(purchaseSnap.data()?.storeId) !== params.storeId) throw new Error('매장 불일치');
  if (String(evidenceSnap.data()?.storeId) !== params.storeId) throw new Error('증빙 매장 불일치');

  await evidenceSnap.ref.update({
    matchedPurchaseId: params.purchaseId,
    matchStatus: 'manual_matched',
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { ok: true };
}
