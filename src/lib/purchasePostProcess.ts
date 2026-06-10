import { isMeatCategory, isRawMaterialCategory, normalizePurchaseItem } from '@/lib/purchaseCategories';
import { extractSupplierNameFromRaw } from '@/lib/purchaseSupplierResolve';
import { normalizePurchaseQty } from '@/lib/purchaseQtyFormat';

const JUNK_ITEM_RE = /^(={2,}|[\-*]{2,}|소\s*계|합\s*계|이하\s*여백|이하여백|비\s*고|\*\*\*|total|subtotal)/i;
const POULTRY_RE = /계육|개체|비립|닭|치킨|육\d+호|하림|후레쉬|후레시|fresh/i;
const PACK_RE = /팩|pack|소분|절단/i;
const BOX_RE = /쌈무|170\s*[gG]|포장|봉투|박스|용기|케이스|스티커|라벨|비닐|tray|box/i;

const BALANCE_LABEL_RE = /잔액|미수|전잔|금일잔|입금|수금|received|balance/i;
const TOTAL_LABEL_RE = /합계|소계|당일매출|출고|공급가|total|supply/i;

export interface ItemAmounts {
  supplyAmount: number;
  taxAmount: number;
  totalAmount: number;
}

export function isJunkItemName(name: string): boolean {
  const n = String(name || '').trim();
  if (!n) return true;
  return JUNK_ITEM_RE.test(n);
}

export function inferUnitFromItem(name: string, category: string): string {
  const n = name.replace(/\s/g, '');

  if (isRawMaterialCategory(category) || BOX_RE.test(n)) {
    if (/봉투|비닐|bag/i.test(n)) return '봉투';
    if (/용기|tray|도시락/i.test(n)) return '개';
    if (/스티커|라벨/i.test(n)) return '롤';
    return '박스';
  }

  if (category === '계육및기타' || POULTRY_RE.test(n)) {
    if (PACK_RE.test(n)) return '팩';
    return '마리';
  }

  if (isMeatCategory(category) || /^돈|^한우|^수입|^우육|^돈육/.test(n)) {
    return 'kg';
  }

  if (/kg|중량|거래량/.test(n)) return 'kg';
  if (/박스|box/i.test(n)) return '박스';
  if (/개|ea/i.test(n)) return '개';

  return 'kg';
}

function enrichItemAmounts(item: Record<string, unknown>): Record<string, unknown> {
  const unit = String(item.unit || '').trim();
  const qty = normalizePurchaseQty(Number(item.qty || 0), unit);
  const unitPrice = Number(item.unitPrice || 0);
  let supplyAmount = Number(item.supplyAmount || 0);
  let taxAmount = Number(item.taxAmount || 0);

  if (supplyAmount <= 0 && qty > 0 && unitPrice > 0) {
    supplyAmount = Math.round(qty * unitPrice);
  }

  return {
    ...item,
    qty,
    unitPrice,
    supplyAmount,
    taxAmount,
  };
}

export function computeItemTotals(items: Record<string, unknown>[]): ItemAmounts {
  let supplyAmount = 0;
  let taxAmount = 0;

  for (const raw of items) {
    const item = enrichItemAmounts(raw);
    supplyAmount += Number(item.supplyAmount || 0);
    taxAmount += Number(item.taxAmount || 0);
  }

  return { supplyAmount, taxAmount, totalAmount: supplyAmount + taxAmount };
}

function withinTolerance(a: number, b: number, pct = 0.01): boolean {
  if (a <= 0 || b <= 0) return false;
  const diff = Math.abs(a - b);
  return diff <= Math.max(1, Math.round(Math.max(a, b) * pct));
}

function collectDocumentTotalCandidates(invoice: Record<string, unknown>): number[] {
  const seen = new Set<number>();
  const add = (v: unknown) => {
    const n = Number(v);
    if (n > 0 && !seen.has(n)) {
      seen.add(n);
      return n;
    }
    return null;
  };

  const candidates: number[] = [];

  for (const v of [
    invoice.totalAmount,
    invoice.supplyAmount,
    ...(Array.isArray(invoice.documentTotals) ? invoice.documentTotals : []),
  ]) {
    const n = add(v);
    if (n != null) candidates.push(n);
  }

  const balance = invoice.balanceFields;
  if (balance && typeof balance === 'object') {
    for (const [key, val] of Object.entries(balance as Record<string, unknown>)) {
      const n = Number(val);
      if (n <= 0) continue;
      if (BALANCE_LABEL_RE.test(key)) continue;
      if (TOTAL_LABEL_RE.test(key)) {
        const added = add(n);
        if (added != null) candidates.push(added);
      }
    }
  }

  return candidates;
}

