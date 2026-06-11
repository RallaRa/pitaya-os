/** POS SaD 품목명 → 매출 카테고리 (소고기·돼지·닭·양념·기타) */

export type SalesCategoryKey = 'beef' | 'pork' | 'chicken' | 'sauce' | 'other';

export const SALES_CATEGORY_ORDER: SalesCategoryKey[] = [
  'beef', 'pork', 'chicken', 'sauce', 'other',
];

export const SALES_CATEGORY_LABELS: Record<SalesCategoryKey, string> = {
  beef: '소고기',
  pork: '돼지고기',
  chicken: '닭고기',
  sauce: '양념/소스',
  other: '기타',
};

export const SALES_CATEGORY_COLORS: Record<SalesCategoryKey, string> = {
  beef: '#f87171',
  pork: '#fb923c',
  chicken: '#fbbf24',
  sauce: '#34d399',
  other: '#94a3b8',
};

export type SalesCategoryKeywords = Record<SalesCategoryKey, string[]>;

export const DEFAULT_SALES_CATEGORY_KEYWORDS: SalesCategoryKeywords = {
  beef: ['한우', '소고기', '등심', '채끝', '갈비', '사태', '우둔', '안심', '목심', '양지', '차돌', '토시', '설도'],
  pork: ['돼지', '삼겹', '목살', '한돈', '앞다리', '뒤다리', '갈매기', '항정', '수입돈'],
  chicken: ['닭', '닭고기', '닭가슴', '닭다리', '닭날개', '닭봉'],
  sauce: ['양념', '소스', '마늘', '고추장', '간장', '불고기', '제육', '양념육', '장아찌', '절임'],
  other: [],
};

export interface SalesCategoryBucket {
  amount: number;
  qty: number;
  lineCount: number;
  pct: number;
}

export interface SalesCategoryAggregate {
  storeId: string;
  date: string;
  categories: Record<SalesCategoryKey, SalesCategoryBucket>;
  totalAmount: number;
  totalQty: number;
  lineCount: number;
}

export interface SalesLineInput {
  name?: string;
  goodsName?: string;
  amount?: number;
  totalPrice?: number;
  netSales?: number;
  qty?: number;
  saleCount?: number;
}

function normalizeKeywords(
  custom?: Partial<SalesCategoryKeywords>,
): SalesCategoryKeywords {
  const merged = { ...DEFAULT_SALES_CATEGORY_KEYWORDS };
  if (!custom) return merged;
  for (const key of SALES_CATEGORY_ORDER) {
    if (Array.isArray(custom[key]) && custom[key]!.length > 0) {
      merged[key] = custom[key]!;
    }
  }
  return merged;
}

export function classifySalesCategory(
  goodsName: string,
  customKeywords?: Partial<SalesCategoryKeywords>,
): SalesCategoryKey {
  const name = String(goodsName || '').trim();
  if (!name) return 'other';
  const keywords = normalizeKeywords(customKeywords);
  const lower = name.toLowerCase();

  for (const key of ['beef', 'pork', 'chicken', 'sauce'] as SalesCategoryKey[]) {
    const list = keywords[key];
    if (list.some(kw => lower.includes(kw.toLowerCase()))) return key;
  }
  return 'other';
}

export function aggregateSalesCategories(
  items: SalesLineInput[],
  customKeywords?: Partial<SalesCategoryKeywords>,
): Omit<SalesCategoryAggregate, 'storeId' | 'date'> {
  const empty = (): SalesCategoryBucket => ({ amount: 0, qty: 0, lineCount: 0, pct: 0 });
  const categories: Record<SalesCategoryKey, SalesCategoryBucket> = {
    beef: empty(),
    pork: empty(),
    chicken: empty(),
    sauce: empty(),
    other: empty(),
  };

  let totalAmount = 0;
  let totalQty = 0;
  let lineCount = 0;

  for (const it of items || []) {
    const name = it.name || it.goodsName || '';
    const key = classifySalesCategory(name, customKeywords);
    const amount = Number(it.netSales ?? it.amount ?? it.totalPrice ?? 0);
    const qty = Number(it.qty ?? it.saleCount ?? 0);
    categories[key].amount += amount;
    categories[key].qty += qty;
    categories[key].lineCount += 1;
    totalAmount += amount;
    totalQty += qty;
    lineCount += 1;
  }

  for (const key of SALES_CATEGORY_ORDER) {
    categories[key].pct = totalAmount > 0
      ? Math.round((categories[key].amount / totalAmount) * 1000) / 10
      : 0;
  }

  return { categories, totalAmount, totalQty, lineCount };
}
