import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { DEFAULT_PERMISSIONS, ALL_MENUS, Role } from '@/lib/permissions';
import { verifyToken, getActualGroupId, isAdminGroup, isMasterGroup, canManageStore, isActiveStoreMember } from '@/lib/authVerify';
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
  type MenuAccess,
  type SystemGroupId,
  LEGACY_GROUP_ID_MAP,
} from '@/lib/menuAccessKeys';

const ALL_FALSE = createAllFalseMenuAccess();
const STAFF_ACCESS = DEFAULT_SYSTEM_GROUP_MENUS.staff;

const SYSTEM_GROUPS = SYSTEM_GROUP_IDS.map((groupId) => ({
  groupId,
  storeId: 'global',
  groupName: DEFAULT_SYSTEM_GROUP_NAMES[groupId],
  menuAccess: DEFAULT_SYSTEM_GROUP_MENUS[groupId],
  isSystem: true,
}));

const OBSOLETE_SYSTEM_GROUP_IDS = ['master', 'user', 'staff', 'guest', 'owner'];

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

async function ensureSystemGroups() {
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

/** 점장·직원: AI 예측 변수 메뉴 기본 ON (구버전 false 마이그레이션) */
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

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type');
    const storeId = searchParams.get('storeId');

    if (type === 'myAccess') {
      const verified = await verifyToken(req);
      if (!verified) {
        return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
      }
      const uid = verified.uid;
      await ensureSystemGroups();
      await migratePredictionVariablesMenuForSystemGroups();

      const userDoc = await adminDb.collection('users').doc(uid).get();
      const userData = userDoc.exists ? userDoc.data() : null;

      if (await isPlatformSuperuser(uid, userData?.email)) {
        const suDoc = await adminDb.collection('permission_groups').doc('superuser').get();
        const suStored = suDoc.exists ? suDoc.data()?.menuAccess : {};
        const suAccess = menuAccessForGroup('superuser', suStored);
        const storeContext = await getStoreAccessContext(uid, storeId);
        return NextResponse.json({
          groupId: 'superuser',
          menuAccess: suAccess,
          role: 'superuser',
          isSuperuser: true,
          ...storeContext,
        });
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
        return NextResponse.json({ groupId: '', role: '', menuAccess: ALL_FALSE, ...storeContext });
      }

      const storeContext = await getStoreAccessContext(uid, storeId);
      const groupDoc = await adminDb.collection('permission_groups').doc(groupId).get();
      if (groupDoc.exists) {
        const stored = groupDoc.data()?.menuAccess || {};
        return NextResponse.json({
          groupId,
          role: groupId,
          menuAccess: menuAccessForGroup(groupId, stored),
          ...storeContext,
        });
      }

      return NextResponse.json({
        groupId: 'staff',
        role: 'staff',
        menuAccess: menuAccessForGroup('staff', STAFF_ACCESS),
        ...storeContext,
      });
    }

    if (type === 'groups' && storeId) {
      await ensureSystemGroups();

      const [globalSnap, storeSnap] = await Promise.all([
        adminDb.collection('permission_groups').where('storeId', '==', 'global').get(),
        storeId !== 'global'
          ? adminDb.collection('permission_groups').where('storeId', '==', storeId).get()
          : Promise.resolve({ docs: [] as FirebaseFirestore.QueryDocumentSnapshot[] }),
      ]);

      const sortGroups = (snap: { docs: FirebaseFirestore.QueryDocumentSnapshot[] }) => {
        const order = ['superuser', 'admin', 'staff'];
        return snap.docs
          .map(d => ({ groupId: d.id, ...d.data() }))
          .sort((a: { groupId: string; createdAt?: { seconds?: number } }, b: { groupId: string; createdAt?: { seconds?: number } }) => {
            const ai = order.indexOf(a.groupId);
            const bi = order.indexOf(b.groupId);
            if (ai !== -1 || bi !== -1) {
              return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
            }
            return (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0);
          });
      };

      return NextResponse.json({ groups: [...sortGroups(globalSnap), ...sortGroups(storeSnap)] });
    }

    const roles: Role[] = ['superuser', 'admin', 'staff'];
    const result: Record<string, Record<string, boolean>> = {};
    for (const role of roles) {
      const snap = await adminDb.collection('role_permissions').doc(role).get();
      if (snap.exists) {
        const saved = snap.data()!.menus || {};
        const merged = { ...DEFAULT_PERMISSIONS[role] };
        ALL_MENUS.forEach(m => { if (saved[m.key] !== undefined) merged[m.key] = saved[m.key]; });
        result[role] = merged;
      } else {
        result[role] = DEFAULT_PERMISSIONS[role];
      }
    }
    return NextResponse.json({ permissions: result });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'permissions failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const verified = await verifyToken(req);
    if (!verified) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const body = await req.json();
    const { type } = body;

    if (type === 'createGroup') {
      const { storeId, groupName, menuAccess } = body;
      if (!storeId || !groupName) {
        return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 });
      }
      if (!await canManageStore(verified.uid, storeId, verified.email)) {
        return NextResponse.json({ error: '권한 없음. 관리자 이상만 그룹을 생성할 수 있습니다.' }, { status: 403 });
      }
      const ref = adminDb.collection('permission_groups').doc();
      await ref.set({
        groupId: ref.id,
        storeId,
        groupName: groupName.trim(),
        menuAccess: mergeMenuAccess(menuAccess),
        isSystem: false,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return NextResponse.json({ success: true, groupId: ref.id });
    }

    const { permissions } = body;
    const actualGroupId = await getActualGroupId(verified.uid);
    if (!isMasterGroup(actualGroupId)) {
      return NextResponse.json({ error: '권한 없음. 슈퍼유저만 역할 권한을 변경할 수 있습니다.' }, { status: 403 });
    }
    const roles: Role[] = ['admin', 'staff'];
    for (const role of roles) {
      if (permissions[role]) {
        await adminDb.collection('role_permissions').doc(role).set({
          role, menus: permissions[role], updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'permissions failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const verified = await verifyToken(req);
    if (!verified) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const body = await req.json();
    const { type, groupId, groupName, menuAccess, storeId } = body;

    if (type !== 'updateGroup' || !groupId) {
      return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
    }

    if (!await canManageStore(verified.uid, storeId, verified.email)) {
      return NextResponse.json({ error: '권한 없음. 관리자 이상만 그룹을 수정할 수 있습니다.' }, { status: 403 });
    }

    const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (groupName !== undefined) update.groupName = String(groupName).trim();
    if (menuAccess !== undefined) update.menuAccess = mergeMenuAccess(menuAccess);

    await adminDb.collection('permission_groups').doc(groupId).set(update, { merge: true });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'permissions failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const verified = await verifyToken(req);
    if (!verified) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type');
    const groupId = searchParams.get('groupId');
    const storeId = searchParams.get('storeId');

    if (type !== 'group' || !groupId) {
      return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
    }

    if (!await canManageStore(verified.uid, storeId, verified.email)) {
      return NextResponse.json({ error: '권한 없음. 관리자 이상만 그룹을 삭제할 수 있습니다.' }, { status: 403 });
    }

    const docRef = await adminDb.collection('permission_groups').doc(groupId).get();
    if (!docRef.exists) return NextResponse.json({ error: '그룹 없음' }, { status: 404 });
    if (docRef.data()?.isSystem || (SYSTEM_GROUP_IDS as readonly string[]).includes(groupId)) {
      return NextResponse.json({ error: '시스템 그룹은 삭제할 수 없습니다.' }, { status: 403 });
    }

    await docRef.ref.delete();
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'permissions failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
