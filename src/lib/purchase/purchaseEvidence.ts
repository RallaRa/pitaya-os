/** 카드·현금영수증·세금계산서 등 외부 증빙 내역 */

export type PurchaseEvidenceSource = 'card' | 'cash_receipt' | 'tax_invoice';

export type PurchaseEvidenceMatchStatus =
  | 'unmatched'
  | 'auto_matched'
  | 'manual_matched'
  | 'ignored';

export interface PurchaseEvidence {
  id?: string;
  storeId: string;
  sourceType: PurchaseEvidenceSource;
  txnDate: string;
  merchantName: string;
  supplierBizNo?: string;
  supplyAmount?: number;
  taxAmount?: number;
  totalAmount: number;
  docNumber?: string;
  approvalNo?: string;
  cardName?: string;
  memo?: string;
  importBatchId?: string;
  /** 홈택스 등 외부 수집 중복 방지 키 */
  externalKey?: string;
  importSource?: 'upload' | 'hometax';
  matchedPurchaseId?: string;
  matchScore?: number;
  matchStatus: PurchaseEvidenceMatchStatus;
  importedAt?: unknown;
  importedBy?: string;
}

export const EVIDENCE_SOURCE_LABELS: Record<PurchaseEvidenceSource, string> = {
  card: '카드사용',
  cash_receipt: '현금영수증',
  tax_invoice: '세금계산서',
};

export type ReconciliationStatus =
  | 'full_match'
  | 'partial_match'
  | 'purchase_only'
  | 'evidence_only'
  | 'amount_mismatch';

export const RECONCILIATION_STATUS_LABELS: Record<ReconciliationStatus, string> = {
  full_match: '3자 일치',
  partial_match: '부분 일치',
  purchase_only: '매입만',
  evidence_only: '증빙만',
  amount_mismatch: '금액 불일치',
};

/** 거래명세서(OCR 매입등록) ↔ 세금계산서(홈택스) 금액 차이 */
export interface StatementVsTaxDiff {
  statementSupply: number;
  statementTax: number;
  statementTotal: number;
  taxSupply: number;
  taxTax: number;
  taxTotal: number;
  diffSupply: number;
  diffTax: number;
  diffTotal: number;
  hasStatement: boolean;
  hasTaxInvoice: boolean;
}

export interface ReconciliationRow {
  key: string;
  purchaseId: string | null;
  purchaseDate: string;
  supplierName: string;
  supplyAmount: number;
  taxAmount: number;
  totalAmount: number;
  /** 명세서 입력 vs 세금계산서 차액 (Track B) */
  statementVsTax: StatementVsTaxDiff | null;
  paymentMethod: string;
  taxDocWorkflowStatus: string;
  taxDocType: string;
  taxDocNumber: string;
  physicalMatchOk: boolean;
  accountingAutoVoucherId: string;
  card: PurchaseEvidence | null;
  cashReceipt: PurchaseEvidence | null;
  taxInvoice: PurchaseEvidence | null;
  status: ReconciliationStatus;
  score: number;
  issues: string[];
  requiredSources: PurchaseEvidenceSource[];
  matchedSources: PurchaseEvidenceSource[];
  canConfirm: boolean;
}

export interface ReconciliationSummary {
  totalPurchases: number;
  fullMatch: number;
  partialMatch: number;
  purchaseOnly: number;
  evidenceOnly: number;
  amountMismatch: number;
  readyToRelease: number;
  /** 명세↔세금 금액 불일치 건수 */
  statementTaxDiffCount: number;
  /** 명세↔세금 합계 차액 절대값 합 */
  statementTaxDiffTotal: number;
}
