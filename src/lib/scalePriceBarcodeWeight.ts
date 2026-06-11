/**
 * Ishida 금액 내장형 저울 바코드 → 대략 중량(kg) 역산
 *
 * POS Sell_Pri는 신뢰하지 않음(포스에 실판매 단가 없음).
 * 역산은 매입단가→판매단가 설정 기능 완료 후,
 * Pitaya item_prices(기간별 판가) 기준으로만 수행한다.
 */

const MIN_KG = 0.015;
const MAX_KG = 15;

export function digitsOnlyBarcode(barcode: string): string {
  return String(barcode || '').replace(/\D/g, '');
}

/** 2 접두 EAN-13 금액 바코드 (PLU + 총액) */
export function isPriceEmbeddedScaleBarcode(barcode: string, totalPrice?: number): boolean {
  const d = digitsOnlyBarcode(barcode);
  if (!d.startsWith('2')) return false;
  if (d.length !== 12 && d.length !== 13) return false;

  if (totalPrice != null && totalPrice > 0) {
    const priceStart = d.length === 13 ? 6 : 5;
    const embedded = parseInt(d.slice(priceStart, priceStart + 5), 10);
    if (embedded > 0 && Math.abs(embedded - totalPrice) <= 1) return true;
  }

  return true;
}

/** POS Sale_Count가 kg가 아니라 수량(1개)처럼 보이는지 */
export function saleCountLooksLikePieceQty(saleCount: number): boolean {
  if (saleCount <= 0) return true;
  if (Number.isInteger(saleCount) && saleCount >= 1 && saleCount <= 99) return true;
  return false;
}

function inWeightRange(kg: number): boolean {
  return kg >= MIN_KG && kg <= MAX_KG;
}

/** 10g 단위 반올림 — “어바웃” 표시용 */
export function roundApproxKg(kg: number): number {
  const grams = Math.round(kg * 1000);
  const roundedGrams = Math.round(grams / 10) * 10;
  return Math.max(MIN_KG, roundedGrams / 1000);
}

export function formatApproxWeight(kg: number): string {
  if (!kg || kg <= 0) return '';
  const rounded = roundApproxKg(kg);
  if (rounded >= 1) return `~${rounded.toFixed(2)}kg`;
  const grams = Math.round(rounded * 1000);
  return `~${grams}g`;
}

/** Pitaya 기간별 판가 (매입단가+마진 등 — 추후 판매단가 설정 기능) */
export interface CatalogSellingPrice {
  /** kg당 판매단가(원) */
  pricePerKg: number;
  /** 100g당이면 true — displayPrice가 100g 기준일 때 */
  per100g?: boolean;
  basis?: string;
}

/**
 * 금액 바코드 + Pitaya 판가 → 대략 kg
 * (POS sellPrice 사용 금지)
 */
export function inferApproxWeightKgFromCatalogPrice(params: {
  barcode?: string;
  totalPrice: number;
  saleCount?: number;
  sellingPrice: CatalogSellingPrice;
}): number | null {
  const { barcode, totalPrice, saleCount = 0, sellingPrice } = params;
  const { pricePerKg, per100g } = sellingPrice;

  if (totalPrice <= 0 || pricePerKg <= 0) return null;
  if (!isPriceEmbeddedScaleBarcode(barcode || '', totalPrice)) return null;

  if (!saleCountLooksLikePieceQty(saleCount) && inWeightRange(saleCount)) {
    return roundApproxKg(saleCount);
  }
  if (!saleCountLooksLikePieceQty(saleCount)) return null;

  const unitKg = per100g ? pricePerKg / 10 : pricePerKg;
  if (unitKg <= 0) return null;

  const kg = totalPrice / unitKg;
  if (!inWeightRange(kg)) return null;

  return roundApproxKg(kg);
}

export interface ResolvedPosLineQty {
  saleCount: number;
  qtyUnit: 'kg' | 'ea';
  qtyApprox?: boolean;
}

/** 동기화 기본 — 역산 없이 POS 원값 유지 */
export function resolvePosLineQuantity(line: {
  barcode?: string;
  saleCount?: number;
  sellPrice?: number;
  totalPrice?: number;
}): ResolvedPosLineQty {
  return {
    saleCount: Number(line.saleCount ?? 0),
    qtyUnit: 'ea',
  };
}

/**
 * 매입단가→판매단가 기능 연동 후 sync에서 호출.
 * lookupSellingPriceForLine(storeId, goodsName, saleDate) 구현 후 사용.
 */
export function resolvePosLineQuantityWithCatalogPrice(
  line: {
    barcode?: string;
    saleCount?: number;
    totalPrice?: number;
  },
  sellingPrice: CatalogSellingPrice | null | undefined,
): ResolvedPosLineQty {
  const saleCount = Number(line.saleCount ?? 0);
  const totalPrice = Number(line.totalPrice ?? 0);

  if (!sellingPrice) {
    return { saleCount, qtyUnit: 'ea' };
  }

  const approxKg = inferApproxWeightKgFromCatalogPrice({
    barcode: line.barcode,
    totalPrice,
    saleCount,
    sellingPrice,
  });

  if (approxKg != null) {
    return { saleCount: approxKg, qtyUnit: 'kg', qtyApprox: true };
  }

  return { saleCount, qtyUnit: 'ea' };
}
