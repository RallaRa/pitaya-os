import type { AccountType } from '@/lib/accounting/types';

export interface DefaultAccountSeed {
  code: string;
  name: string;
  type: AccountType;
  parentCode?: string;
  allowEntry?: boolean;
  perItemOffset?: boolean;
  usePartner?: boolean;
  externalCode?: string;
}

/** 영림원 SystemEver 표준 계정과목표 (K-GAAP 3자리 코드) — 도·소매·정육·서비스업 */
const FUND_CODES = new Set(['101', '102', '103', '104', '105', '106']);

function ac(
  code: string,
  name: string,
  type: AccountType,
  opts: Omit<DefaultAccountSeed, 'code' | 'name' | 'type'> = {},
): DefaultAccountSeed {
  return { code, name, type, allowEntry: true, ...opts };
}

const ASSETS: DefaultAccountSeed[] = [
  // 당좌자산
  ac('101', '현금', 'asset'),
  ac('102', '당좌예금', 'asset'),
  ac('103', '보통예금', 'asset'),
  ac('104', '기타제예금', 'asset'),
  ac('105', '정기예금', 'asset'),
  ac('106', '정기적금', 'asset'),
  ac('107', '유가증권', 'asset'),
  ac('108', '외상매출금', 'asset', { perItemOffset: true, usePartner: true }),
  ac('110', '받을어음', 'asset', { perItemOffset: true }),
  ac('114', '단기대여금', 'asset'),
  ac('120', '미수금', 'asset', { perItemOffset: true, usePartner: true }),
  ac('131', '선급금', 'asset', { usePartner: true }),
  ac('133', '선급비용', 'asset'),
  ac('134', '가지급금', 'asset'),
  ac('135', '부가세대급금', 'asset'),
  ac('136', '선납세금', 'asset'),
  ac('137', '종업원대여금', 'asset'),
  ac('138', '전도금', 'asset'),
  ac('199', '미수수익', 'asset'),
  // 재고자산
  ac('146', '상품', 'asset'),
  ac('150', '제품', 'asset'),
  ac('153', '원재료', 'asset'),
  ac('169', '재공품', 'asset'),
  // 투자자산
  ac('176', '장기성예금', 'asset'),
  ac('177', '특정예금', 'asset'),
  ac('178', '투자유가증권', 'asset'),
  ac('179', '장기대여금', 'asset'),
  ac('188', '임차보증금', 'asset'),
  ac('189', '전세권', 'asset'),
  ac('190', '기타보증금', 'asset'),
  ac('193', '부도어음', 'asset'),
  // 유형자산
  ac('201', '토지', 'asset', { allowEntry: false }),
  ac('202', '건물', 'asset', { allowEntry: false }),
  ac('204', '구축물', 'asset', { allowEntry: false }),
  ac('206', '기계장치', 'asset', { allowEntry: false }),
  ac('208', '차량운반구', 'asset'),
  ac('210', '공구와기구', 'asset'),
  ac('212', '비품', 'asset'),
  ac('214', '건설중인자산', 'asset', { allowEntry: false }),
  // 무형자산
  ac('231', '영업권', 'asset', { allowEntry: false }),
  ac('232', '특허권', 'asset', { allowEntry: false }),
  ac('233', '상표권', 'asset', { allowEntry: false }),
  ac('236', '면허권', 'asset', { allowEntry: false }),
  ac('240', '소프트웨어', 'asset'),
];

const LIABILITIES: DefaultAccountSeed[] = [
  // 유동부채
  ac('251', '외상매입금', 'liability', { perItemOffset: true, usePartner: true }),
  ac('252', '지급어음', 'liability', { perItemOffset: true }),
  ac('253', '미지급금', 'liability', { usePartner: true }),
  ac('254', '예수금', 'liability'),
  ac('255', '부가세예수금', 'liability'),
  ac('256', '당좌차월', 'liability'),
  ac('257', '가수금', 'liability'),
  ac('258', '예수보증금', 'liability'),
  ac('259', '선수금', 'liability', { usePartner: true }),
  ac('260', '단기차입금', 'liability'),
  ac('261', '미지급세금', 'liability'),
  ac('262', '미지급비용', 'liability'),
  ac('263', '선수수익', 'liability'),
  // 비유동부채
  ac('291', '사채', 'liability', { allowEntry: false }),
  ac('293', '장기차입금', 'liability', { allowEntry: false }),
];

const EQUITY: DefaultAccountSeed[] = [
  ac('331', '자본금', 'equity', { allowEntry: false }),
  ac('341', '자본잉여금', 'equity', { allowEntry: false }),
  ac('351', '이익준비금', 'equity', { allowEntry: false }),
  ac('355', '임의적립금', 'equity', { allowEntry: false }),
  ac('375', '이월이익잉여금', 'equity', { allowEntry: false }),
];

const REVENUE: DefaultAccountSeed[] = [
  ac('401', '상품매출', 'revenue'),
  ac('402', '용역매출', 'revenue'),
  ac('403', '매출에누리및환입', 'revenue'),
  ac('404', '제품매출', 'revenue'),
  ac('407', '공사수입금', 'revenue'),
  ac('412', '기타매출', 'revenue'),
  ac('901', '이자수익', 'revenue'),
  ac('902', '유가증권이자', 'revenue'),
  ac('903', '배당금수익', 'revenue'),
  ac('904', '수입임대료', 'revenue'),
  ac('906', '유가증권처분이익', 'revenue'),
  ac('907', '외환차익', 'revenue'),
  ac('909', '수입수수료', 'revenue'),
  ac('911', '관세환급금', 'revenue'),
  ac('912', '판매장려금', 'revenue'),
  ac('914', '유형자산처분이익', 'revenue'),
  ac('915', '투자자산처분이익', 'revenue'),
  ac('917', '국고보조금', 'revenue'),
  ac('930', '잡이익', 'revenue'),
];

