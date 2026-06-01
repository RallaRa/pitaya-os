/** 사이드바·권한 그룹 공통 메뉴 키 (단일 소스) */

export const MENU_ACCESS_DEFINITIONS = [
  { key: 'dashboard',           label: '대시보드',       previewLabel: '대시보드',           icon: '📊' },
  { key: 'ai',                  label: 'AI',             previewLabel: 'AI 대화모드',         icon: '✨' },
  { key: 'sales',               label: '매출키인',       previewLabel: 'AI 매출관리',         icon: '✍️' },
  { key: 'purchase',            label: '매입',           previewLabel: 'AI 매입관리',         icon: '🛒' },
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
] as const;

export type MenuAccessKey = typeof MENU_ACCESS_DEFINITIONS[number]['key'];
export type MenuAccess = Record<MenuAccessKey, boolean>;

export const MENU_ACCESS_KEYS = MENU_ACCESS_DEFINITIONS.map(d => d.key) as MenuAccessKey[];

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
    permissionGroup: false, memberGroup: false, predictionVariables: false,
  }),
  staff: mergeMenuAccess(null, {
    ai: true, sales: true, purchase: true, report: true, messenger: true,
    hygiene: true, hrCalendar: true, items: true, dashboard: true, settings: true,
    members: false, store: false, permissionGroup: false, memberGroup: false,
    scaleCode: false, salesForecast: true, suppliers: false, predictionVariables: false,
    customers: false, predictionHistory: false, keywords: false,
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
