import { getActualGroupId, isAdminGroup } from '@/lib/authVerify';
import { isSuperuserEmail } from '@/lib/auth/permissions';

/** 슈퍼유저 · master · admin 만 고객 PII 복호화 가능 */
export async function canDecryptCustomerPII(
  uid: string,
  email?: string | null,
  storeId?: string | null,
): Promise<{ allowed: boolean; groupId: string; email: string }> {
  const groupId = await getActualGroupId(uid, storeId);
  const allowed = isSuperuserEmail(email) || isAdminGroup(groupId);
  return { allowed, groupId, email: email || '' };
}
