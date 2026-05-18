import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { DEFAULT_PERMISSIONS, ALL_MENUS, Role } from '@/lib/permissions';

// 권한 조회
export async function GET() {
  try {
    const roles: Role[] = ['superuser', 'admin', 'user', 'staff'];
    const result: Record<string, Record<string, boolean>> = {};

    for (const role of roles) {
      const snap = await getDoc(doc(db, 'role_permissions', role));
      if (snap.exists()) {
        const saved = snap.data().menus || {};
        // 새 메뉴가 추가된 경우 기본값으로 자동 채움
        const merged = { ...DEFAULT_PERMISSIONS[role] };
        ALL_MENUS.forEach(m => {
          if (saved[m.key] !== undefined) merged[m.key] = saved[m.key];
        });
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

// 권한 저장 (superuser만)
export async function POST(req: Request) {
  try {
    const { permissions, requestorRole } = await req.json();

    if (requestorRole !== 'superuser') {
      return NextResponse.json(
        { error: '권한 없음. superuser만 변경 가능합니다.' },
        { status: 403 }
      );
    }

    const roles: Role[] = ['admin', 'user', 'staff'];
    for (const role of roles) {
      if (permissions[role]) {
        await setDoc(doc(db, 'role_permissions', role), {
          role,
          menus: permissions[role],
          updatedAt: serverTimestamp(),
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
