import { redirect } from 'next/navigation';

/** 스펙 경로 → hr-system 영업이익 분배 급여 */
export default function HrPayrollRedirectPage() {
  redirect('/dashboard/hr-system/payroll/profit-share');
}
