import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { decrypt } from '@/lib/encryption';
import { verifyToken } from '@/lib/authVerify';
import { isSuperuserEmail } from '@/lib/auth/permissions';

// POST /api/customers/decrypt
// Body: { storeId, cusCode }
// 권한: master 또는 superuser groupId만 허용
export async function POST(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // groupId 확인
  const userDoc = await adminDb.collection('users').doc(user.uid).get();
  const userData = userDoc.exists ? userDoc.data() : null;
  const groupId = userData?.groupId || 'staff';

  if (groupId !== 'master' && !isSuperuserEmail(userData?.email)) {
    return NextResponse.json({ error: '복호화 권한이 없습니다 (master/superuser만 허용)' }, { status: 403 });
  }

  let body: { storeId?: string; cusCode?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { storeId, cusCode } = body;
  if (!storeId || !cusCode) {
    return NextResponse.json({ error: 'storeId and cusCode required' }, { status: 400 });
  }

  const docRef = adminDb.collection('pos_customers').doc(`${storeId}_${cusCode}`);
  const snap = await docRef.get();
  if (!snap.exists) {
    return NextResponse.json({ error: '고객 정보를 찾을 수 없습니다' }, { status: 404 });
  }

  const data = snap.data()!;
  let name = '', phone = '', birth = '';
  try { name  = data.nameEncrypted  ? decrypt(data.nameEncrypted)  : ''; } catch { name  = '(복호화 실패)'; }
  try { phone = data.phoneEncrypted ? decrypt(data.phoneEncrypted) : ''; } catch { phone = '(복호화 실패)'; }
  try { birth = data.birthEncrypted ? decrypt(data.birthEncrypted) : ''; } catch { birth = '(복호화 실패)'; }

  // 복호화 감사 로그
  await adminDb.collection('customer_decrypt_logs').add({
    storeId,
    cusCode,
    requestedBy: user.uid,
    requestedByEmail: userData?.email || '',
    groupId,
    decryptedFields: ['name', 'phone', 'birth'],
    createdAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ cusCode, name, phone, birth });
}
