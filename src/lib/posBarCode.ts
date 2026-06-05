/** POS Goods.BarCode → Pitaya 저울코드 변환 */

export function digitsOnly(s: string): string {
  return String(s || '').replace(/\D/g, '');
}

/** 6자리 숫자 POS 품목코드 */
export function isSixDigitPosBarCode(bar: string): boolean {
  const d = digitsOnly(bar);
  return d.length === 6 && /^[0-9]{6}$/.test(d);
}

export function normalizePosBarCode(bar: string): string {
  return digitsOnly(bar).padStart(6, '0').slice(-6);
}

/** 저울 표시용 3자리 (036, 352) */
export function scaleCode3FromBarCode(bar: string): string {
  const d = normalizePosBarCode(bar);
  return d.slice(-3);
}

/** Pitaya code 필드용 숫자 (선행 0 제거: 036→36, 352→352) */
export function scaleCodeNumberFromBarCode(bar: string): number {
  return parseInt(scaleCode3FromBarCode(bar), 10) || 0;
}

export function prefix3FromBarCode(bar: string): string {
  return normalizePosBarCode(bar).slice(0, 3);
}

/** POS 앞3자리(계열) — 포스 DB 검증 기준 (201=한돈, 203=한우) */
export const POS_PREFIX3_LABELS: Record<string, string> = {
  '201': '한돈계열',
  '203': '한우계열',
  '202': '수입계열',
  '204': '계육계열',
  '100': '일반/기타',
};

export function labelPrefix3(prefix3: string): string {
  return POS_PREFIX3_LABELS[prefix3] || `계열 ${prefix3}`;
}

/** 6자리 중 3번째 자리(1=한돈 201, 3=한우 203 등) — 중복 구분 핵심 */
export function seriesDigitFromBarCode(bar: string): string {
  const d = normalizePosBarCode(bar);
  return d[2] || '';
}

export function labelSeriesDigit(digit: string): string {
  if (digit === '1') return '한돈(1)';
  if (digit === '3') return '한우(3)';
  if (digit === '2') return '수입(2)';
  if (digit === '4') return '계육(4)';
  return digit ? `계열${digit}` : '—';
}

export interface PosBarCodeBreakdown {
  raw: string;
  pos6: string;
  padded7: string;
  prefix3: string;
  prefixLabel: string;
  scaleCode3: string;
  /** 6자리 기준 3번째 자리 — 201 vs 203 구분 */
  seriesDigit: string;
  seriesDigitLabel: string;
  /** 7자리(앞0패딩) 기준 4번째 자리 — seriesDigit와 동일 의미 */
  digit4InPadded7: string;
  /** 7자리(앞0패딩) 기준 7번째 자리 — 저울번호 일의 자리 */
  digit7InPadded7: string;
  hasExtraDigits: boolean;
}

export function breakdownPosBarCode(bar: string): PosBarCodeBreakdown | null {
  const raw = digitsOnly(bar);
  if (!raw) return null;
  const pos6 = raw.padStart(6, '0').slice(-6);
  if (!/^[0-9]{6}$/.test(pos6)) return null;

  const prefix3 = pos6.slice(0, 3);
  const scaleCode3 = pos6.slice(3);
  const padded7 = pos6.padStart(7, '0');
  const seriesDigit = pos6[2] || '';

  return {
    raw,
    pos6,
    padded7,
    prefix3,
    prefixLabel: labelPrefix3(prefix3),
    scaleCode3,
    seriesDigit,
    seriesDigitLabel: labelSeriesDigit(seriesDigit),
    digit4InPadded7: padded7[3] || '',
    digit7InPadded7: padded7[6] || '',
    hasExtraDigits: raw.length > 6,
  };
}

export const POS_BARCODE_STRUCTURE_HINT =
  'POS 6자리 = [1~3] 계열(201·203…) + [4~6] 저울번호. 7자리(앞0)로 보면 4번째=계열구분(1한돈·3한우), 7번째=저울 일의자리. 중복은 앞3·3번째 자리 확인.';

export interface PosGoodInput {
  posBarCode: string;
  name: string;
  categoryCode?: string;
  categoryName?: string;
  scaleUse?: string;
  sellPri?: number;
}

export interface ClassifiedGoods {
  unique: Array<PosGoodInput & { scaleCode3: string; prefix3: string; code: number }>;
  pending: Array<{
    scaleCode3: string;
    items: Array<PosGoodInput & { prefix3: string; code: number }>;
  }>;
}

export function classifyPosGoods(rows: PosGoodInput[]): ClassifiedGoods {
  const six = rows
    .map(r => {
      const posBarCode = normalizePosBarCode(r.posBarCode);
      if (!isSixDigitPosBarCode(posBarCode)) return null;
      const name = String(r.name || '').trim() || posBarCode;
      return {
        posBarCode,
        name,
        categoryCode: r.categoryCode,
        categoryName: r.categoryName,
        scaleUse: r.scaleUse,
        sellPri: r.sellPri,
        scaleCode3: scaleCode3FromBarCode(posBarCode),
        prefix3: prefix3FromBarCode(posBarCode),
        code: scaleCodeNumberFromBarCode(posBarCode),
      };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);

  const byScale3 = new Map<string, typeof six>();
  six.forEach(row => {
    const list = byScale3.get(row.scaleCode3) || [];
    list.push(row);
    byScale3.set(row.scaleCode3, list);
  });

  const unique: ClassifiedGoods['unique'] = [];
  const pending: ClassifiedGoods['pending'] = [];

  byScale3.forEach((items, scaleCode3) => {
    if (items.length === 1) {
      unique.push(items[0]);
    } else {
      pending.push({ scaleCode3, items });
    }
  });

  unique.sort((a, b) => a.posBarCode.localeCompare(b.posBarCode));
  pending.sort((a, b) => a.scaleCode3.localeCompare(b.scaleCode3));

  return { unique, pending };
}
