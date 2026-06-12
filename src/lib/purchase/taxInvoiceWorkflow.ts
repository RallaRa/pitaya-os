/** 매입 → (세금)계산서 처리 → 자동전표 처리 워크플로 */

export type TaxDocWorkflowStatus =
  | 'pending_review'  // 매입등록 직후 — 세금계산서·실물 대조 대기
  | 'verified'        // 계산서 처리·실물 확인 완료 — 자동전표 전송 가능
  | 'released'        // 자동전표처리 대기열 등록됨
  | 'excluded';       // 전표 제외 (간이·면세 등)

export type TaxDocType =
  | 'tax_invoice'     // 세금계산서
  | 'bill'            // 계산서
  | 'cash_receipt'    // 현금영수증
  | 'simple_receipt'  // 간이영수증
  | 'none';           // 미분류

export const TAX_DOC_WORKFLOW_STATUS_LABELS: Record<TaxDocWorkflowStatus, string> = {
  pending_review: '처리대기',
  verified: '확정',
  released: '전표대기',
  excluded: '전표제외',
};

export const TAX_DOC_TYPE_LABELS: Record<TaxDocType, string> = {
  tax_invoice: '세금계산서',
  bill: '계산서',
  cash_receipt: '현금영수증',
  simple_receipt: '간이영수증',
  none: '미분류',
};

export const TAX_DOC_TYPE_OPTIONS: TaxDocType[] = [
  'tax_invoice',
  'bill',
  'cash_receipt',
  'simple_receipt',
  'none',
];

export function normalizeTaxDocWorkflowStatus(
  raw?: string | null,
): TaxDocWorkflowStatus {
  if (raw === 'verified' || raw === 'released' || raw === 'excluded') return raw;
  return 'pending_review';
}

export function canReleaseToAutoVoucher(status: TaxDocWorkflowStatus): boolean {
  return status === 'verified';
}

export function isTaxInvoiceQueueDone(status: TaxDocWorkflowStatus): boolean {
  return status === 'released' || status === 'excluded';
}

export interface PurchaseTaxDocFields {
  taxDocWorkflowStatus?: TaxDocWorkflowStatus;
  taxDocType?: TaxDocType;
  taxDocNumber?: string;
  physicalMatchOk?: boolean;
  physicalMatchNote?: string;
  taxDocVerifiedAt?: unknown;
  taxDocVerifiedBy?: string;
  taxDocReleasedAt?: unknown;
}
