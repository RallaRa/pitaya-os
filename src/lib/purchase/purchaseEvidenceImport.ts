import type { PurchaseEvidence, PurchaseEvidenceSource } from '@/lib/purchase/purchaseEvidence';

type HeaderMap = Partial<Record<
  'txnDate' | 'merchantName' | 'supplierBizNo' | 'supplyAmount' | 'taxAmount' | 'totalAmount' | 'docNumber' | 'approvalNo' | 'cardName' | 'memo',
  string
>>;

const HEADER_ALIASES: Record<keyof HeaderMap, string[]> = {
  txnDate: ['승인일', '거래일', '이용일', '작성일', '발행일', '일자', 'date', 'txn'],
  merchantName: ['가맹점', '가맹점명', '공급자', '공급자명', '상호', '사용처', 'merchant', 'supplier'],
  supplierBizNo: ['사업자번호', '사업자등록번호', 'bizno', 'biz'],
  supplyAmount: ['공급가액', '공급가', 'supply'],
  taxAmount: ['세액', '부가세', 'vat', 'tax'],
  totalAmount: ['합계', '승인금액', '이용금액', '금액', '총액', 'amount', 'total'],
  docNumber: ['계산서번호', '세금계산서번호', '국세청승인번호', '승인번호(세금)', 'doc'],
  approvalNo: ['승인번호', '현금영수증승인번호', 'approval'],
  cardName: ['카드', '카드사', 'card'],
  memo: ['비고', 'memo', '적요'],
};

function normalizeHeader(h: string): string {
  return String(h || '').trim().toLowerCase().replace(/\s+/g, '');
}

function detectHeaderMap(headers: string[]): HeaderMap {
  const map: HeaderMap = {};
  const normalized = headers.map(normalizeHeader);

  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [keyof HeaderMap, string[]][]) {
    for (let i = 0; i < normalized.length; i++) {
      const h = normalized[i];
      if (aliases.some(a => h.includes(normalizeHeader(a)))) {
        map[field] = headers[i];
        break;
      }
    }
  }

  return map;
}

function parseNumber(raw: unknown): number {
  const n = Number(String(raw ?? '').replace(/[,₩원\s]/g, ''));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function parseDate(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const digits = s.replace(/\D/g, '');
  if (digits.length === 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  return '';
}

function rowValue(row: Record<string, unknown>, header?: string): unknown {
  if (!header) return '';
  return row[header] ?? '';
}

export function parseEvidenceRows(
  rows: Record<string, unknown>[],
  sourceType: PurchaseEvidenceSource,
  storeId: string,
): { records: Omit<PurchaseEvidence, 'id'>[]; skipped: number; warnings: string[] } {
  if (!rows.length) {
    return { records: [], skipped: 0, warnings: ['데이터 행이 없습니다.'] };
  }

  const headers = Object.keys(rows[0] || {});
  const map = detectHeaderMap(headers);
  const warnings: string[] = [];

  if (!map.txnDate) warnings.push('일자 열을 찾지 못했습니다. (승인일·거래일·작성일 등)');
  if (!map.totalAmount && !map.supplyAmount) {
    warnings.push('금액 열을 찾지 못했습니다. (합계·승인금액·공급가액 등)');
  }
  if (!map.merchantName) warnings.push('거래처/가맹점 열을 찾지 못했습니다.');

  const records: Omit<PurchaseEvidence, 'id'>[] = [];
  let skipped = 0;

  for (const row of rows) {
    const txnDate = parseDate(rowValue(row, map.txnDate));
    const merchantName = String(rowValue(row, map.merchantName) || '').trim();
    let supplyAmount = parseNumber(rowValue(row, map.supplyAmount));
    let taxAmount = parseNumber(rowValue(row, map.taxAmount));
    let totalAmount = parseNumber(rowValue(row, map.totalAmount));

    if (totalAmount <= 0 && supplyAmount > 0) {
      if (taxAmount <= 0) taxAmount = Math.round(supplyAmount * 0.1);
      totalAmount = supplyAmount + taxAmount;
    }
    if (supplyAmount <= 0 && totalAmount > 0) {
      taxAmount = taxAmount > 0 ? taxAmount : Math.round(totalAmount / 11);
      supplyAmount = Math.max(totalAmount - taxAmount, 0);
    }

    if (!txnDate || totalAmount <= 0) {
      skipped++;
      continue;
    }

    records.push({
      storeId,
      sourceType,
      txnDate,
      merchantName: merchantName || '(미상)',
      supplierBizNo: String(rowValue(row, map.supplierBizNo) || '').replace(/\D/g, '').slice(0, 10),
      supplyAmount: supplyAmount || undefined,
      taxAmount: taxAmount || undefined,
      totalAmount,
      docNumber: String(rowValue(row, map.docNumber) || '').trim(),
      approvalNo: String(rowValue(row, map.approvalNo) || '').trim(),
      cardName: String(rowValue(row, map.cardName) || '').trim(),
      memo: String(rowValue(row, map.memo) || '').trim(),
      matchStatus: 'unmatched',
    });
  }

  return { records, skipped, warnings };
}

export function sheetRowsToObjects(sheet: unknown[][]): Record<string, unknown>[] {
  if (!sheet.length) return [];
  const headers = (sheet[0] || []).map(h => String(h ?? '').trim()).filter(Boolean);
  if (!headers.length) return [];

  const rows: Record<string, unknown>[] = [];
  for (let i = 1; i < sheet.length; i++) {
    const line = sheet[i] || [];
    if (!line.some(c => String(c ?? '').trim())) continue;
    const obj: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      obj[h] = line[idx] ?? '';
    });
    rows.push(obj);
  }
  return rows;
}

export function parseCsvText(text: string): Record<string, unknown>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  const delimiter = lines[0].includes('\t') ? '\t' : (lines[0].split(',').length > 1 ? ',' : '\t');
  const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
  const rows: Record<string, unknown>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(delimiter).map(c => c.trim().replace(/^"|"$/g, ''));
    if (!cols.some(c => c)) continue;
    const obj: Record<string, unknown> = {};
    headers.forEach((h, idx) => { obj[h] = cols[idx] ?? ''; });
    rows.push(obj);
  }
  return rows;
}