const COGS: DefaultAccountSeed[] = [
  ac('451', '상품매출원가', 'expense'),
  ac('455', '제품매출원가', 'expense'),
  ac('460', '매입', 'expense'),
];

/** 제조원가 (500번대) — 제조·가공업용 */
const MANUFACTURING: DefaultAccountSeed[] = [
  ac('501', '원재료비', 'expense'),
  ac('502', '부재료비', 'expense'),
  ac('503', '급여', 'expense'),
  ac('504', '임금', 'expense'),
  ac('505', '상여금', 'expense'),
  ac('510', '퇴직급여', 'expense'),
  ac('511', '복리후생비', 'expense'),
  ac('512', '여비교통비', 'expense'),
  ac('513', '접대비', 'expense'),
  ac('514', '통신비', 'expense'),
  ac('515', '가스수도료', 'expense'),
  ac('516', '전력비', 'expense'),
  ac('517', '세금과공과', 'expense'),
  ac('518', '감가상각비', 'expense'),
  ac('519', '지급임차료', 'expense'),
  ac('520', '수선비', 'expense'),
  ac('521', '보험료', 'expense'),
  ac('522', '차량유지비', 'expense'),
  ac('524', '운반비', 'expense'),
  ac('525', '교육훈련비', 'expense'),
  ac('526', '도서인쇄비', 'expense'),
  ac('527', '회의비', 'expense'),
  ac('528', '포장비', 'expense'),
  ac('530', '소모품비', 'expense'),
  ac('531', '지급수수료', 'expense'),
  ac('532', '보관료', 'expense'),
  ac('533', '외주가공비', 'expense'),
  ac('536', '잡비', 'expense'),
];

/** 판매비와관리비 (800번대) */
const SGA: DefaultAccountSeed[] = [
  ac('801', '임원급여', 'expense'),
  ac('802', '급료', 'expense'),
  ac('803', '상여금', 'expense'),
  ac('804', '제수당', 'expense'),
  ac('805', '잡급', 'expense'),
  ac('811', '복리후생비', 'expense'),
  ac('812', '여비교통비', 'expense'),
  ac('813', '접대비', 'expense'),
  ac('814', '통신비', 'expense'),
  ac('815', '수도광열비', 'expense'),
  ac('816', '전력비', 'expense'),
  ac('817', '세금과공과', 'expense'),
  ac('818', '감가상각비', 'expense'),
  ac('819', '사무실임차료', 'expense'),
  ac('820', '수선비', 'expense'),
  ac('821', '보험료', 'expense'),
  ac('822', '차량유지비', 'expense'),
  ac('823', '연구개발비', 'expense'),
  ac('824', '운반비', 'expense'),
  ac('825', '교육훈련비', 'expense'),
  ac('826', '도서인쇄비', 'expense'),
  ac('827', '회의비', 'expense'),
  ac('828', '포장비', 'expense'),
  ac('829', '사무용품비', 'expense'),
  ac('830', '소모품비', 'expense'),
  ac('831', '지급수수료', 'expense'),
  ac('832', '보관료', 'expense'),
  ac('833', '광고선전비', 'expense'),
  ac('834', '판매촉진비', 'expense'),
  ac('835', '대손상각비', 'expense'),
  ac('836', '기밀비', 'expense'),
  ac('837', '건물관리비', 'expense'),
  ac('838', '수출제비용', 'expense'),
  ac('839', '판매수수료', 'expense'),
  ac('840', '무형고정자산상각', 'expense'),
  ac('842', '견본비', 'expense'),
  ac('848', '잡비', 'expense'),
];

const NON_OPERATING_EXPENSE: DefaultAccountSeed[] = [
  ac('931', '이자비용', 'expense'),
  ac('932', '외환차손', 'expense'),
  ac('933', '기부금', 'expense'),
  ac('938', '유가증권처분손실', 'expense'),
  ac('939', '재고자산감모손실', 'expense'),
  ac('940', '재고자산평가손실', 'expense'),
  ac('950', '유형자산처분손실', 'expense'),
  ac('951', '투자자산처분손실', 'expense'),
  ac('960', '잡손실', 'expense'),
  ac('998', '법인세등', 'expense', { allowEntry: false }),
  ac('999', '소득세등', 'expense', { allowEntry: false }),
];

export const DEFAULT_CHART_OF_ACCOUNTS: DefaultAccountSeed[] = [
  ...ASSETS,
  ...LIABILITIES,
  ...EQUITY,
  ...REVENUE,
  ...COGS,
  ...MANUFACTURING,
  ...SGA,
  ...NON_OPERATING_EXPENSE,
];

export function isFundAccountCode(code: string): boolean {
  return FUND_CODES.has(code);
}

export function defaultAccountToFirestore(
  acct: DefaultAccountSeed,
  storeId: string,
) {
  const externalCode = acct.externalCode || acct.code;
  return {
    storeId,
    code: acct.code,
    name: acct.name,
    type: acct.type,
    parentCode: acct.parentCode || '',
    externalCode,
    allowEntry: acct.allowEntry !== false,
    perItemOffset: acct.perItemOffset || false,
    usePartner: acct.usePartner || false,
    isFundAccount: isFundAccountCode(acct.code),
    isActive: true,
    memo: '',
    sortOrder: parseInt(acct.code, 10) || 0,
  };
}
