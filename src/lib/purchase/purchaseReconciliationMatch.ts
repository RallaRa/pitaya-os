import type { PurchaseTaxInvoiceRow } from '@/lib/purchase/taxInvoice.server';
import type {
  PurchaseEvidence,
  PurchaseEvidenceSource,
  ReconciliationRow,
  ReconciliationStatus,
  ReconciliationSummary,
  StatementVsTaxDiff,
} from '@/lib/purchase/purchaseEvidence';

const DATE_TOLERANCE_DAYS = 7;
const AMOUNT_TOLERANCE = 1;

function normalizeName(name: string): string {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\(주\)|주식회사|\(유\)|유한회사|㈜/g, '')
    .replace(/\s+/g, '');
}

function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;
  const minLen = Math.min(na.length, nb.length);
  let common = 0;
  for (let i = 0; i < minLen; i++) {
    if (na[i] === nb[i]) common++;
  }
  return common / Math.max(na.length, nb.length);
}

function daysBetween(a: string, b: string): number {
  const da = new Date(`${a}T12:00:00+09:00`).getTime();
  const db = new Date(`${b}T12:00:00+09:00`).getTime();
  if (Number.isNaN(da) || Number.isNaN(db)) return 999;
  return Math.abs(Math.round((da - db) / 86400000));
}

function amountMatch(a: number, b: number): boolean {
  return Math.abs(a - b) <= AMOUNT_TOLERANCE;
}

function scoreEvidence(purchase: PurchaseTaxInvoiceRow, ev: PurchaseEvidence): number {
  let score = 0;

  if (amountMatch(purchase.totalAmount, ev.totalAmount)) score += 50;
  else if (amountMatch(purchase.supplyAmount, ev.supplyAmount || 0)) score += 35;
  else return 0;

  const dayDiff = daysBetween(purchase.purchaseDate, ev.txnDate);
  if (dayDiff === 0) score += 30;
  else if (dayDiff <= 3) score += 20;
  else if (dayDiff <= DATE_TOLERANCE_DAYS) score += 10;
  else return 0;

  score += Math.round(nameSimilarity(purchase.supplierName, ev.merchantName) * 20);

  const purchaseDoc = String(purchase.taxDocNumber || purchase.invoiceNumber || '').trim();
  const evDoc = String(ev.docNumber || ev.approvalNo || '').trim();
  if (purchaseDoc && evDoc && (purchaseDoc === evDoc || purchaseDoc.includes(evDoc) || evDoc.includes(purchaseDoc))) {
    score += 40;
  }

  return score;
}

export function requiredEvidenceSources(paymentMethod?: string): PurchaseEvidenceSource[] {
  const pm = String(paymentMethod || '').trim();
  if (/카드|card|신용/i.test(pm)) {
    return ['card', 'tax_invoice'];
  }
  if (/현금|cash/i.test(pm)) {
    return ['cash_receipt', 'tax_invoice'];
  }
  return ['tax_invoice'];
}

function pickBestEvidence(
  purchase: PurchaseTaxInvoiceRow,
  candidates: PurchaseEvidence[],
  usedIds: Set<string>,
): PurchaseEvidence | null {
  let best: PurchaseEvidence | null = null;
  let bestScore = 0;

  for (const ev of candidates) {
    if (usedIds.has(ev.id || '')) continue;
    if (ev.matchedPurchaseId && ev.matchedPurchaseId !== purchase.id) continue;
    const score = scoreEvidence(purchase, ev);
    if (score > bestScore && score >= 60) {
      bestScore = score;
      best = { ...ev, matchScore: score };
    }
  }
  return best;
}

