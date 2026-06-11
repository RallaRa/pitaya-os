import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { deleteMessengerFile } from '@/lib/messenger/fileStore.server';

export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ fileId: string }> };

/** DELETE /api/messenger/files/[fileId]?storeId= */
export async function DELETE(req: Request, ctx: RouteCtx) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { fileId } = await ctx.params;
  const storeId = new URL(req.url).searchParams.get('storeId') || '';
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  try {
    await deleteMessengerFile(storeId, fileId);
    return NextResponse.json({ ok: true, fileId });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
