import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import {
  deleteWikiPage,
  getWikiPage,
  updateWikiPage,
} from '@/lib/messenger/wikiPages.server';

export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ pageId: string }> };

/** GET /api/messenger/wiki/[pageId]?storeId= */
export async function GET(req: Request, ctx: RouteCtx) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { pageId } = await ctx.params;
  const storeId = new URL(req.url).searchParams.get('storeId') || '';
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  try {
    const page = await getWikiPage(storeId, pageId);
    if (!page) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ ok: true, page });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** PUT /api/messenger/wiki/[pageId] */
export async function PUT(req: Request, ctx: RouteCtx) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { pageId } = await ctx.params;
  try {
    const body = await req.json();
    const storeId = String(body.storeId || '');
    const title = String(body.title || '').trim();
    const content = String(body.content || '');
    const category = String(body.category || '운영매뉴얼');
    const roomId = body.roomId ? String(body.roomId) : undefined;

    if (!storeId || !title) {
      return NextResponse.json({ error: 'storeId, title required' }, { status: 400 });
    }

    const page = await updateWikiPage(
      storeId,
      pageId,
      { title, content, category, roomId },
      { uid: user.uid, name: user.email || '사용자' },
    );
    return NextResponse.json({ ok: true, page });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** DELETE /api/messenger/wiki/[pageId]?storeId= */
export async function DELETE(req: Request, ctx: RouteCtx) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { pageId } = await ctx.params;
  const storeId = new URL(req.url).searchParams.get('storeId') || '';
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  try {
    await deleteWikiPage(storeId, pageId);
    return NextResponse.json({ ok: true, pageId });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
