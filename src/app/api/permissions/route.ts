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

const DEFAULT_GROUPS = [
  {
    groupName: '슈퍼유저',
    isDefault: true,
    menuAccess: { ai: true, sales: true, purchase: true, report: true, messenger: true, members: true, store: true, permissionGroup: true, memberGroup: true },
  },
  {
    groupName: '관리자',
    isDefault: true,
    menuAccess: { ai: true, sales: true, purchase: true, report: true, messenger: true, members: true, store: true, permissionGroup: false, memberGroup: false },
  },
  {
    groupName: '사용자',
    isDefault: true,
    menuAccess: { ai: true, sales: true, purchase: true, report: true, messenger: true, members: false, store: false, permissionGroup: false, memberGroup: false },
  },
  {
    groupName: '직원',
    isDefault: true,
    menuAccess: { ai: true, sales: true, purchase: false, report: false, messenger: true, members: false, store: false, permissionGroup: false, memberGroup: false },
  },
];

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type');
    const storeId = searchParams.get('storeId');

    // ── 권한 그룹 조회 ──
    if (type === 'groups' && storeId) {
      const snap = await adminDb.collection('permission_groups')
        .where('storeId', '==', storeId)
        .get();

      if (!snap.empty) {
        const groups = snap.docs
          .map(d => ({ groupId: d.id, ...d.data() }))
          .sort((a: any, b: any) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0));
        return NextResponse.json({ groups });
      }

      // 없으면 기본 4개 자동 생성
      const batch = adminDb.batch();
      const created: any[] = [];
      for (const g of DEFAULT_GROUPS) {
        const ref = adminDb.collection('permission_groups').doc();
        const data = {
          ...g,
          storeId,
          groupId: ref.id,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        };
        batch.set(ref, data);
        created.push({ ...data });
      }
      await batch.commit();
      return NextResponse.json({ groups: created });
    }

    // ── 기존: 역할별 권한 조회 ──
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
        isDefault: false,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return NextResponse.json({ success: true, groupId: ref.id });
    }

    // ── 기존: 역할별 권한 저장 ──
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
    if (docRef.data()?.isDefault) {
      return NextResponse.json({ error: '기본 그룹은 삭제할 수 없습니다.' }, { status: 403 });
    }

    await docRef.ref.delete();
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
