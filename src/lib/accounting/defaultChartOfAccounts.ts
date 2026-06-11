import type { AccountType } from '@/lib/accounting/types';

/** 정육·소매 중소기업용 기본 계정과목 (영림원 표준 계정 체계 참고) */
export const DEFAULT_CHART_OF_ACCOUNTS: Array<{
  code: string;
  name: string;
  type: AccountType;
  parentCode?: string;
  allowEntry?: boolean;
  perItemOffset?: boolean;
  usePartner?: boolean;
}> = [
  // 자산
  { code: '101', name: '현금', type: 'asset', allowEntry: true },
  { code: '102', name: '보통예금', type: 'asset', allowEntry: true },
  { code: '103', name: '당좌예금', type: 'asset', allowEntry: true },
  { code: '108', name: '외상매출금', type: 'asset', allowEntry: true, perItemOffset: true, usePartner: true },
  { code: '120', name: '받을어음', type: 'asset', allowEntry: true, perItemOffset: true },
  { code: '135', name: '상품', type: 'asset', allowEntry: true },
  { code: '136', name: '원재료', type: 'asset', allowEntry: true },
  { code: '141', name: '부가세대급금', type: 'asset', allowEntry: true },
  { code: '199', name: '미수수익', type: 'asset', allowEntry: true },
  // 부채
  { code: '201', name: '외상매입금', type: 'liability', allowEntry: true, perItemOffset: true, usePartner: true },
  { code: '251', name: '지급어음', type: 'liability', allowEntry: true, perItemOffset: true },
  { code: '255', name: '미지급금', type: 'liability', allowEntry: true, usePartner: true },
  { code: '256', name: '미지급비용', type: 'liability', allowEntry: true },
  { code: '259', name: '부가세예수금', type: 'liability', allowEntry: true },
  { code: '260', name: '예수금', type: 'liability', allowEntry: true },
  // 자본
  { code: '301', name: '자본금', type: 'equity', allowEntry: false },
  { code: '331', name: '이익잉여금', type: 'equity', allowEntry: false },
  // 수익
  { code: '401', name: '상품매출', type: 'revenue', allowEntry: true },
  { code: '402', name: '용역매출', type: 'revenue', allowEntry: true },
  { code: '404', name: '매출할인', type: 'revenue', allowEntry: true },
  // 비용
  { code: '501', name: '상품매출원가', type: 'expense', allowEntry: true },
  { code: '802', name: '급여', type: 'expense', allowEntry: true },
  { code: '803', name: '퇴직급여', type: 'expense', allowEntry: true },
  { code: '811', name: '복리후생비', type: 'expense', allowEntry: true },
  { code: '812', name: '여비교통비', type: 'expense', allowEntry: true },
  { code: '813', name: '통신비', type: 'expense', allowEntry: true },
  { code: '814', name: '수도광열비', type: 'expense', allowEntry: true },
  { code: '815', name: '세금과공과', type: 'expense', allowEntry: true },
  { code: '816', name: '감가상각비', type: 'expense', allowEntry: true },
  { code: '817', name: '지급임차료', type: 'expense', allowEntry: true },
  { code: '818', name: '수선비', type: 'expense', allowEntry: true },
  { code: '819', name: '보험료', type: 'expense', allowEntry: true },
  { code: '821', name: '접대비', type: 'expense', allowEntry: true },
  { code: '822', name: '광고선전비', type: 'expense', allowEntry: true },
  { code: '823', name: '운반비', type: 'expense', allowEntry: true },
  { code: '824', name: '차량유지비', type: 'expense', allowEntry: true },
  { code: '825', name: '소모품비', type: 'expense', allowEntry: true },
  { code: '826', name: '지급수수료', type: 'expense', allowEntry: true },
  { code: '901', name: '이자수익', type: 'revenue', allowEntry: true },
  { code: '931', name: '이자비용', type: 'expense', allowEntry: true },
  { code: '990', name: '법인세비용', type: 'expense', allowEntry: true },
];
