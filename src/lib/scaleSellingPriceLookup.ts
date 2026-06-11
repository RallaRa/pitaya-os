/**
 * POS 저울 라인 → Pitaya 기간별 판가 조회 (스텁)
 *
 * 매입단가 기준 판매단가 설정 기능 완료 후 구현:
 * - item_prices + (추후) selling_prices / margin 설정
 * - saleDate 기준 해당일 displayPrice → pricePerKg
 * - scale_codes / Goods.BarCode → 품목명 매핑
 */
import type { CatalogSellingPrice } from '@/lib/scalePriceBarcodeWeight';

export async function lookupCatalogSellingPriceForPosLine(_opts: {
  storeId: string;
  saleDate: string;
  goodsName?: string;
  barcode?: string;
}): Promise<CatalogSellingPrice | null> {
  return null;
}
