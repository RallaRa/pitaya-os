export type LicenseModuleKey =
  | 'dashboard'
  | 'purchases'
  | 'hr'
  | 'hygiene'
  | 'messenger'
  | 'pos';

export interface ModuleLicense {
  enabled: boolean;
  plan?: string;
  expiry?: string | null;
}

export type StoreModules = Record<LicenseModuleKey, ModuleLicense>;

export const LICENSE_MODULE_META: Record<
  LicenseModuleKey,
  { label: string; description: string }
> = {
  dashboard: { label: '대시보드', description: 'AI 메인 대시보드 (독립 SaaS 모듈)' },
  purchases: { label: 'AI 매입관리', description: '매입 등록·원장·거래처' },
  hr:        { label: 'HR 관리', description: '캘린더·멤버·사원정보' },
  hygiene:   { label: '위생일지', description: '위생 점검일지' },
  messenger: { label: '메신저', description: '매장 내부 메신저' },
  pos:       { label: 'POS/매출', description: '일마감·매출 보고서' },
};

export function defaultStoreModules(): StoreModules {
  return {
    dashboard: { enabled: true, plan: 'pro', expiry: null },
    purchases: { enabled: true },
    hr:        { enabled: true },
    hygiene:   { enabled: true },
    messenger: { enabled: true },
    pos:       { enabled: true },
  };
}

/** permission_groups menuAccess key → license module */
export const MENU_KEY_TO_MODULE: Partial<Record<string, LicenseModuleKey>> = {
  purchase: 'purchases',
  messenger: 'messenger',
  hygiene: 'hygiene',
  hrCalendar: 'hr',
  report: 'pos',
  sales: 'pos',
  items: 'purchases',
  suppliers: 'purchases',
  members: 'hr',
};

export function pathToModule(pathname: string): LicenseModuleKey | null {
  if (pathname === '/dashboard' || pathname.startsWith('/dashboard/sales-forecast') ||
      pathname.startsWith('/dashboard/prediction-history') ||
      pathname.startsWith('/dashboard/settings/prediction-variables') ||
      pathname.startsWith('/dashboard/settings/widgets')) {
    return 'dashboard';
  }
  if (pathname.startsWith('/dashboard/report/purchases')) return 'purchases';
  if (pathname.startsWith('/dashboard/hr') || pathname.startsWith('/dashboard/settings/employees') ||
      pathname.startsWith('/dashboard/settings/departments')) {
    return 'hr';
  }
  if (pathname.startsWith('/dashboard/hygiene')) return 'hygiene';
  if (pathname.startsWith('/dashboard/messenger')) return 'messenger';
  if (pathname.startsWith('/dashboard/report')) return 'pos';
  if (pathname.startsWith('/dashboard/items') || pathname.startsWith('/dashboard/suppliers')) {
    return 'purchases';
  }
  return null;
}
