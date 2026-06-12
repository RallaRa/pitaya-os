/** 사이드바·권한 그룹 공통 메뉴 키 (단일 소스) */

export const MENU_ACCESS_DEFINITIONS = [
  { key: 'dashboard',           label: '대시보드',       previewLabel: '대시보드',           icon: '📊' },
  { key: 'ai',                  label: 'AI',             previewLabel: 'AI 대화모드',         icon: '✨' },
  { key: 'sales',               label: '매출키인',       previewLabel: 'AI 매출관리',         icon: '✍️' },
  { key: 'purchase',            label: '매입',           previewLabel: 'AI 매입관리',         icon: '🛒' },
  // ── 구매관리 모듈 ──
  { key: 'purchaseMgmt',        label: '구매관리',       previewLabel: '구매관리 (전체)',     icon: '🛒' },
  { key: 'purchaseInput',       label: '구매·매입',      previewLabel: '매입 등록·원장',      icon: '📥' },
  { key: 'purchaseAnalysis',    label: '구매·단가',      previewLabel: '품목별·매입단가',     icon: '📊' },
  { key: 'purchaseCompliance',  label: '구매·법정',      previewLabel: '거래내역·이력번호',   icon: '📋' },
  { key: 'purchaseMaster',      label: '구매·마스터',    previewLabel: '거래처·품목',         icon: '🏷️' },
  // ── 영업관리 모듈 ──
  { key: 'salesMgmt',           label: '영업관리',       previewLabel: '영업관리 (전체)',     icon: '📈' },
  { key: 'salesReport',         label: '영업·마감',      previewLabel: '일마감·달력매출',     icon: '📅' },
  { key: 'salesManual',         label: '영업·키인',      previewLabel: '매출 키인·분석',      icon: '✍️' },
  { key: 'salesAnalysis',       label: '영업·분석',      previewLabel: '매출추이·예측',       icon: '🔮' },
  { key: 'salesCustomer',       label: '영업·고객',      previewLabel: '고객·여정',           icon: '🧑‍🤝‍🧑' },
  { key: 'salesPromotion',      label: '영업·판촉',      previewLabel: '쿠폰·주문·사이니지',  icon: '🏪' },
  { key: 'salesScale',          label: '영업·저울',      previewLabel: '저울 코드',           icon: '⚖️' },
  { key: 'report',              label: '보고서',         previewLabel: '일마감·달력매출',     icon: '📈' },
  { key: 'messenger',           label: '메신저',         previewLabel: '메신저',             icon: '💬' },
  { key: 'hygiene',             label: '위생',           previewLabel: '위생 점검일지',       icon: '📋' },
  { key: 'hrCalendar',          label: 'HR·캘린더',      previewLabel: '캘린더·출퇴근',     icon: '📅' },
  { key: 'members',             label: '사원',           previewLabel: '사원등록',           icon: '👥' },
  { key: 'scaleCode',           label: '저울',           previewLabel: '저울 코드 관리',     icon: '⚖️' },
  { key: 'salesForecast',       label: '매출추이',       previewLabel: '품목별 매출 추이',   icon: '📉' },
  { key: 'suppliers',           label: '거래처',         previewLabel: '거래처 관리',         icon: '🏢' },
  { key: 'predictionVariables', label: '예측변수',       previewLabel: 'AI 예측 변수',       icon: '🎛️' },
  { key: 'customers',           label: '고객',           previewLabel: '고객 관리',           icon: '🧑‍🤝‍🧑' },
  { key: 'predictionHistory',   label: '예측분석',       previewLabel: '예측분석',           icon: '🔮' },
  { key: 'items',               label: '품목',           previewLabel: '품목관리',           icon: '🏷️' },
  { key: 'store',               label: '매장기능',       previewLabel: '쿠폰·주문·사이니지', icon: '🏪' },
  { key: 'keywords',            label: '키워드',         previewLabel: '키워드 관리',         icon: '🔑' },
  { key: 'settings',            label: '설정',           previewLabel: '설정',               icon: '⚙️' },
  { key: 'permissionGroup',     label: '권한그룹',       previewLabel: '권한 그룹 관리',     icon: '🛡️' },
  { key: 'memberGroup',         label: '멤버그룹',       previewLabel: '멤버-그룹 연결',     icon: '🔗' },
  { key: 'stockTrader',         label: 'KIS AI매매',     previewLabel: 'KIS AI 자동매매',     icon: '📈' },
  // ── 회계 (영림원 SystemEver 구조) ──
  { key: 'accounting',          label: '회계',           previewLabel: '회계관리 개요',       icon: '📒' },
  { key: 'accountingMaster',    label: '회계·기본',      previewLabel: '계정과목·환경설정',   icon: '📋' },
  { key: 'accountingVoucher',   label: '회계·전표',      previewLabel: '전표입력·승인',       icon: '📝' },
  { key: 'accountingLedger',    label: '회계·장부',      previewLabel: '원장·분개장',         icon: '📖' },
  { key: 'accountingClosing',   label: '회계·결산',      previewLabel: '월마감·재무제표',     icon: '📊' },
  { key: 'accountingFund',      label: '회계·자금',      previewLabel: '입출금·지급예정',     icon: '💰' },
  // ── 인사/급여 (영림원 SystemEver 구조) ──
  { key: 'hrSystem',            label: '인사/급여',      previewLabel: '인사·급여 개요',       icon: '👔' },
  { key: 'hrPersonnel',         label: '인사·인사관리',  previewLabel: '사원·발령·인사현황',   icon: '🪪' },
  { key: 'hrAttendanceMgmt',    label: '인사·근태',      previewLabel: '출퇴근·근태집계',     icon: '⏱️' },
  { key: 'hrPayrollMaster',     label: '인사·급여기준',  previewLabel: '급여환경·기준급',     icon: '📋' },
  { key: 'hrPayrollCalc',       label: '인사·급여계산',  previewLabel: '급여계산·마감',       icon: '🧮' },
  { key: 'hrPayrollReport',     label: '인사·급여조회',  previewLabel: '명세·대장·4대보험',   icon: '💵' },
] as const;

