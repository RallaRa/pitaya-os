export interface SupplierMasterEntry {
  id: string;
  supplierName: string;
  businessNumber?: string;
  category?: string;
  phone?: string;
  active?: boolean;
}

export interface SupplierDraftFields {
  businessNumber: string;
  category: string;
  phone: string;
}

export interface InvoiceSupplierInput {
  supplierName?: string;
  supplierId?: string;
  supplierDraft?: SupplierDraftFields;
  items?: Array<{ category?: string }>;
  memo?: string;
}

const SUPPLIER_CATEGORIES = ['소고기', '돼지고기', '닭고기', '수산물', '채소/과일', '공산품', '기타'] as const;
export const DEFAULT_SUPPLIER_CATEGORY = '소고기';

const PACKAGING_CATEGORIES = new Set(['박스', '용기', '봉투', '케이스', '스티커', '기타원부자재']);

export function normalizeSupplierName(name: string): string {
  return String(name || '')
    .replace(/\s+/g, '')
    .replace(/\(주\)|㈜|\(유\)|\(사\)/g, '')
    .trim()
    .toLowerCase();
}

/** OCR/AI raw 객체에서 공급자명 후보 추출 */
export function extractSupplierNameFromRaw(raw: Record<string, unknown>): string {
  const pick = (value: unknown) => {
    const text = String(value || '').trim();
    return text && text !== '미확인' ? text : '';
  };

  for (const key of ['supplierName', 'vendorName', 'vendor', 'sellerName', 'companyName', 'supplier']) {
    const name = pick(raw[key]);
    if (name) return name;
  }

  const memo = String(raw.memo || '');
  const memoMatch = memo.match(/(?:공급자|공급업체|판매자|출고처|매입처)[:\s]*([^\n|,|]+)/);
  if (memoMatch?.[1]?.trim()) return memoMatch[1].trim();

  const fallback = pick(raw.supplierName);
  return fallback;
}

export function matchSupplierByName(
  rawName: string,
  suppliers: SupplierMasterEntry[],
): SupplierMasterEntry | undefined {
  const name = String(rawName || '').trim();
  if (!name || name === '미확인') return undefined;

  const active = suppliers.filter(s => s.active !== false);
  const norm = normalizeSupplierName(name);

  const exact = active.find(s => normalizeSupplierName(s.supplierName) === norm);
  if (exact) return exact;

  const contains = active.find(s => {
    const sn = normalizeSupplierName(s.supplierName);
    return sn.includes(norm) || norm.includes(sn);
  });
  if (contains) return contains;

  const stripped = norm.replace(/주식회사|유한회사|농업회사법인/g, '');
  if (stripped !== norm) {
    return active.find(s => {
      const sn = normalizeSupplierName(s.supplierName).replace(/주식회사|유한회사|농업회사법인/g, '');
      return sn === stripped || sn.includes(stripped) || stripped.includes(sn);
    });
  }

  return undefined;
}

export function inferSupplierCategoryFromItems(items: Array<{ category?: string }> = []): string {
  const cats = items.map(i => String(i.category || '').trim()).filter(Boolean);
  if (!cats.length) return DEFAULT_SUPPLIER_CATEGORY;

  const counts: Record<string, number> = {};
  for (const cat of cats) {
    let mapped = DEFAULT_SUPPLIER_CATEGORY;
    if (cat === '한돈') mapped = '돼지고기';
    else if (cat === '한우') mapped = '소고기';
    else if (cat === '계육및기타') mapped = '닭고기';
    else if (PACKAGING_CATEGORIES.has(cat)) mapped = '공산품';
    else if (cat === '수입육') mapped = '소고기';
    counts[mapped] = (counts[mapped] || 0) + 1;
  }

  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
  return top && (SUPPLIER_CATEGORIES as readonly string[]).includes(top)
    ? top
    : DEFAULT_SUPPLIER_CATEGORY;
}

export function buildSupplierDraft(
  supplierName: string,
  items: Array<{ category?: string }> = [],
  existing?: Partial<SupplierDraftFields>,
): SupplierDraftFields {
  return {
    businessNumber: existing?.businessNumber?.trim() || '',
    category: existing?.category?.trim() || inferSupplierCategoryFromItems(items),
    phone: existing?.phone?.trim() || '',
  };
}

export function resolveInvoiceSupplier<T extends InvoiceSupplierInput>(
  invoice: T,
  suppliers: SupplierMasterEntry[],
): T {
  const rawName = String(invoice.supplierName || '').trim();
  const matched = invoice.supplierId
    ? suppliers.find(s => s.id === invoice.supplierId)
    : matchSupplierByName(rawName, suppliers);

  if (matched) {
    const next = {
      ...invoice,
      supplierId: matched.id,
      supplierName: matched.supplierName,
    };
    delete (next as InvoiceSupplierInput).supplierDraft;
    return next;
  }

  const cleanName = rawName && rawName !== '미확인' ? rawName : '';
  return {
    ...invoice,
    supplierId: invoice.supplierId || '',
    supplierName: cleanName,
    supplierDraft: buildSupplierDraft(cleanName, invoice.items, invoice.supplierDraft),
  };
}

export function applySuppliersToInvoices(
  invoices: Record<string, unknown>[],
  suppliers: SupplierMasterEntry[],
): Record<string, unknown>[] {
  if (!suppliers.length) return invoices;
  return invoices.map(inv =>
    resolveInvoiceSupplier(inv as InvoiceSupplierInput, suppliers) as Record<string, unknown>,
  );
}
