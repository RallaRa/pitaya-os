import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import {
  createPublicOrderIdentity,
  getIdentityById,
  normalizeAgeRange,
  normalizeGender,
} from '@/lib/publicOrderIdentity';
import { maskPhone } from '@/lib/publicOrders';

export const dynamic = 'force-dynamic';

/** GET — identityId 유효성 확인 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const identityId = new URL(req.url).searchParams.get('identityId');
  if (!identityId) {
    return NextResponse.json({ verified: false });
  }

  const identity = await getIdentityById(identityId);
  if (!identity || identity.publicToken !== token) {
    return NextResponse.json({ verified: false });
  }

  return NextResponse.json({
    verified: true,
    identityId: identity.id,
    phoneMasked: identity.phoneMasked,
    gender: identity.gender,
    ageRange: identity.ageRange,
    matchStatus: identity.matchStatus,
    matchedCusCode: identity.matchedCusCode,
  });
}

/** POST — 전화·성별·나이 수집 + 회원 매칭 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  let body: {
    phone?: string;
    gender?: string;
    ageRange?: string;
    birthYear?: number;
    kakaoId?: string;
    source?: 'kakao' | 'manual';
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const phone = (body.phone || '').trim();
  if (phone.replace(/\D/g, '').length < 10) {
    return NextResponse.json({ error: '전화번호 10자리 이상 입력해 주세요' }, { status: 400 });
  }

  try {
    const sessionSnap = await adminDb.collection('public_order_sessions')
      .where('publicToken', '==', token)
      .limit(1)
      .get();

    if (sessionSnap.empty) {
      return NextResponse.json({ error: '주문 페이지를 찾을 수 없습니다' }, { status: 404 });
    }

    const sessionDoc = sessionSnap.docs[0];
    const session = sessionDoc.data();
    if (session.status === 'draft') {
      return NextResponse.json({ error: '아직 공개되지 않은 주문입니다' }, { status: 403 });
    }

    const { id, match } = await createPublicOrderIdentity({
      storeId: session.storeId,
      sessionId: sessionDoc.id,
      publicToken: token,
      phone,
      gender: normalizeGender(body.gender),
      ageRange: normalizeAgeRange(body.ageRange),
      birthYear: body.birthYear ?? null,
      kakaoId: body.kakaoId,
      source: body.source || 'manual',
    });

    return NextResponse.json({
      success: true,
      identityId: id,
      phoneMasked: maskPhone(phone),
      matchStatus: match.status,
      matchedCusCode: match.cusCode || null,
      suggestedCusCodes: match.cusCodes || (match.cusCode ? [match.cusCode] : []),
      message:
        match.status === 'matched'
          ? '회원 정보와 연결되었습니다.'
          : match.status === 'partial'
            ? '마스킹 번호만 일치합니다. 매장에서 확인 후 연결됩니다.'
            : match.status === 'ambiguous'
              ? '동일 패턴 회원이 여러 명입니다. 매장에서 확인합니다.'
              : '신규 방문자로 등록되었습니다. 주문을 계속해 주세요.',
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
