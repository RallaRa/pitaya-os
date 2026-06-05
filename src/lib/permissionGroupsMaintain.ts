import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import {
  DEFAULT_SYSTEM_GROUP_MENUS,
  DEFAULT_SYSTEM_GROUP_NAMES,
  mergeMenuAccess,
  MENU_ACCESS_KEYS,
  SYSTEM_GROUP_IDS,
  type SystemGroupId,
  LEGACY_GROUP_ID_MAP,
} from '@/lib/menuAccessKeys';

const SYSTEM_GROUPS = SYSTEM_GROUP_IDS.map((groupId) => ({
  groupId,
  storeId: 'global',
  groupName: DEFAULT_SYSTEM_GROUP_NAMES[groupId],
  menuAccess: DEFAULT_SYSTEM_GROUP_MENUS[groupId],
  isSystem: true,
}));

const OBSOLETE_SYSTEM_GROUP_IDS = ['master', 'user', 'staff', 'guest', 'owner'];

function normalizeRoleLegacy(role: string): string {
  const map: Record<string, string> = {
    owner: 'superuser', master: 'superuser', user: 'staff', staff: 'staff',
  };
  return map[role] || role;
}

function roleToGroupIdLegacy(role: string): string {
  return LEGACY_GROUP_ID_MAP[normalizeRoleLegacy(role)] || 'staff';
}

function groupIdToRoleLegacy(groupId: string): string {
  const g = LEGACY_GROUP_ID_MAP[groupId] || groupId;
  if (g === 'superuser') return 'superuser';
  if (g === 'admin') return 'admin';
  return 'staff';
}

async function migrateUnifiedGroups() {
  const metaRef = adminDb.collection('system_meta').doc('permissions');
  const metaSnap = await metaRef.get();
  if (metaSnap.data()?.unifiedGroupsV2) return;

  const batch = adminDb.batch();
  let writes = 0;

  const mapSnap = await adminDb.collection('user_store_map').get();
  for (const doc of mapSnap.docs) {
    const gid = doc.data().groupId as string | undefined;
    const role = doc.data().role as string | undefined;
    const mapped = gid ? (LEGACY_GROUP_ID_MAP[gid] ?? gid) : undefined;
    const roleMapped = role ? (LEGACY_GROUP_ID_MAP[role] ?? roleToGroupIdLegacy(role)) : undefined;
    const nextGroup = mapped || roleMapped;
    const nextRole = groupIdToRoleLegacy(nextGroup || 'staff');
    const patch: Record<string, unknown> = {};
    if (gid && mapped && mapped !== gid) patch.groupId = mapped;
    if (role && normalizeRoleLegacy(role) !== role) patch.role = nextRole;
    if (Object.keys(patch).length) {
      batch.update(doc.ref, { ...patch, updatedAt: FieldValue.serverTimestamp() });
      writes += 1;
    }
  }

  const usersSnap = await adminDb.collection('users').get();
  for (const doc of usersSnap.docs) {
    const gid = doc.data().groupId as string | undefined;
    const role = doc.data().role as string | undefined;
    const mapped = gid ? (LEGACY_GROUP_ID_MAP[gid] ?? gid) : undefined;
    const patch: Record<string, unknown> = {};
    if (gid && mapped && mapped !== gid) patch.groupId = mapped;
    if (role) {
      const nr = normalizeRoleLegacy(role);
      if (nr !== role) patch.role = nr;
    }
    if (Object.keys(patch).length) {
      batch.update(doc.ref, { ...patch, updatedAt: FieldValue.serverTimestamp() });
      writes += 1;
    }
  }

  for (const oldId of OBSOLETE_SYSTEM_GROUP_IDS) {
    if ((SYSTEM_GROUP_IDS as readonly string[]).includes(oldId)) continue;
    const ref = adminDb.collection('permission_groups').doc(oldId);
    const snap = await ref.get();
    if (!snap.exists) continue;
    const data = snap.data()!;
    const targetId = LEGACY_GROUP_ID_MAP[oldId] as SystemGroupId | undefined;
    if (targetId && data.isSystem) {
      const targetRef = adminDb.collection('permission_groups').doc(targetId);
      const targetSnap = await targetRef.get();
      const mergedAccess = mergeMenuAccess(
        targetSnap.exists ? targetSnap.data()?.menuAccess : DEFAULT_SYSTEM_GROUP_MENUS[targetId],
        data.menuAccess,
      );
      batch.set(targetRef, {
        groupId: targetId,
        storeId: 'global',
        groupName: targetSnap.exists ? targetSnap.data()?.groupName : DEFAULT_SYSTEM_GROUP_NAMES[targetId],
        menuAccess: mergedAccess,
        isSystem: true,
        updatedAt: FieldValue.serverTimestamp(),
        ...(targetSnap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      }, { merge: true });
      batch.delete(ref);
      writes += 2;
    } else if (data.isSystem) {
      batch.delete(ref);
      writes += 1;
    }
  }

  if (writes > 0) await batch.commit();
  await metaRef.set({ unifiedGroupsV2: true, migratedAt: FieldValue.serverTimestamp() }, { merge: true });
}

export async function ensureSystemGroups() {
  await migrateUnifiedGroups();

  const batch = adminDb.batch();
  let hasChanges = false;

  for (const group of SYSTEM_GROUPS) {
    const ref = adminDb.collection('permission_groups').doc(group.groupId);
    const doc = await ref.get();
    if (!doc.exists) {
      batch.set(ref, {
        ...group,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      hasChanges = true;
    } else {
      const existingData = doc.data()!;
      const existingAccess = existingData?.menuAccess || {};
      const patch: Record<string, unknown> = {};
      for (const k of MENU_ACCESS_KEYS) {
        if (!(k in existingAccess)) {
          patch[`menuAccess.${k}`] = group.menuAccess[k];
        }
      }
      if (!existingData.groupName) {
        patch.groupName = group.groupName;
      }
      if (existingData.isSystem !== true) {
        patch.isSystem = true;
      }
      if (Object.keys(patch).length > 0) {
        patch.updatedAt = FieldValue.serverTimestamp();
        batch.update(ref, patch);
        hasChanges = true;
      }
    }
  }

  if (hasChanges) await batch.commit();
}

async function migratePredictionVariablesMenuForSystemGroups() {
  const metaRef = adminDb.collection('system_meta').doc('permissions');
  const metaSnap = await metaRef.get();
  if (metaSnap.data()?.predictionVariablesStaffV1) return;

  const batch = adminDb.batch();
  for (const groupId of ['admin', 'staff'] as const) {
    const ref = adminDb.collection('permission_groups').doc(groupId);
    const snap = await ref.get();
    if (snap.exists) {
      batch.update(ref, {
        'menuAccess.predictionVariables': true,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  }
  await batch.commit();
  await metaRef.set({ predictionVariablesStaffV1: true, adminPredictionVariablesV1: true }, { merge: true });
}

/** myAccess 조회 전 시스템 그룹·메뉴 마이그레이션 */
export async function ensurePermissionSystemGroups() {
  await ensureSystemGroups();
  await migratePredictionVariablesMenuForSystemGroups();
}
