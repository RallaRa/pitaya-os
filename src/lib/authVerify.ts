import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { isSuperuserEmail } from '@/lib/auth/permissions';
import { isPlatformSuperuser } from '@/lib/superuserCheck';
import { normalizeGroupId, roleToGroupId } from '@/lib/roleMapping';

export interface VerifiedUser {
  uid: string;
  email?: string;
}

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

export async function getActualGroupId(uid: string, storeId?: string | null, email?: string): Promise<string> {
  if (await isPlatformSuperuser(uid, email)) return 'superuser';

  const userDoc = await adminDb.collection('users').doc(uid).get();
  const userData = userDoc.exists ? userDoc.data() : null;

  if (storeId) {
    const mapSnap = await adminDb.collection('user_store_map')
      .where('uid', '==', uid)
      .where('storeId', '==', storeId)
      .where('status', '==', 'active')
      .get();
    if (!mapSnap.empty) {
      const mapData = mapSnap.docs[0].data();
      const storeGroupId = mapData.groupId;
      if (storeGroupId !== undefined && storeGroupId !== null && storeGroupId !== '') {
        return normalizeGroupId(storeGroupId);
      }
      if (mapData.role) {
        return roleToGroupId(mapData.role);
      }
    }
  }

  return normalizeGroupId(userData?.groupId || 'user');
}

export function isAdminGroup(groupId: string): boolean {
  return ['superuser', 'master', 'admin', 'owner'].includes(groupId);
}

export async function canManageStore(
  uid: string,
  storeId?: string | null,
  email?: string,
): Promise<boolean> {
  if (await isPlatformSuperuser(uid, email)) return true;
  const groupId = await getActualGroupId(uid, storeId, email);
  return isAdminGroup(groupId);
}

export function isMasterGroup(groupId: string): boolean {
  return groupId === 'master' || groupId === 'superuser';
}

export async function isActiveStoreMember(
  uid: string,
  storeId: string,
): Promise<boolean> {
  if (!uid || !storeId) return false;
  const mapSnap = await adminDb.collection('user_store_map')
    .where('uid', '==', uid)
    .where('storeId', '==', storeId)
    .where('status', '==', 'active')
    .limit(1)
    .get();
  if (mapSnap.empty) return false;

  const storeDoc = await adminDb.collection('stores').doc(storeId).get();
  if (!storeDoc.exists) return false;
  const storeStatus = storeDoc.data()?.status;
  return !storeStatus || storeStatus === 'active';
}
