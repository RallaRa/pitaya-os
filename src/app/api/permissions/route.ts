import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { DEFAULT_PERMISSIONS, ALL_MENUS, Role } from '@/lib/permissions';
import { verifyToken, getActualGroupId, isMasterGroup, canManageStore } from '@/lib/authVerify';
import {
  mergeMenuAccess,
  SYSTEM_GROUP_IDS,
} from '@/lib/menuAccessKeys';
import { ensureSystemGroups } from '@/lib/permissionGroupsMaintain';
import { resolveMyAccessPayload } from '@/lib/myAccessResolve';

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
      return NextResponse.json(await resolveMyAccessPayload(verified.uid, verified.email, storeId));
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
