import { isSuperuser } from '@/lib/auth/permissions';
import { normalizeGroupId } from '@/lib/roleMapping';

/** 슈퍼유저 · master · admin (owner → master) */
export function isCustomerPiiDecryptGroup(groupId?: string | null): boolean {
  const g = normalizeGroupId(groupId);
  return g === 'superuser' || g === 'admin';
}

/** 고객 PII 복호화 UI 표시 여부 (클라이언트 전용) */
export function canDecryptCustomerPIIClient(
  groupId?: string | null,
  email?: string | null,
  storeRole?: string | null,
  isSuperuserFromApi?: boolean,
): boolean {
  if (isSuperuserFromApi) return true;
  const roleHint = groupId || storeRole || '';
  if (isSuperuser(email, roleHint)) return true;
  if (isCustomerPiiDecryptGroup(groupId)) return true;
  if (storeRole && isCustomerPiiDecryptGroup(storeRole)) return true;
  return false;
}
