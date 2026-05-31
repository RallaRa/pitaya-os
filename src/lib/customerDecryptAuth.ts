import { getActualGroupId } from '@/lib/authVerify';
import { adminDb } from '@/lib/firebase/admin';
import { isPlatformSuperuser } from '@/lib/superuserCheck';
import {
  canDecryptCustomerPIIClient,
  isCustomerPiiDecryptGroup,
} from '@/lib/customerDecryptAuth.client';

export { canDecryptCustomerPIIClient, isCustomerPiiDecryptGroup };

/** 슈퍼유저 · master · admin 만 고객 PII 복호화 가능 */
export async function canDecryptCustomerPII(
  uid: string,
  email?: string | null,
  storeId?: string | null,
): Promise<{ allowed: boolean; groupId: string; email: string }> {
  const userDoc = await adminDb.collection('users').doc(uid).get();
  const userData = userDoc.exists ? userDoc.data() : null;
  const resolvedEmail = email || userData?.email || '';

  const [groupId, isSuperuser] = await Promise.all([
    getActualGroupId(uid, storeId, resolvedEmail),
    isPlatformSuperuser(uid, resolvedEmail),
  ]);
  const allowed = canDecryptCustomerPIIClient(groupId, resolvedEmail, null, isSuperuser);
  return { allowed, groupId, email: resolvedEmail };
}
