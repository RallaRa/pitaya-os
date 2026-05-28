import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { verifyToken } from '@/lib/authVerify';
import { isSuperuserEmail } from '@/lib/auth/permissions';
import { decrypt } from '@/lib/encryption';

// POST /api/hr/employees/decrypt
// body: { storeId, empNo, field: 'ssn' | 'accountNo' }
// master/superuser 전용
export async function POST(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userDoc  = await adminDb.collection('users').doc(user.uid).get();
  const userData = userDoc.data();
  const groupId  = userData?.groupId || 'staff';

  if (groupId !== 'master' && !isSuperuserEmail(userData?.email)) {
    return NextResponse.json({ error: '복호화 권한이 없습니다 (master/superuser만 허용)' }, { status: 403 });
  }

  let body: { storeId?: string; empNo?: string; field?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { storeId, empNo, field } = body;
  if (!storeId || !empNo || !field) {
    return NextResponse.json({ error: 'storeId, empNo, field required' }, { status: 400 });
  }
  if (!['ssn', 'accountNo'].includes(field)) {
    return NextResponse.json({ error: 'field must be ssn or accountNo' }, { status: 400 });
  }

  const docId = `${storeId}_${empNo}`;
  const snap  = await adminDb.collection('hr_employees').doc(docId).get();
  if (!snap.exists) return NextResponse.json({ error: '사원을 찾을 수 없습니다' }, { status: 404 });

  const data = snap.data()!;
  let decrypted = '';
  try {
    if (field === 'ssn') {
      if (!data.ssnEncrypted) return NextResponse.json({ error: '저장된 주민등록번호가 없습니다' }, { status: 404 });
      decrypted = decrypt(data.ssnEncrypted);
    } else {
      if (!data.salary?.accountNoEncrypted) return NextResponse.json({ error: '저장된 계좌번호가 없습니다' }, { status: 404 });
      decrypted = decrypt(data.salary.accountNoEncrypted);
    }
  } catch {
    return NextResponse.json({ error: '복호화 실패 — ENCRYPTION_KEY 확인 필요' }, { status: 500 });
  }

  // 복호화 로그 기록
  await adminDb.collection('decrypt_logs').add({
    empNo,
    storeId,
    field,
    decryptedBy:  user.uid,
    decryptedAt:  new Date().toISOString(),
  });

  return NextResponse.json({ decrypted });
}
