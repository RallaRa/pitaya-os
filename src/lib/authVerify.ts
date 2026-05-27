import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { isSuperuserEmail } from '@/lib/auth/permissions';

export interface VerifiedUser {
  uid: string;
  email?: string;
}

/**
 * Authorization: Bearer <idToken> 헤더를 검증하고 uid + email을 반환합니다.
 * 토큰이 없거나 유효하지 않으면 null을 반환합니다.
 */
export async function verifyToken(req: Request): Promise<VerifiedUser | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return { uid: decoded.uid, email: decoded.email };
  } catch {
    return null;
  }
}

/**
 * 검증된 uid의 실제 권한 그룹을 Firestore에서 조회합니다.
 * superuser 이메일은 항상 'master' 반환.
 */
export async function getActualGroupId(uid: string, storeId?: string | null): Promise<string> {
  const userDoc = await adminDb.collection('users').doc(uid).get();
  const userData = userDoc.exists ? userDoc.data() : null;

  if (isSuperuserEmail(userData?.email)) return 'master';

  if (storeId) {
    const mapSnap = await adminDb.collection('user_store_map')
      .where('uid', '==', uid)
      .where('storeId', '==', storeId)
      .get();
    if (!mapSnap.empty) {
      const storeGroupId = mapSnap.docs[0].data().groupId;
      if (storeGroupId !== undefined && storeGroupId !== null) return storeGroupId;
    }
  }

  return userData?.groupId || 'staff';
}

/** groupId가 관리자급 이상인지 확인합니다. */
export function isAdminGroup(groupId: string): boolean {
  return ['master', 'admin'].includes(groupId);
}

/** groupId가 master인지 확인합니다. */
export function isMasterGroup(groupId: string): boolean {
  return groupId === 'master';
}