export function buildStatementVsTaxDiff(
  purchase: { supplyAmount: number; taxAmount: number; totalAmount: number } | null,
  taxInvoice: PurchaseEvidence | null,
): StatementVsTaxDiff | null {
  const hasStatement = !!purchase && purchase.totalAmount > 0;
  const hasTaxInvoice = !!taxInvoice && taxInvoice.totalAmount > 0;
  if (!hasStatement && !hasTaxInvoice) return null;

  const statementSupply = purchase?.supplyAmount ?? 0;
  const statementTax = purchase?.taxAmount ?? 0;
  const statementTotal = purchase?.totalAmount ?? 0;
  const taxSupply = taxInvoice?.supplyAmount ?? 0;
  const taxTax = taxInvoice?.taxAmount ?? 0;
  const taxTotal = taxInvoice?.totalAmount ?? 0;

  return {
    statementSupply,
    statementTax,
    statementTotal,
    taxSupply,
    taxTax,
    taxTotal,
    diffSupply: statementSupply - taxSupply,
    diffTax: statementTax - taxTax,
    diffTotal: statementTotal - taxTotal,
    hasStatement,
    hasTaxInvoice,
  };
}

function deriveStatus(
  purchase: PurchaseTaxInvoiceRow | null,
  card: PurchaseEvidence | null,
  cash: PurchaseEvidence | null,
  tax: PurchaseEvidence | null,
  required: PurchaseEvidenceSource[],
): { status: ReconciliationStatus; issues: string[]; matched: PurchaseEvidenceSource[] } {
  const issues: string[] = [];
  const matched: PurchaseEvidenceSource[] = [];
  if (card) matched.push('card');
  if (cash) matched.push('cash_receipt');
  if (tax) matched.push('tax_invoice');

  if (!purchase) {
    return { status: 'evidence_only', issues: ['매입등록 건 없음'], matched };
  }

  if (!card && !cash && !tax) {
    return { status: 'purchase_only', issues: ['외부 증빙 없음'], matched };
  }

  for (const src of required) {
    const has = matched.includes(src);
    if (!has) {
      issues.push(`${src === 'card' ? '카드' : src === 'cash_receipt' ? '현금영수증' : '세금계산서'} 미매칭`);
    }
  }

  const amounts: number[] = [purchase.totalAmount];
  if (card) amounts.push(card.totalAmount);
  if (cash) amounts.push(cash.totalAmount);
  if (tax) amounts.push(tax.totalAmount);
  const base = purchase.totalAmount;
  const mismatch = amounts.some(a => !amountMatch(a, base));
  if (mismatch) {
    issues.push('금액 불일치');
    return { status: 'amount_mismatch', issues, matched };
  }

  const allRequired = required.every(r => matched.includes(r));
  if (allRequired && issues.length === 0) {
    return { status: 'full_match', issues: [], matched };
  }
  return { status: 'partial_match', issues, matched };
}

