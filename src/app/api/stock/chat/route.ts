import { NextResponse } from 'next/server';
import { requireStockSuperuser, stockAccessDeniedResponse } from '@/lib/stock/superuserAuth';
import {
  confirmStockChatAction,
  getStockChatHistory,
  processStockChat,
  type ChatMessage,
  type PendingChatAction,
} from '@/lib/stock/chat.server';

export const dynamic = 'force-dynamic';

function sessionFromReq(req: Request) {
  return req.headers.get('x-stock-session') || req.headers.get('x-stock-chat-session') || 'default';
}

export async function GET(req: Request) {
  const auth = await requireStockSuperuser(req);
  if (auth.error || !auth.user) return stockAccessDeniedResponse(auth.code as 401 | 403);
  const sessionId = sessionFromReq(req);
  const history = await getStockChatHistory(sessionId);
  return NextResponse.json({ ok: true, sessionId, ...history });
}

export async function POST(req: Request) {
  const auth = await requireStockSuperuser(req);
  if (auth.error || !auth.user) return stockAccessDeniedResponse(auth.code as 401 | 403);

  const body = await req.json().catch(() => ({}));
  const sessionId = String(body.sessionId || sessionFromReq(req));
  const message = String(body.message || '').trim();
  const history = (body.history || []) as ChatMessage[];

  if (!message) {
    return NextResponse.json({ ok: false, error: 'EMPTY_MESSAGE' }, { status: 400 });
  }

  if (body.confirm && body.pendingAction) {
    const result = await confirmStockChatAction(
      auth.user.uid,
      sessionId,
      body.pendingAction as PendingChatAction,
      !!body.force,
    );
    return NextResponse.json(result);
  }

  const result = await processStockChat(auth.user.uid, sessionId, message, history);
  return NextResponse.json({ ok: true, sessionId, ...result });
}
