import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import {
  listWikiPageVersions,
  restoreWikiPageVersion,
} from '@/lib/messenger/wikiPages.server';

export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ pageId: string }> };

/** GET /api/messenger/wiki/[pageId]/versions?storeId= */
export async function GET(req: Request, ctx: RouteCtx) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { pageId } = await ctx.params;
  const storeId = new URL(req.url).searchParams.get('storeId') || '';
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  try {
    const versions = await listWikiPageVersions(storeId, pageId);
    return NextResponse.json({ ok: true, versions });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** POST /api/messenger/wiki/[pageId]/versions — 버전 복원 */
export async function POST(req: Request, ctx: RouteCtx) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { pageId } = await ctx.params;
  try {
    const body = await req.json();
    const storeId = String(body.storeId || '');
    const version = Number(body.version);
    if (!storeId || !Number.isFinite(version)) {
      return NextResponse.json({ error: 'storeId, version required' }, { status: 400 });
    }

    const page = await restoreWikiPageVersion(
      storeId,
      pageId,
      version,
      { uid: user.uid, name: user.email || '사용자' },
    );
    return NextResponse.json({ ok: true, page });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
