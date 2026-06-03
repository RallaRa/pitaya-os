import { canManageStore } from '@/lib/authVerify';

/** 매장 연차·휴무 관리 권한 (superuser / admin 및 레거시 master·owner) */
export async function isHrStoreAdmin(
  uid: string,
  storeId: string,
  email?: string,
): Promise<boolean> {
  return canManageStore(uid, storeId, email);
}

/** YYYY-MM 구간과 연차 기간(start~end) 겹침 여부 */
export function leaveRequestOverlapsMonth(
  startDate: unknown,
  endDate: unknown,
  month: string,
): boolean {
  const start = String(startDate || '');
  const end = String(endDate || start);
  if (!start || !/^\d{4}-\d{2}$/.test(month)) return false;

  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-${String(lastDay).padStart(2, '0')}`;
  return start <= monthEnd && end >= monthStart;
}
