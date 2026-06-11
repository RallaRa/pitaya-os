import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyToken } from '@/lib/authVerify';

/** POST /api/customers/register — 퍼널 고객 등록 */
export async function POST(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const storeId = String(body.storeId || '');
  const name = String(body.name || '').trim();
  const phone = String(body.phone || '').replace(/\D/g, '');
  const grade = String(body.grade || '일반').trim();
  const memo = String(body.memo || '').trim();

  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  if (!name) return NextResponse.json({ error: '고객명을 입력하세요' }, { status: 400 });
  if (!phone || phone.length < 9) return NextResponse.json({ error: '올바른 연락처를 입력하세요' }, { status: 400 });

  try {
    const cusCode = `M${Date.now().toString().slice(-8)}`;
    const docId = `${storeId}_${cusCode}`;
    await adminDb.collection('pos_customers').doc(docId).set({
      storeId,
      cusCode,
      name,
      phone,
      grade,
      memo: memo || null,
      point: 0,
      totalPurchase: 0,
      visitCount: 0,
      joinDate: new Date().toISOString().slice(0, 10),
      createdAt: FieldValue.serverTimestamp(),
      createdBy: user.uid,
      source: 'funnel_register',
    });

    return NextResponse.json({ ok: true, cusCode, docId });
  } catch (e) {
    console.error('[customers/register]', e);
    return NextResponse.json({ error: '고객 등록에 실패했습니다' }, { status: 500 });
  }
}
