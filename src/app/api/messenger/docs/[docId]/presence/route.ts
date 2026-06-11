import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { setDocumentPresence } from '@/lib/messenger/documents.server';

export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ docId: string }> };

/** POST /api/messenger/docs/[docId]/presence — 커서/편집자 presence */
export async function POST(req: Request, ctx: RouteCtx) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { docId } = await ctx.params;
  try {
    const body = await req.json();
    const storeId = String(body.storeId || '');
    if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

    await setDocumentPresence(storeId, docId, {
      uid: user.uid,
      name: String(body.name || user.email || '사용자'),
      color: String(body.color || '#2dd4bf'),
      cursor: Number(body.cursor || 0),
    });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
