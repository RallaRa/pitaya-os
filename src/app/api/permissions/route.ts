import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { DEFAULT_PERMISSIONS, ALL_MENUS, Role } from '@/lib/permissions';

type MenuAccess = {
  ai: boolean; sales: boolean; purchase: boolean; report: boolean;
  messenger: boolean; members: boolean; store: boolean;
  permissionGroup: boolean; memberGroup: boolean;
};

const ALL_FALSE: MenuAccess = {
  ai: false, sales: false, purchase: false, report: false,
  messenger: false, members: false, store: false,
  permissionGroup: false, memberGroup: false,
};

const STAFF_ACCESS: MenuAccess = {
  ai: true, sales: true, purchase: false, report: false,
  messenger: true, members: false, store: false,
  permissionGroup: false, memberGroup: false,
};

const SYSTEM_GROUPS = [
  {
    groupId: 'master',
    storeId: 'global',
    groupName: 'Master',
    menuAccess: { ai: true, sales: true, purchase: true, report: true, messenger: true, members: true, store: true, permissionGroup: true, memberGroup: true },
    isSystem: true,
  },
  {
    groupId: 'admin',
    storeId: 'global',
    groupName: '관리자',
    menuAccess: { ai: true, sales: true, purchase: true, report: true, messenger: true, members: true, store: true, permissionGroup: false, memberGroup: false },
    isSystem: true,
  },
  {
    groupId: 'user',
    storeId: 'global',
    groupName: '사용자',
    menuAccess: { ai: true, sales: true, purchase: true, report: true, messenger: true, members: false, store: false, permissionGroup: false, memberGroup: false },
    isSystem: true,
  },
  {
    groupId: 'staff',
    storeId: 'global',
    groupName: '직원',
    menuAccess: { ai: true, sales: true, purchase: false, report: false, messenger: true, members: false, store: false, permissionGroup: false, memberGroup: false },
    isSystem: true,
  },
  {
    groupId: 'guest',
    storeId: 'global',
    groupName: '게스트',
    menuAccess: { ai: true, sales: false, purchase: false, report: false, messenger: false, members: false, store: false, permissionGroup: false, memberGroup: false },
    isSystem: true,
  },
];

async function ensureSystemGroups() {
  const batch = adminDb.batch();
  let hasChanges = false;
  for (const group of SYSTEM_GROUPS) {
    const ref = adminDb.collection('permission_groups').doc(group.groupId);
    const doc = await ref.get();
    if (!doc.exists) {
      batch.set(ref, { ...group, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      hasChanges = true;
    }
  }
  if (hasChanges) await batch.commit();
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type');
    const storeId = searchParams.get('storeId');
    const uid = searchParams.get('uid');

    // ── 내 권한 조회 ──
    if (type === 'myAccess' && uid) {
      await ensureSystemGroups();

      // 1. users 컬렉션에서 이메일 + groupId 조회
      const userDoc = await adminDb.collection('users').doc(uid).get();
      const userData = userDoc.exists ? userDoc.data() : null;

      // hipona00@gmail.com은 항상 master 강제
      if (userData?.email === 'hipona00@gmail.com') {
        if (userData?.groupId !== 'master') {
          await adminDb.collection('users').doc(uid).update({ groupId: 'master' });
        }
        const masterDoc = await adminDb.collection('permission_groups').doc('master').get();
        const masterAccess = masterDoc.exists ? masterDoc.data()?.menuAccess : SYSTEM_GROUPS[0].menuAccess;
        return NextResponse.json({ groupId: 'master', menuAccess: masterAccess });
      }

      let groupId = '';

      // 2. 매장별 groupId (user_store_map)
      if (storeId) {
        const mapSnap = await adminDb.collection('user_store_map')
          .where('uid', '==', uid)
          .where('storeId', '==', storeId)
          .get();
        if (!mapSnap.empty) groupId = mapSnap.docs[0].data().groupId || '';
      }

      // 3. 글로벌 groupId (users)
      if (!groupId) {
        groupId = userData?.groupId || 'staff';
      }

      // 4. 그룹의 menuAccess 조회
      const groupDoc = await adminDb.collection('permission_groups').doc(groupId).get();
      if (groupDoc.exists) {
        return NextResponse.json({ groupId, menuAccess: groupDoc.data()?.menuAccess });
      }

      return NextResponse.json({ groupId: 'staff', menuAccess: STAFF_ACCESS });
    }

    // ── 권한 그룹 목록 조회 ──
    if (type === 'groups' && storeId) {
      await ensureSystemGroups();

      const [globalSnap, storeSnap] = await Promise.all([
        adminDb.collection('permission_groups').where('storeId', '==', 'global').get(),
        storeId !== 'global'
          ? adminDb.collection('permission_groups').where('storeId', '==', storeId).get()
          : Promise.resolve({ docs: [] as FirebaseFirestore.QueryDocumentSnapshot[] }),
      ]);

      const toSorted = (snap: { docs: FirebaseFirestore.QueryDocumentSnapshot[] }) =>
        snap.docs
          .map(d => ({ groupId: d.id, ...d.data() }))
          .sort((a: any, b: any) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0));

      return NextResponse.json({ groups: [...toSorted(globalSnap), ...toSorted(storeSnap)] });
    }

    // ── 기존: 역할별 권한 조회 (permission 페이지용) ──
    const roles: Role[] = ['superuser', 'admin', 'user', 'staff'];
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
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { type } = body;

    // ── 그룹 생성 ──
    if (type === 'createGroup') {
      const { storeId, groupName, menuAccess } = body;
      if (!storeId || !groupName) {
        return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 });
      }
      const ref = adminDb.collection('permission_groups').doc();
      await ref.set({
        groupId: ref.id,
        storeId,
        groupName: groupName.trim(),
        menuAccess: { ...ALL_FALSE, ...menuAccess },
        isSystem: false,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return NextResponse.json({ success: true, groupId: ref.id });
    }

    // ── 기존: 역할별 권한 저장 (permission 페이지용) ──
    const { permissions, requestorRole } = body;
    if (requestorRole !== 'superuser') {
      return NextResponse.json({ error: '권한 없음. superuser만 변경 가능합니다.' }, { status: 403 });
    }
    const roles: Role[] = ['admin', 'user', 'staff'];
    for (const role of roles) {
      if (permissions[role]) {
        await adminDb.collection('role_permissions').doc(role).set({
          role, menus: permissions[role], updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { type, groupId, groupName, menuAccess } = body;

    if (type !== 'updateGroup' || !groupId) {
      return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
    }

    const update: Record<string, any> = { updatedAt: FieldValue.serverTimestamp() };
    if (groupName !== undefined) update.groupName = groupName;
    if (menuAccess !== undefined) update.menuAccess = menuAccess;

    await adminDb.collection('permission_groups').doc(groupId).update(update);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type');
    const groupId = searchParams.get('groupId');

    if (type !== 'group' || !groupId) {
      return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
    }

    const docRef = await adminDb.collection('permission_groups').doc(groupId).get();
    if (!docRef.exists) return NextResponse.json({ error: '그룹 없음' }, { status: 404 });
    if (docRef.data()?.isSystem) {
      return NextResponse.json({ error: '시스템 그룹은 삭제할 수 없습니다.' }, { status: 403 });
    }

    await docRef.ref.delete();
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
