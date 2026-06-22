import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import {
  approveRemoteChallenge,
  denyRemoteChallenge,
  getRemoteChallenge,
} from '@/lib/piiStepUp/remoteChallenge';
import {
  buildRemoteApprovalOptions,
  buildRegistrationOptions,
  verifyAuthentication,
  verifyRegistration,
} from '@/lib/piiStepUp/webauthnServer';

export const dynamic = 'force-dynamic';

/** GET — 승인 페이지용 챌린지 정보 */
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
    storeId: challenge.storeId,
    storeName: challenge.storeName,
    deviceLabel: challenge.deviceLabel,
    expiresAt: challenge.expiresAt,
  });
}

/** POST — 휴대폰에서 지문 인증 후 PC 세션 승인 */
export async function POST(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: {
    challengeId?: string;
    action?: 'approve' | 'deny';
    webauthnAction?: 'register' | 'authenticate';
    response?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { challengeId, action = 'approve', webauthnAction, response } = body;
  if (!challengeId) return NextResponse.json({ error: 'challengeId required' }, { status: 400 });

  const challenge = await getRemoteChallenge(challengeId);
  if (!challenge || challenge.uid !== user.uid) {
    return NextResponse.json({ error: '요청을 찾을 수 없습니다' }, { status: 404 });
  }

  if (action === 'deny') {
    await denyRemoteChallenge(challengeId, user.uid);
    return NextResponse.json({ ok: true, status: 'denied' });
  }

  if (challenge.status !== 'pending') {
    return NextResponse.json({ error: '이미 처리된 요청입니다', status: challenge.status }, { status: 400 });
  }

  if (!response || !webauthnAction) {
    return NextResponse.json({ error: '지문 인증이 필요합니다' }, { status: 400 });
  }

  try {
    if (webauthnAction === 'register') {
      await verifyRegistration(user.uid, response as any);
    } else {
      await verifyAuthentication(user.uid, response as any);
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '지문 인증 실패';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const approved = await approveRemoteChallenge(challengeId, user.uid);
  if (!approved) {
    return NextResponse.json({ error: '승인 처리에 실패했습니다' }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    status: 'approved',
    message: 'PC에서 개인정보 열람이 허용되었습니다.',
  });
}

/** OPTIONS for webauthn on approve page - separate endpoint for options only */
export async function PUT(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { challengeId?: string; mode?: 'register-options' | 'auth-options' };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const challenge = body.challengeId ? await getRemoteChallenge(body.challengeId) : null;
  if (!challenge || challenge.uid !== user.uid) {
    return NextResponse.json({ error: '요청을 찾을 수 없습니다' }, { status: 404 });
  }

  if (body.mode === 'register-options') {
    const options = await buildRegistrationOptions(user.uid, user.email || user.uid);
    return NextResponse.json({ options });
  }

  const auth = await buildRemoteApprovalOptions(user.uid, user.email || user.uid);
  if (auth.needsRegistration) {
    return NextResponse.json({ needsRegistration: true, options: auth.options });
  }
  return NextResponse.json({ needsRegistration: false, options: auth.options });
}
