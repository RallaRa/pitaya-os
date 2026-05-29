import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyToken } from '@/lib/authVerify';
import { isSuperuserEmail } from '@/lib/auth/permissions';
import { defaultStoreModules } from '@/lib/licenses';

export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSuperuserEmail(authUser.email)) {
    return NextResponse.json({ error: 'Superuser only' }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { storeId } = body as { storeId?: string };

    if (storeId) {
      await adminDb.collection('store_licenses').doc(storeId).set({
        storeId,
        modules: defaultStoreModules(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return NextResponse.json({ success: true, initialized: 1, storeId });
    }

    const storesSnap = await adminDb.collection('stores').get();
    let count = 0;
    const batch = adminDb.batch();
    for (const doc of storesSnap.docs) {
      const ref = adminDb.collection('store_licenses').doc(doc.id);
      batch.set(ref, {
        storeId: doc.id,
        modules: defaultStoreModules(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      count++;
    }
    if (count > 0) await batch.commit();

    return NextResponse.json({
      success: true,
      initialized: count,
      message: `${count}개 매장 라이선스 초기화 완료`,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
