import type { PurchaseEvidence, PurchaseEvidenceSource } from '@/lib/purchase/purchaseEvidence';

export function buildHometaxEvidenceKey(
  storeId: string,
  sourceType: PurchaseEvidenceSource,
  rec: Pick<
    PurchaseEvidence,
    'txnDate' | 'totalAmount' | 'docNumber' | 'approvalNo' | 'merchantName' | 'supplierBizNo'
  >,
): string {
  if (sourceType === 'tax_invoice' && rec.docNumber) {
    return `ht:${storeId}:ti:${rec.docNumber.replace(/-/g, '')}`;
  }
  if (sourceType === 'cash_receipt' && rec.approvalNo) {
    return `ht:${storeId}:cr:${rec.approvalNo}:${rec.txnDate}`;
  }
  if (sourceType === 'card' && rec.approvalNo) {
    return `ht:${storeId}:cd:${rec.approvalNo}:${rec.txnDate}:${rec.totalAmount}`;
  }

  const merchant = rec.merchantName.trim().slice(0, 40);
  const biz = (rec.supplierBizNo || '').replace(/-/g, '');
  return `ht:${storeId}:${sourceType}:${rec.txnDate}:${rec.totalAmount}:${merchant}:${biz}`;
}
