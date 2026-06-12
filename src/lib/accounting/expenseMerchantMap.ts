/** 카드 가맹점명 → 판관비 계정 (정육·소매 일반 키워드) */

export interface ExpenseAccountPick {
  accountCode: string;
  accountName: string;
}

const RULES: Array<{ pattern: RegExp; pick: ExpenseAccountPick }> = [
  { pattern: /skt|kt|lg\s*u\+|통신|telecom/i, pick: { accountCode: '814', accountName: '통신비' } },
  { pattern: /전력|한전|수도|가스|광열|에너지/i, pick: { accountCode: '815', accountName: '수도광열비' } },
  { pattern: /주유|oil|gs칼텍스|sk에너지|s-oil|현대오일/i, pick: { accountCode: '822', accountName: '차량유지비' } },
  { pattern: /보험|손해|생명|화재/i, pick: { accountCode: '821', accountName: '보험료' } },
  { pattern: /임대|부동산|관리비|건물/i, pick: { accountCode: '819', accountName: '사무실임차료' } },
  { pattern: /택배|운송|물류|cj대한통운|한진|로젠/i, pick: { accountCode: '824', accountName: '운반비' } },
  { pattern: /광고|네이버|카카오|구글|ad\b/i, pick: { accountCode: '833', accountName: '광고선전비' } },
  { pattern: /쿠팡|마트|다이소|이마트|홈플러스|소모|용품|오피스/i, pick: { accountCode: '830', accountName: '소모품비' } },
  { pattern: /식당|음식|카페|커피|배달|요기요|쿠팡이츠/i, pick: { accountCode: '811', accountName: '복리후생비' } },
  { pattern: /수수료|은행|카드|결제|토스|페이/i, pick: { accountCode: '831', accountName: '지급수수료' } },
];

const DEFAULT_EXPENSE: ExpenseAccountPick = { accountCode: '848', accountName: '잡비' };

export function classifyExpenseByMerchant(merchantName: string): ExpenseAccountPick {
  const name = String(merchantName || '').trim();
  for (const rule of RULES) {
    if (rule.pattern.test(name)) return rule.pick;
  }
  return DEFAULT_EXPENSE;
}
