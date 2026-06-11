import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { listDocumentVersions } from '@/lib/messenger/documents.server';

export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ docId: string }> };

/** GET /api/messenger/docs/[docId]/versions?storeId= */
export async function GET(req: Request, ctx: RouteCtx) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { docId } = await ctx.params;
  const storeId = new URL(req.url).searchParams.get('storeId') || '';
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  try {
    const versions = await listDocumentVersions(storeId, docId);
    return NextResponse.json({ ok: true, versions });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