export type MenuAccessKey = typeof MENU_ACCESS_DEFINITIONS[number]['key'];
export type MenuAccess = Record<MenuAccessKey, boolean>;

export const MENU_ACCESS_KEYS = MENU_ACCESS_DEFINITIONS.map(d => d.key) as MenuAccessKey[];

/** 권한 편집 UI — 모듈별 그룹 */
export const MENU_ACCESS_UI_GROUPS: {
  label: string;
  keys: MenuAccessKey[];
}[] = [
  {
    label: '기본',
    keys: ['dashboard', 'ai', 'messenger', 'hygiene', 'settings', 'keywords', 'permissionGroup', 'memberGroup'],
  },
  {
    label: '구매관리',
    keys: ['purchaseMgmt', 'purchaseInput', 'purchaseAnalysis', 'purchaseCompliance', 'purchaseMaster'],
  },
  {
    label: '영업관리',
    keys: ['salesMgmt', 'salesReport', 'salesManual', 'salesAnalysis', 'salesCustomer', 'salesPromotion', 'salesScale'],
  },
  {
    label: 'HR·캘린더',
    keys: ['hrCalendar', 'members'],
  },
  {
    label: '회계관리',
    keys: ['accounting', 'accountingMaster', 'accountingVoucher', 'accountingLedger', 'accountingClosing', 'accountingFund'],
  },
  {
    label: '인사/급여',
    keys: ['hrSystem', 'hrPersonnel', 'hrAttendanceMgmt', 'hrPayrollMaster', 'hrPayrollCalc', 'hrPayrollReport'],
  },
  {
    label: '슈퍼유저 전용',
    keys: ['stockTrader'],
  },
  {
    label: '레거시 (자동 호환)',
    keys: ['purchase', 'report', 'sales', 'suppliers', 'items', 'scaleCode', 'salesForecast', 'customers', 'predictionHistory', 'predictionVariables', 'store'],
  },
];

/** 테이블 요약 열 — 모듈 단위 */
export const MENU_ACCESS_TABLE_COLS: [MenuAccessKey, string][] = [
  ['dashboard', '대시'],
  ['purchaseMgmt', '구매'],
  ['salesMgmt', '영업'],
  ['accounting', '회계'],
  ['hrSystem', '인사'],
  ['ai', 'AI'],
  ['messenger', '메신'],
  ['hygiene', '위생'],
  ['settings', '설정'],
];

export const SYSTEM_GROUP_IDS = ['superuser', 'admin', 'staff'] as const;
export type SystemGroupId = typeof SYSTEM_GROUP_IDS[number];

