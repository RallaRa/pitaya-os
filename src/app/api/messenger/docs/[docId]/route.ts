import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import {
  deleteMessengerDocument,
  getMessengerDocument,
  updateMessengerDocument,
} from '@/lib/messenger/documents.server';

export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ docId: string }> };

/** GET /api/messenger/docs/[docId]?storeId= */
export async function GET(req: Request, ctx: RouteCtx) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { docId } = await ctx.params;
  const storeId = new URL(req.url).searchParams.get('storeId') || '';
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  try {
    const document = await getMessengerDocument(storeId, docId);
    if (!document) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ ok: true, document });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** PUT /api/messenger/docs/[docId] */
export async function PUT(req: Request, ctx: RouteCtx) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { docId } = await ctx.params;
  try {
    const body = await req.json();
    const storeId = String(body.storeId || '');
    if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

    const document = await updateMessengerDocument(
      storeId,
      docId,
      {
        title: body.title,
        type: body.type,
        content: body.content,
        roomId: body.roomId,
        isTemplate: body.isTemplate,
        collaborators: Array.isArray(body.collaborators) ? body.collaborators.map(String) : undefined,
      },
      { uid: user.uid, name: user.email || '사용자' },
    );
    return NextResponse.json({ ok: true, document });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** DELETE /api/messenger/docs/[docId]?storeId= */
export async function DELETE(req: Request, ctx: RouteCtx) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { docId } = await ctx.params;
  const storeId = new URL(req.url).searchParams.get('storeId') || '';
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  try {
    await deleteMessengerDocument(storeId, docId);
    return NextResponse.json({ ok: true, docId });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
