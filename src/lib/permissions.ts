export interface MenuItem {
  key: string;
  label: string;
  href: string;
  category: string;
}

// ✅ 메뉴 추가 시 여기에만 추가하면 권한설정에 자동 반영
export const ALL_MENUS: MenuItem[] = [
  { key: 'ai_chat',             label: 'AI 대화모드',         href: '/dashboard/ai',                    category: '메인' },
  { key: 'ai_report',           label: 'AI 일마감보고 작성',   href: '/dashboard/report/input',          category: '메인' },
  { key: 'sales',               label: '일일 판매내역 분석',   href: '/dashboard/report/sales_ai',       category: '메인' },
  { key: 'hygiene',             label: '위생 점검일지',        href: '/dashboard/hygiene',               category: '메인' },
  { key: 'view',                label: '일마감내역',           href: '/dashboard/report/view',           category: '메인' },
  { key: 'view',                label: '달력매출',             href: '/dashboard/report/calendar',       category: '메인' },
  { key: 'settings_store',      label: '매장 설정',            href: '/dashboard/settings/store',        category: '설정' },
  { key: 'settings_permission', label: '권한 설정',            href: '/dashboard/settings/permission',   category: '설정' },
];

export type Role = 'superuser' | 'admin' | 'user' | 'staff';

// 기본 권한값
export const DEFAULT_PERMISSIONS: Record<Role, Record<string, boolean>> = {
  superuser: Object.fromEntries(ALL_MENUS.map(m => [m.key, true])),
  admin: Object.fromEntries(ALL_MENUS.map(m => [
    m.key,
    !['settings_permission'].includes(m.key)
  ])),
  user: Object.fromEntries(ALL_MENUS.map(m => [
    m.key,
    !['settings_store', 'settings_permission'].includes(m.key)
  ])),
  staff: Object.fromEntries(ALL_MENUS.map(m => [
    m.key,
    !['settings_store', 'settings_permission'].includes(m.key)
  ])),
};