export function createAllFalseMenuAccess(): MenuAccess {
  return Object.fromEntries(MENU_ACCESS_KEYS.map(k => [k, false])) as MenuAccess;
}

export function createAllTrueMenuAccess(): MenuAccess {
  return Object.fromEntries(MENU_ACCESS_KEYS.map(k => [k, true])) as MenuAccess;
}

export function mergeMenuAccess(
  base: Partial<MenuAccess> | null | undefined,
  fallback: Partial<MenuAccess> = {},
): MenuAccess {
  const allFalse = createAllFalseMenuAccess();
  return { ...allFalse, ...fallback, ...(base || {}) };
}

/** Firestore 저장값 + 시스템 그룹 기본값 병합 (누락 키 보정) */
export function menuAccessForGroup(
  groupId: string,
  stored: Partial<MenuAccess> | null | undefined,
): MenuAccess {
  const fallback = isSystemGroupId(groupId)
    ? DEFAULT_SYSTEM_GROUP_MENUS[groupId as SystemGroupId]
    : {};
  return mergeMenuAccess(stored, fallback);
}

export function isSystemGroupId(groupId: string): boolean {
  return (SYSTEM_GROUP_IDS as readonly string[]).includes(groupId);
}

export const DEFAULT_SYSTEM_GROUP_MENUS: Record<SystemGroupId, MenuAccess> = {
  superuser: createAllTrueMenuAccess(),
  admin: mergeMenuAccess(null, {
    ai: true, sales: true, purchase: true, report: true, messenger: true,
    members: true, store: true, hygiene: true, hrCalendar: true, scaleCode: true,
    salesForecast: true, suppliers: true, customers: true, predictionHistory: true,
    items: true, dashboard: true, keywords: true, settings: true,
    predictionVariables: true,
    purchaseMgmt: true, purchaseInput: true, purchaseAnalysis: true,
    purchaseCompliance: true, purchaseMaster: true,
    salesMgmt: true, salesReport: true, salesManual: true, salesAnalysis: true,
    salesCustomer: true, salesPromotion: true, salesScale: true,
    accounting: true, accountingMaster: true, accountingVoucher: true,
    accountingLedger: true, accountingClosing: true, accountingFund: true,
    hrSystem: true, hrPersonnel: true, hrAttendanceMgmt: true,
    hrPayrollMaster: true, hrPayrollCalc: true, hrPayrollReport: true,
    permissionGroup: false, memberGroup: false, stockTrader: false,
  }),
  staff: mergeMenuAccess(null, {
    ai: true, sales: true, purchase: true, report: true, messenger: true,
    hygiene: true, hrCalendar: true, items: true, dashboard: true, settings: true,
    members: false, store: false, permissionGroup: false, memberGroup: false,
    scaleCode: false, salesForecast: true, suppliers: false, predictionVariables: true,
    customers: false, predictionHistory: false, keywords: false,
    purchaseMgmt: true, purchaseInput: true, purchaseAnalysis: true,
    purchaseCompliance: true, purchaseMaster: false,
    salesMgmt: true, salesReport: true, salesManual: true, salesAnalysis: true,
    salesCustomer: false, salesPromotion: false, salesScale: false,
    accounting: false, accountingMaster: false, accountingVoucher: false,
    accountingLedger: false, accountingClosing: false, accountingFund: false,
    hrSystem: false, hrPersonnel: false, hrAttendanceMgmt: true,
    hrPayrollMaster: false, hrPayrollCalc: false, hrPayrollReport: false,
    stockTrader: false,
  }),
};

export const DEFAULT_SYSTEM_GROUP_NAMES: Record<SystemGroupId, string> = {
  superuser: '슈퍼유저',
  admin: '점장',
  staff: '직원',
};

/** 구 groupId → 통일 groupId */
export const LEGACY_GROUP_ID_MAP: Record<string, SystemGroupId | string> = {
  master: 'superuser',
  owner: 'superuser',
  user: 'staff',
  staff: 'staff',
  superuser: 'superuser',
  admin: 'admin',
};

export function normalizePermissionGroupId(groupId?: string | null): string {
  if (!groupId) return 'staff';
  const g = groupId.trim();
  if (!g) return 'staff';
  return LEGACY_GROUP_ID_MAP[g] ?? g;
}
