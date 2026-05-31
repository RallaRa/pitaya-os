/** 고기류 품목 구분 */
export const MEAT_CATEGORIES = ['한돈', '한우', '수입육', '계육및기타'] as const;

/** 원부자재·포장재 구분 */
export const RAW_MATERIAL_CATEGORIES = ['박스', '용기', '봉투', '케이스', '스티커', '기타원부자재'] as const;

export type MeatCategory = (typeof MEAT_CATEGORIES)[number];
export type RawMaterialCategory = (typeof RAW_MATERIAL_CATEGORIES)[number];
export type PurchaseItemCategory = MeatCategory | RawMaterialCategory;

export const ALL_ITEM_CATEGORIES: PurchaseItemCategory[] = [
  ...MEAT_CATEGORIES,
  ...RAW_MATERIAL_CATEGORIES,
];

/** 품목관리 탭용 (전체 포함) */
export const ITEM_CATEGORIES_WITH_ALL = ['전체', ...ALL_ITEM_CATEGORIES];

export const PURCHASE_UNITS = [
  'kg', 'g', '개', '박스', '묶음', '마리', '팩', '세트', '롤', '장', '매', '뭉치',
];

const LEGACY_MEAT = new Set(['수입우', '수입돈', '계육', '기타']);

export function isMeatCategory(cat: string): boolean {
  return (MEAT_CATEGORIES as readonly string[]).includes(cat) || LEGACY_MEAT.has(cat);
}

export function isRawMaterialCategory(cat: string): boolean {
  return (RAW_MATERIAL_CATEGORIES as readonly string[]).includes(cat);
}

export function normalizeCategory(cat: string): string {
  const legacy: Record<string, PurchaseItemCategory> = {
    수입우: '수입육',
    수입돈: '수입육',
    계육: '계육및기타',
    기타: '계육및기타',
  };
  const trimmed = String(cat || '').trim();
  if (legacy[trimmed]) return legacy[trimmed];
  if ((ALL_ITEM_CATEGORIES as readonly string[]).includes(trimmed)) return trimmed;
  return trimmed;
}

/** 품명 키워드로 구분 추정 (OCR 보조) */
export function guessCategoryFromName(name: string): PurchaseItemCategory | '' {
  const n = name.replace(/\s/g, '');
  if (/박스|box/i.test(n)) return '박스';
  if (/용기|트레이|도시락|tray/i.test(n)) return '용기';
  if (/봉투|비닐|봉지|bag/i.test(n)) return '봉투';
  if (/케이스|case/i.test(n)) return '케이스';
  if (/스티커|라벨|label|스티컬/i.test(n)) return '스티커';
  if (/테이프|리본|포장지|랩|필름|원부자재|부자재|포장/i.test(n)) return '기타원부자재';
  return '';
}

export function normalizePurchaseItem(item: Record<string, unknown>): Record<string, unknown> {
  const name = String(item.name || '').trim();
  let category = normalizeCategory(String(item.category || ''));
  if (!category || (!isMeatCategory(category) && !isRawMaterialCategory(category))) {
    const guessed = guessCategoryFromName(name);
    if (guessed) category = guessed;
  }
  const meat = isMeatCategory(category);
  return {
    ...item,
    name,
    category,
    traceNo: meat ? String(item.traceNo || '') : '',
    origin: meat ? String(item.origin || '') : '',
    cut: meat ? String(item.cut || '') : '',
    grade: meat ? String(item.grade || '') : '',
  };
}

export const OCR_CATEGORY_RULES = `- 각 품목에 category 필드를 반드시 포함한다.
- category 값 (하나만 선택):
  · 고기: 한돈, 한우, 수입육, 계육및기타
  · 원부자재: 박스, 용기, 봉투, 케이스, 스티커, 기타원부자재
- 박스·용기·봉투·케이스·스티커·라벨·포장재·테이프 등은 원부자재로 분류한다.
- 고기류(한돈·한우·수입육·계육)만 이력번호·원산지·부위·등급을 추출한다. 원부자재는 해당 필드를 빈 문자열로 둔다.`;
