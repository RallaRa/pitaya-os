import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { canDecryptCustomerPII } from '@/lib/customerDecryptAuth';
import { adminDb } from '@/lib/firebase/admin';
import {
  createRemoteChallenge,
  getRemoteChallenge,
} from '@/lib/piiStepUp/remoteChallenge';

export const dynamic = 'force-dynamic';

/** GET — PC 폴링: 원격 승인 상태 */
export async function GET(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const challengeId = new URL(req.url).searchParams.get('challengeId');
  if (!challengeId) return NextResponse.json({ error: 'challengeId required' }, { status: 400 });

  const challenge = await getRemoteChallenge(challengeId);
  if (!challenge || challenge.uid !== user.uid) {
    return NextResponse.json({ error: '요청을 찾을 수 없습니다' }, { status: 404 });
  }

  return NextResponse.json({
    status: challenge.status,
    unlockToken: challenge.status === 'approved' ? challenge.unlockToken : undefined,
    expiresAt: challenge.status === 'approved' ? challenge.unlockExpiresAt : challenge.expiresAt,
  });
}

/** POST — PC에서 휴대폰 승인 요청 (앱 알림 + 카카오 나에게보내기) */
export async function POST(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { storeId?: string; deviceLabel?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { storeId, deviceLabel } = body;
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  const auth = await canDecryptCustomerPII(user.uid, user.email, storeId);
  if (!auth.allowed) {
    return NextResponse.json({ error: '복호화 권한이 없습니다' }, { status: 403 });
  }

  let storeName = '';
  try {
    const storeSnap = await adminDb.collection('stores').doc(storeId).get();
    storeName = storeSnap.data()?.storeName || storeSnap.data()?.name || '';
  } catch {
    /* optional */
  }

  const { challengeId, expiresAt } = await createRemoteChallenge({
    uid: user.uid,
    storeId,
    storeName,
    deviceLabel: deviceLabel || 'PC 브라우저',
    userName: auth.email,
  });

  return NextResponse.json({ challengeId, expiresAt });
}
