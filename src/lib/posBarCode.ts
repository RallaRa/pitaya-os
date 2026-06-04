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