export interface ResolveTotalsResult {
  supplyAmount: number;
  taxAmount: number;
  totalAmount: number;
  ocrTotalAmount?: number;
  totalMismatch: boolean;
  resolvedFrom: 'items' | 'document' | 'ocr';
}

export function resolveInvoiceTotals(invoice: Record<string, unknown>): ResolveTotalsResult {
  const items = Array.isArray(invoice.items) ? invoice.items : [];
  const fromItems = computeItemTotals(items);
  const ocrTotal = Number(invoice.totalAmount || 0);
  const ocrSupply = Number(invoice.supplyAmount || 0);

  if (fromItems.totalAmount > 0) {
    const docCandidates = collectDocumentTotalCandidates(invoice);
    const docMatch = docCandidates.find(c => withinTolerance(c, fromItems.totalAmount));

    return {
      supplyAmount: fromItems.supplyAmount,
      taxAmount: fromItems.taxAmount,
      totalAmount: fromItems.totalAmount,
      ocrTotalAmount: ocrTotal > 0 && !withinTolerance(ocrTotal, fromItems.totalAmount) ? ocrTotal : undefined,
      totalMismatch: ocrTotal > 0 && !withinTolerance(ocrTotal, fromItems.totalAmount),
      resolvedFrom: docMatch ? 'document' : 'items',
    };
  }

  if (ocrTotal > 0) {
    return {
      supplyAmount: ocrSupply || ocrTotal,
      taxAmount: Number(invoice.taxAmount || 0),
      totalAmount: ocrTotal,
      totalMismatch: false,
      resolvedFrom: 'ocr',
    };
  }

  return {
    supplyAmount: 0,
    taxAmount: 0,
    totalAmount: 0,
    totalMismatch: false,
    resolvedFrom: 'ocr',
  };
}

export function postProcessInvoice(raw: Record<string, unknown>): Record<string, unknown> {
  const filteredItems = (Array.isArray(raw.items) ? raw.items : [])
    .map(it => normalizePurchaseItem(it as Record<string, unknown>))
    .filter(it => !isJunkItemName(String(it.name || '')))
    .map(it => {
      const enriched = enrichItemAmounts(it);
      const name = String(enriched.name || '').trim();
      const category = String(enriched.category || '');
      const unit = String(enriched.unit || '').trim() || inferUnitFromItem(name, category);
      return { ...enriched, unit };
    });

  const extractedSupplier = extractSupplierNameFromRaw(raw);
  const base: Record<string, unknown> = {
    ...raw,
    items: filteredItems,
    supplierName: extractedSupplier || (filteredItems.length ? '미확인' : ''),
  };

  const totals = resolveInvoiceTotals(base);
  const _conflicts = base._conflicts;
  const balanceFields = base.balanceFields;
  const memo = String(base.memo || '').trim();
  delete base._conflicts;
  delete base.balanceFields;
  delete base.documentTotals;

  const memoParts = [memo].filter(Boolean);
  if (balanceFields && typeof balanceFields === 'object') {
    const parts = Object.entries(balanceFields as Record<string, unknown>)
      .filter(([, v]) => Number(v) > 0)
      .map(([k, v]) => `${k}:${Number(v).toLocaleString('ko-KR')}`);
    if (parts.length) memoParts.push(`[잔액] ${parts.join(', ')}`);
  }

  return {
    ...base,
    items: filteredItems,
    supplyAmount: totals.supplyAmount,
    taxAmount: totals.taxAmount,
    totalAmount: totals.totalAmount,
    memo: memoParts.join(' | '),
    _ocrTotalAmount: totals.ocrTotalAmount,
    _totalMismatch: totals.totalMismatch,
    _conflicts,
  };
}

/** 품목합 vs 표시 합계 불일치 (UI 경고용) */
export function hasInvoiceTotalMismatch(invoice: {
  items?: Array<{ supplyAmount?: number; taxAmount?: number }>;
  totalAmount?: number;
  _totalMismatch?: boolean;
}): boolean {
  if (invoice._totalMismatch) return true;
  const items = invoice.items || [];
  const computed = items.reduce(
    (s, i) => s + Number(i.supplyAmount || 0) + Number(i.taxAmount || 0),
    0,
  );
  const total = Number(invoice.totalAmount || 0);
  return total > 0 && computed > 0 && !withinTolerance(total, computed);
}
