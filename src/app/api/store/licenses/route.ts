import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyToken, canManageStore } from '@/lib/authVerify';
import { defaultStoreModules, LicenseModuleKey, StoreModules } from '@/lib/licenses';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId');
  if (!storeId) return NextResponse.json({ error: 'storeId 필요' }, { status: 400 });

  try {
    const doc = await adminDb.collection('store_licenses').doc(storeId).get();
    const modules = doc.exists
      ? { ...defaultStoreModules(), ...(doc.data()?.modules || {}) }
      : defaultStoreModules();
    return NextResponse.json({ storeId, modules });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { storeId, modules } = body as { storeId: string; modules: Partial<StoreModules> };

    if (!storeId || !modules) {
      return NextResponse.json({ error: 'storeId, modules 필요' }, { status: 400 });
    }

    if (!await canManageStore(authUser.uid, storeId, authUser.email)) {
      return NextResponse.json({ error: '권한 없음. master/admin 이상만 수정 가능' }, { status: 403 });
    }

    const current = await adminDb.collection('store_licenses').doc(storeId).get();
    const merged = {
      ...defaultStoreModules(),
      ...(current.exists ? current.data()?.modules : {}),
    };

    for (const key of Object.keys(modules) as LicenseModuleKey[]) {
      if (merged[key] && modules[key]) {
        merged[key] = { ...merged[key], ...modules[key] };
      }
    }

    await adminDb.collection('store_licenses').doc(storeId).set(
      { storeId, modules: merged, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );

    return NextResponse.json({ success: true, modules: merged });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
