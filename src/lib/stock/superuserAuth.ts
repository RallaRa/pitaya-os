import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import {
  SECURITY_LOGS,
  STOCK_SUPERUSER_EMAIL,
  STOCK_STORE_ID,
  MESSENGER_STOCK_ALERT_CHANNEL,
} from '@/lib/stock/constants';
import {
  ensureStockAlertChannel,
  postStockAlertText,
} from '@/lib/stock/messengerAlert.server';

export interface StockAccessContext {
  uid: string;
  email: string;
  emailVerified: boolean;
}

export interface BlockLogInput {
  attemptedBy?: string | null;
  path: string;
  ip?: string | null;
  userAgent?: string | null;
  reason: string;
}

function extractBearer(req: Request): string | null {
  const auth = req.headers.get('Authorization');
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

export function extractTokenFromRequest(req: Request, cookieToken?: string | null): string | null {
  return extractBearer(req) || cookieToken || null;
}

/** 5단계 슈퍼유저 검증 (API·서버 컴포넌트) */
export async function verifyStockSuperuser(
  req: Request,
  cookieToken?: string | null,
): Promise<{ ok: true; user: StockAccessContext } | { ok: false; status: 401 | 403; reason: string }> {
  const token = extractTokenFromRequest(req, cookieToken);
  if (!token) {
    return { ok: false, status: 401, reason: 'NO_TOKEN' };
  }

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(token, true);
  } catch {
    return { ok: false, status: 401, reason: 'INVALID_TOKEN' };
  }

  const email = (decoded.email || '').toLowerCase();
  if (email !== STOCK_SUPERUSER_EMAIL) {
    return { ok: false, status: 403, reason: 'EMAIL_MISMATCH' };
  }

  if (!decoded.email_verified) {
    return { ok: false, status: 403, reason: 'EMAIL_NOT_VERIFIED' };
  }

  return {
    ok: true,
    user: {
      uid: decoded.uid,
      email,
      emailVerified: true,
    },
  };
}

export async function requireStockSuperuser(req: Request, cookieToken?: string | null) {
  const result = await verifyStockSuperuser(req, cookieToken);
  if (result.ok === false) {
    return {
      error: 'ACCESS_DENIED' as const,
      message: '권한이 없습니다',
      code: result.status,
      reason: result.reason,
      user: null,
    };
  }
  return { error: null, message: null, code: 200 as const, reason: null, user: result.user };
}

export async function logStockAccessBlocked(input: BlockLogInput): Promise<void> {
  try {
    await adminDb.collection(SECURITY_LOGS).add({
      attemptedBy: input.attemptedBy || 'anonymous',
      attemptedAt: FieldValue.serverTimestamp(),
      path: input.path,
      ip: input.ip || null,
      userAgent: input.userAgent || null,
      result: 'BLOCKED',
      reason: input.reason,
      module: 'stock_superuser',
    });
  } catch {
    // 로깅 실패가 본 요청을 막지 않음
  }
}

export async function notifyStockSecurityAlert(params: {
  attemptedBy: string;
  path: string;
  at?: string;
}): Promise<void> {
  const at = params.at || new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  const text =
    `🚨 보안 경고\n` +
    `${params.attemptedBy}이 주식 메뉴 접근 시도\n` +
    `시간: ${at}\n` +
    `경로: ${params.path}`;

  try {
    const roomId = await ensureStockAlertChannel(STOCK_STORE_ID);
    await postStockAlertText({ roomId, text });
  } catch {
    // 메신저 실패 시 무시
  }
}

export async function handleStockAccessDenied(
  req: Request,
  path: string,
  reason: string,
  attemptedBy?: string | null,
): Promise<void> {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || null;
  const userAgent = req.headers.get('user-agent');

  await logStockAccessBlocked({
    attemptedBy,
    path,
    ip,
    userAgent,
    reason,
  });

  if (attemptedBy && attemptedBy !== 'anonymous') {
    await notifyStockSecurityAlert({ attemptedBy, path });
  }
}

export function stockAccessDeniedResponse(status: 401 | 403) {
  return Response.json(
    { error: 'ACCESS_DENIED', message: '권한이 없습니다', code: status },
    { status, headers: { 'X-Stock-Error': 'redacted' } },
  );
}
