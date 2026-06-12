/**
 * 영림원 SystemEver WP 인사/급여관리 메뉴 트리
 * @see SystemEver 인사관리·근태관리·급여관리
 */
import type { MenuAccessKey } from '@/lib/menuAccessKeys';

export type HrSystemPermissionKey =
  | 'hrSystem'
  | 'hrPersonnel'
  | 'hrAttendanceMgmt'
  | 'hrPayrollMaster'
  | 'hrPayrollCalc'
  | 'hrPayrollReport';

export interface HrSystemMenuItem {
  href: string;
  label: string;
  description?: string;
  /** true면 Pitaya 기존 화면으로 이동 */
  external?: boolean;
}

export interface HrSystemMenuSection {
  id: string;
  label: string;
  permission: HrSystemPermissionKey;
  items: HrSystemMenuItem[];
}

export const HR_SYSTEM_MENU_SECTIONS: HrSystemMenuSection[] = [
  {
    id: 'personnel',
    label: '인사관리',
    permission: 'hrPersonnel',
    items: [
      { href: '/dashboard/hr/employee-register', label: '인사기록카드', description: '사원등록·인사카드·계약정보', external: true },
      { href: '/dashboard/settings/departments', label: '조직·부서', description: '부서 등록·조직도', external: true },
      { href: '/dashboard/hr-system/personnel/appointments', label: '발령관리', description: '승진·전보·직책 변경' },
      { href: '/dashboard/hr-system/personnel/status', label: '인사현황', description: '재직·부서·직급별 현황' },
      { href: '/dashboard/hr-system/personnel/hire-resign', label: '입·퇴사 현황', description: '입사·퇴사자 명단' },
    ],
  },
  {
    id: 'attendance',
    label: '근태관리',
    permission: 'hrAttendanceMgmt',
    items: [
      { href: '/dashboard/hr/attendance', label: '출퇴근 등록', description: '일별 출퇴근 기록', external: true },
      { href: '/dashboard/hr-system/attendance/monthly-summary', label: '월별 근태집계', description: '출근·지각·결근 집계' },
      { href: '/dashboard/settings/leave-status', label: '연차·휴가 잔액', description: '사원별 연차 사용 현황', external: true },
      { href: '/dashboard/hr-system/attendance/absence', label: '결근·지각 현황', description: '미출근·지각자 조회' },
    ],
  },
  {
    id: 'payrollMaster',
    label: '급여기준',
    permission: 'hrPayrollMaster',
    items: [
      { href: '/dashboard/hr-system/payroll/settings', label: '급여환경설정', description: '4대보험요율·과세·지급일' },
      { href: '/dashboard/hr-system/payroll/salary-base', label: '급여기준관리', description: '사원별 기본급·수당' },
      { href: '/dashboard/hr-system/payroll/allowances', label: '수당·공제항목', description: '고정·변동 수당·공제' },
    ],
  },
  {
    id: 'payrollCalc',
    label: '급여계산',
    permission: 'hrPayrollCalc',
    items: [
      { href: '/dashboard/hr-system/payroll/calculate', label: '급여계산', description: '월별 급여 산출·검토' },
      { href: '/dashboard/hr-system/payroll/profit-share', label: '영업이익 분배', description: '매출 기반 이익분배·자동 급여' },
      { href: '/dashboard/hr-system/payroll/runs', label: '급여마감', description: '마감·확정·취소' },
      { href: '/dashboard/hr-system/payroll/adjustments', label: '급여조정', description: '특별수당·공제 반영' },
    ],
  },
  {
    id: 'payrollReport',
    label: '급여조회',
    permission: 'hrPayrollReport',
    items: [
      { href: '/dashboard/hr-system/payroll/ledger', label: '급여대장', description: '월별 급여 총괄표' },
      { href: '/dashboard/hr-system/payroll/payslip', label: '급여명세서', description: '사원별 명세 조회·출력' },
      { href: '/dashboard/hr-system/payroll/insurance', label: '4대보험 고지', description: '국민·건강·고용·산재' },
      { href: '/dashboard/hr-system/payroll/withholding', label: '원천징수', description: '소득세·지방세 집계' },
    ],
  },
];

export const HR_SYSTEM_PERMISSION_KEYS: HrSystemPermissionKey[] = [
  'hrSystem',
  'hrPersonnel',
  'hrAttendanceMgmt',
  'hrPayrollMaster',
  'hrPayrollCalc',
  'hrPayrollReport',
];

export const HR_SYSTEM_PERMISSION_LABELS: Record<HrSystemPermissionKey, string> = {
  hrSystem: '인사/급여 (개요)',
  hrPersonnel: '인사·인사관리',
  hrAttendanceMgmt: '인사·근태관리',
  hrPayrollMaster: '인사·급여기준',
  hrPayrollCalc: '인사·급여계산',
  hrPayrollReport: '인사·급여조회',
};

export function canAccessHrSystemSection(
  menuAccess: Partial<Record<MenuAccessKey, boolean>>,
  permission: HrSystemPermissionKey,
): boolean {
  if (menuAccess.hrPersonnel && permission === 'hrPersonnel') return true;
  if (menuAccess.hrAttendanceMgmt && permission === 'hrAttendanceMgmt') return true;
  if (menuAccess.hrPayrollMaster && permission === 'hrPayrollMaster') return true;
  if (menuAccess.hrPayrollCalc && permission === 'hrPayrollCalc') return true;
  if (menuAccess.hrPayrollReport && permission === 'hrPayrollReport') return true;
  if (menuAccess.hrSystem) return true;
  return !!menuAccess[permission as MenuAccessKey];
}

export function flattenHrSystemMenu(): HrSystemMenuItem[] {
  return HR_SYSTEM_MENU_SECTIONS.flatMap(s => s.items);
}

export function findHrSystemMenuItem(pathname: string): HrSystemMenuItem | undefined {
  return flattenHrSystemMenu().find(i =>
    pathname === i.href || pathname.startsWith(`${i.href}/`),
  );
}

export function findHrSystemSection(pathname: string): HrSystemMenuSection | undefined {
  return HR_SYSTEM_MENU_SECTIONS.find(s =>
    s.items.some(i => pathname === i.href || pathname.startsWith(`${i.href}/`)),
  );
}

/** 사이드바용 주요 바로가기 */
export const HR_SYSTEM_SIDEBAR_LINKS = [
  { href: '/dashboard/hr-system', label: '개요' },
  { href: '/dashboard/hr-system/personnel/status', label: '인사현황' },
  { href: '/dashboard/hr-system/attendance/monthly-summary', label: '근태집계' },
  { href: '/dashboard/hr-system/payroll/calculate', label: '급여계산' },
  { href: '/dashboard/hr-system/payroll/runs', label: '급여마감' },
  { href: '/dashboard/hr-system/payroll/payslip', label: '급여명세' },
];
