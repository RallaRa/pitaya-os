import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { createMessengerDocument, listMessengerDocuments } from '@/lib/messenger/documents.server';

export const dynamic = 'force-dynamic';

/** GET /api/messenger/docs?storeId=&q=&type=&roomId=&templates=1 */
export async function GET(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  try {
    const documents = await listMessengerDocuments(storeId, {
      q: searchParams.get('q') || undefined,
      type: searchParams.get('type') || undefined,
      roomId: searchParams.get('roomId') || undefined,
      templatesOnly: searchParams.get('templates') === '1',
    });
    return NextResponse.json({ ok: true, documents });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** POST /api/messenger/docs — 문서/템플릿 생성 */
export async function POST(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const storeId = String(body.storeId || '');
    const title = String(body.title || '').trim();
    if (!storeId || !title) {
      return NextResponse.json({ error: 'storeId, title required' }, { status: 400 });
    }

    const document = await createMessengerDocument(
      storeId,
      {
        title,
        type: String(body.type || '자유양식'),
        content: body.content ? String(body.content) : undefined,
        roomId: body.roomId ? String(body.roomId) : undefined,
        isTemplate: !!body.isTemplate,
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
