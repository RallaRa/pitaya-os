import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { listMessengerFiles, registerMessengerFile } from '@/lib/messenger/fileStore.server';

export const dynamic = 'force-dynamic';

/** GET /api/messenger/files?storeId=&folderId=&q=&roomId= */
export async function GET(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  try {
    const files = await listMessengerFiles(storeId, {
      folderId: searchParams.get('folderId') || undefined,
      q: searchParams.get('q') || undefined,
      roomId: searchParams.get('roomId') || undefined,
    });
    return NextResponse.json({ ok: true, files });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** POST /api/messenger/files — 메타 등록 (클라이언트 Storage 업로드 후) */
export async function POST(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const storeId = String(body.storeId || '');
    const name = String(body.name || '').trim();
    const url = String(body.url || '');
    if (!storeId || !name || !url) {
      return NextResponse.json({ error: 'storeId, name, url required' }, { status: 400 });
    }

    const file = await registerMessengerFile({
      storeId,
      name,
      url,
      type: String(body.type || ''),
      size: Number(body.size || 0),
      folderId: body.folderId ? String(body.folderId) : '기타',
      roomId: body.roomId ? String(body.roomId) : undefined,
      storagePath: body.storagePath ? String(body.storagePath) : undefined,
      uploadedBy: user.uid,
      uploadedByName: user.email,
    });
    return NextResponse.json({ ok: true, file });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