export function buildReconciliationRows(
  purchases: PurchaseTaxInvoiceRow[],
  evidence: PurchaseEvidence[],
): ReconciliationRow[] {
  const bySource = {
    card: evidence.filter(e => e.sourceType === 'card'),
    cash_receipt: evidence.filter(e => e.sourceType === 'cash_receipt'),
    tax_invoice: evidence.filter(e => e.sourceType === 'tax_invoice'),
  };

  const usedEvidenceIds = new Set<string>();
  const rows: ReconciliationRow[] = [];

  for (const purchase of purchases) {
    const required = requiredEvidenceSources(purchase.paymentMethod);
    const card = pickBestEvidence(purchase, bySource.card, usedEvidenceIds);
    const cash = pickBestEvidence(purchase, bySource.cash_receipt, usedEvidenceIds);
    const tax = pickBestEvidence(purchase, bySource.tax_invoice, usedEvidenceIds);

    if (card?.id) usedEvidenceIds.add(card.id);
    if (cash?.id) usedEvidenceIds.add(cash.id);
    if (tax?.id) usedEvidenceIds.add(tax.id);

    const { status, issues, matched } = deriveStatus(purchase, card, cash, tax, required);
    const score = [card?.matchScore, cash?.matchScore, tax?.matchScore]
      .filter((n): n is number => typeof n === 'number')
      .reduce((a, b) => a + b, 0);

    const isPending = purchase.taxDocWorkflowStatus === 'pending_review'
      || purchase.taxDocWorkflowStatus === 'verified';

    const statementVsTax = buildStatementVsTaxDiff(purchase, tax);

    rows.push({
      key: purchase.id,
      purchaseId: purchase.id,
      purchaseDate: purchase.purchaseDate,
      supplierName: purchase.supplierName,
      supplyAmount: purchase.supplyAmount,
      taxAmount: purchase.taxAmount,
      totalAmount: purchase.totalAmount,
      statementVsTax,
      paymentMethod: purchase.paymentMethod || '',
      taxDocWorkflowStatus: purchase.taxDocWorkflowStatus,
      taxDocType: purchase.taxDocType,
      taxDocNumber: purchase.taxDocNumber || purchase.invoiceNumber,
      physicalMatchOk: purchase.physicalMatchOk,
      accountingAutoVoucherId: purchase.accountingAutoVoucherId,
      card,
      cashReceipt: cash,
      taxInvoice: tax,
      status,
      score,
      issues,
      requiredSources: required,
      matchedSources: matched,
      canConfirm: isPending && status === 'full_match' && !purchase.accountingAutoVoucherId,
    });
  }

  const orphanEvidence = evidence.filter(e => !usedEvidenceIds.has(e.id || ''));
  for (const ev of orphanEvidence) {
    if (ev.matchedPurchaseId) continue;
    const statementVsTax = ev.sourceType === 'tax_invoice'
      ? buildStatementVsTaxDiff(null, ev)
      : null;

    rows.push({
      key: `ev_${ev.id}`,
      purchaseId: null,
      purchaseDate: '',
      supplierName: '',
      supplyAmount: ev.supplyAmount || 0,
      taxAmount: ev.taxAmount || 0,
      totalAmount: ev.totalAmount,
      statementVsTax,
      paymentMethod: '',
      taxDocWorkflowStatus: '',
      taxDocType: '',
      taxDocNumber: '',
      physicalMatchOk: false,
      accountingAutoVoucherId: '',
      card: ev.sourceType === 'card' ? ev : null,
      cashReceipt: ev.sourceType === 'cash_receipt' ? ev : null,
      taxInvoice: ev.sourceType === 'tax_invoice' ? ev : null,
      status: 'evidence_only',
      score: 0,
      issues: ['매입등록 건 없음'],
      requiredSources: [],
      matchedSources: [ev.sourceType],
      canConfirm: false,
    });
  }

  rows.sort((a, b) => {
    if (a.purchaseDate && b.purchaseDate) return b.purchaseDate.localeCompare(a.purchaseDate);
    if (a.purchaseDate) return -1;
    if (b.purchaseDate) return 1;
    return (b.card?.txnDate || b.taxInvoice?.txnDate || '').localeCompare(a.card?.txnDate || a.taxInvoice?.txnDate || '');
  });

  return rows;
}

function hasStatementTaxDiff(diff: StatementVsTaxDiff | null): boolean {
  if (!diff?.hasStatement || !diff.hasTaxInvoice) return false;
  return Math.abs(diff.diffTotal) > AMOUNT_TOLERANCE
    || Math.abs(diff.diffSupply) > AMOUNT_TOLERANCE
    || Math.abs(diff.diffTax) > AMOUNT_TOLERANCE;
}

export function summarizeReconciliation(rows: ReconciliationRow[]): ReconciliationSummary {
  const purchaseRows = rows.filter(r => r.purchaseId);
  const diffRows = rows.filter(r => hasStatementTaxDiff(r.statementVsTax));
  return {
    totalPurchases: purchaseRows.length,
    fullMatch: purchaseRows.filter(r => r.status === 'full_match').length,
    partialMatch: purchaseRows.filter(r => r.status === 'partial_match').length,
    purchaseOnly: purchaseRows.filter(r => r.status === 'purchase_only').length,
    evidenceOnly: rows.filter(r => r.status === 'evidence_only').length,
    amountMismatch: purchaseRows.filter(r => r.status === 'amount_mismatch').length,
    readyToRelease: purchaseRows.filter(r => r.canConfirm).length,
    statementTaxDiffCount: diffRows.length,
    statementTaxDiffTotal: diffRows.reduce(
      (sum, r) => sum + Math.abs(r.statementVsTax?.diffTotal || 0),
      0,
    ),
  };
}
