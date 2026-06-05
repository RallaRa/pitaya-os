import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import {
  getWikiDocBySlug,
  listWikiDocs,
  wikiIndexFromDocs,
} from '@/lib/wiki/wikiStore';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  const slug = searchParams.get('slug');

  if (!storeId) {
    return NextResponse.json({ error: 'storeId 필요' }, { status: 400 });
  }

  try {
    if (slug) {
      const doc = await getWikiDocBySlug(storeId, slug);
      if (!doc) {
        return NextResponse.json({ error: '문서 없음' }, { status: 404 });
      }
      return NextResponse.json({ doc });
    }

    const docs = await listWikiDocs(storeId);
    return NextResponse.json({
      docs,
      index: wikiIndexFromDocs(docs),
    });
  } catch (err) {
    console.error('[wiki]', err);
    return NextResponse.json({ error: '위키 조회 실패' }, { status: 500 });
  }
}
