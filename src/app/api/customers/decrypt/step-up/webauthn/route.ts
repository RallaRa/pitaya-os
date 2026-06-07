import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { canDecryptCustomerPII } from '@/lib/customerDecryptAuth';
import {
  buildAuthenticationOptions,
  buildRegistrationOptions,
  userHasWebAuthnCredential,
  verifyAuthentication,
  verifyRegistration,
} from '@/lib/piiStepUp/webauthnServer';
import { createPiiUnlockToken } from '@/lib/piiStepUp/unlockToken';

export const dynamic = 'force-dynamic';

type Action =
  | 'capabilities'
  | 'register-options'
  | 'register-verify'
  | 'auth-options'
  | 'auth-verify';

/** POST — WebAuthn 지문 등록·인증 (분석 모드 step-up) */
export async function POST(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: {
    action: Action;
    storeId?: string;
    response?: unknown;
    hasPlatformAuth?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { action, storeId, response } = body;
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  const auth = await canDecryptCustomerPII(user.uid, user.email, storeId);
  if (!auth.allowed) {
    return NextResponse.json({ error: '복호화 권한이 없습니다' }, { status: 403 });
  }

  try {
    if (action === 'capabilities') {
      const hasCredential = await userHasWebAuthnCredential(user.uid);
      return NextResponse.json({
        hasCredential,
        /** 클라이언트에서 PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable() 결과를 body.hasPlatformAuth로 보냄 */
        preferWebAuthn: body.hasPlatformAuth !== false,
      });
    }

    if (action === 'register-options') {
      const options = await buildRegistrationOptions(user.uid, auth.email || user.uid);
      return NextResponse.json({ options });
    }

    if (action === 'register-verify') {
      if (!response) return NextResponse.json({ error: 'response required' }, { status: 400 });
      await verifyRegistration(user.uid, response as any);
      const { token, expiresAt } = createPiiUnlockToken(user.uid, storeId);
      return NextResponse.json({ ok: true, unlockToken: token, expiresAt });
    }

    if (action === 'auth-options') {
      const result = await buildAuthenticationOptions(user.uid);
      if (result.needsRegistration) {
        return NextResponse.json({ needsRegistration: true });
      }
      return NextResponse.json({ needsRegistration: false, options: result.options });
    }

    if (action === 'auth-verify') {
      if (!response) return NextResponse.json({ error: 'response required' }, { status: 400 });
      await verifyAuthentication(user.uid, response as any);
      const { token, expiresAt } = createPiiUnlockToken(user.uid, storeId);
      return NextResponse.json({ ok: true, unlockToken: token, expiresAt });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'WebAuthn failed';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
