import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { appendYjsUpdate } from '@/lib/messenger/documents.server';

export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ docId: string }> };

/** POST /api/messenger/docs/[docId]/yjs — Yjs 업데이트 브로드캐스트 */
export async function POST(req: Request, ctx: RouteCtx) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { docId } = await ctx.params;
  try {
    const body = await req.json();
    const storeId = String(body.storeId || '');
    const update = String(body.update || '');
    const clientId = String(body.clientId || '');
    if (!storeId || !update || !clientId) {
      return NextResponse.json({ error: 'storeId, update, clientId required' }, { status: 400 });
    }

    await appendYjsUpdate(storeId, docId, { update, clientId, uid: user.uid });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
