import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { isActiveStoreMember } from '@/lib/authVerify';
import { isPlatformSuperuser } from '@/lib/superuserCheck';
import { storeHasPosBridge } from '@/lib/posBridgeStatus';
import {
  createAllFalseMenuAccess,
  DEFAULT_SYSTEM_GROUP_MENUS,
  DEFAULT_SYSTEM_GROUP_NAMES,
  mergeMenuAccess,
  menuAccessForGroup,
  MENU_ACCESS_KEYS,
  SYSTEM_GROUP_IDS,
  type SystemGroupId,
  LEGACY_GROUP_ID_MAP,
} from '@/lib/menuAccessKeys';
import { ensurePermissionSystemGroups } from '@/lib/permissionGroupsMaintain';

const ALL_FALSE = createAllFalseMenuAccess();
const STAFF_ACCESS = DEFAULT_SYSTEM_GROUP_MENUS.staff;

async function getStoreAccessContext(uid: string, storeId?: string | null) {
  if (!storeId) {
    return { isStoreMember: false, hasPosBridge: false };
  }
  const [isStoreMember, hasPosBridge] = await Promise.all([
    isActiveStoreMember(uid, storeId),
    storeHasPosBridge(storeId),
  ]);
  return { isStoreMember, hasPosBridge };
}

export async function resolveMyAccessPayload(
  uid: string,
  email: string | undefined,
  storeId?: string | null,
) {
  await ensurePermissionSystemGroups();

  const userDoc = await adminDb.collection('users').doc(uid).get();
  const userData = userDoc.exists ? userDoc.data() : null;

  if (await isPlatformSuperuser(uid, userData?.email ?? email)) {
    const suDoc = await adminDb.collection('permission_groups').doc('superuser').get();
    const suStored = suDoc.exists ? suDoc.data()?.menuAccess : {};
    const suAccess = menuAccessForGroup('superuser', suStored);
    const storeContext = await getStoreAccessContext(uid, storeId);
    return {
      groupId: 'superuser',
      menuAccess: suAccess,
      role: 'superuser',
      isSuperuser: true,
      ...storeContext,
    };
  }

  let groupId: string | null = null;

  if (storeId) {
    const mapSnap = await adminDb.collection('user_store_map')
      .where('uid', '==', uid)
      .where('storeId', '==', storeId)
      .get();
    if (!mapSnap.empty) {
      const storeGroupId = mapSnap.docs[0].data().groupId;
      if (storeGroupId !== undefined && storeGroupId !== null) {
        groupId = storeGroupId;
      }
    }
  }

  if (groupId === null) {
    groupId = userData?.groupId || 'staff';
  }

  groupId = LEGACY_GROUP_ID_MAP[groupId] || groupId;

  if (groupId === '') {
    const storeContext = await getStoreAccessContext(uid, storeId);
    return { groupId: '', role: '', menuAccess: ALL_FALSE, ...storeContext };
  }

  const storeContext = await getStoreAccessContext(uid, storeId);
  const groupDoc = await adminDb.collection('permission_groups').doc(groupId).get();
  if (groupDoc.exists) {
    const stored = groupDoc.data()?.menuAccess || {};
    return {
      groupId,
      role: groupId,
      menuAccess: menuAccessForGroup(groupId, stored),
      ...storeContext,
    };
  }

  return {
    groupId: 'staff',
    role: 'staff',
    menuAccess: menuAccessForGroup('staff', STAFF_ACCESS),
    ...storeContext,
  };
}
