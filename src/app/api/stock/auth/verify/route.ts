import { NextResponse } from 'next/server';
import {
  handleStockAccessDenied,
  requireStockSuperuser,
  stockAccessDeniedResponse,
  verifyStockSuperuser,
} from '@/lib/stock/superuserAuth';
import { touchStockSession, validateStockSession, createStockSession } from '@/lib/stock/session.server';

export const dynamic = 'force-dynamic';

/** 미들웨어·API 공통 슈퍼유저 검증 */
export async function POST(req: Request) {
  let path = '/dashboard/superuser/stock';
  try {
    const body = await req.json();
    if (body?.path) path = String(body.path);
  } catch {
    // ignore
  }

  const pre = await verifyStockSuperuser(req);
  if (pre.ok === false) {
    let attemptedBy: string | null = null;
    if (pre.reason === 'EMAIL_MISMATCH') {
      const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
      if (token) {
        try {
          const payload = JSON.parse(
            Buffer.from(token.split('.')[1], 'base64url').toString('utf8'),
          ) as { email?: string };
          attemptedBy = payload.email || null;
        } catch {
          attemptedBy = null;
        }
      }
    }
    await handleStockAccessDenied(req, path, pre.reason, attemptedBy);
    return stockAccessDeniedResponse(pre.status);
  }

  const auth = await requireStockSuperuser(req);
  if (auth.error || !auth.user) {
    return stockAccessDeniedResponse(auth.code as 401 | 403);
  }

  const sessionToken = req.headers.get('x-stock-session') || undefined;
  let sessionCheck = await validateStockSession(auth.user.uid, sessionToken);
  if (sessionCheck.ok === false) {
    // Firebase 슈퍼유저 인증 통과 후 — 만료/폐기 세션은 새로 발급 (메인 대시보드 튕김 방지)
    const sessionId = await createStockSession(auth.user.uid);
    sessionCheck = { ok: true, sessionId };
  }

  await touchStockSession(auth.user.uid, sessionCheck.sessionId);

  return NextResponse.json({
    ok: true,
    uid: auth.user.uid,
    sessionId: sessionCheck.sessionId,
  });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const path = url.searchParams.get('path') || '/dashboard/superuser/stock';
  const fakeReq = new Request(req.url, {
    method: 'POST',
    headers: req.headers,
    body: JSON.stringify({ path }),
  });
  return POST(fakeReq);
}
