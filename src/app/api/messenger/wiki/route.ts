import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { createWikiPage, listWikiPages } from '@/lib/messenger/wikiPages.server';

export const dynamic = 'force-dynamic';

/** GET /api/messenger/wiki?storeId=&q=&category=&roomId= */
export async function GET(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  try {
    const pages = await listWikiPages(storeId, {
      q: searchParams.get('q') || undefined,
      category: searchParams.get('category') || undefined,
      roomId: searchParams.get('roomId') || undefined,
    });
    return NextResponse.json({ ok: true, pages });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** POST /api/messenger/wiki — 페이지 생성 */
export async function POST(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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

    const page = await createWikiPage(
      storeId,
      { title, content, category, roomId },
      { uid: user.uid, name: user.email || '사용자' },
    );
    return NextResponse.json({ ok: true, page });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
