import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { registerChatSharedFile } from '@/lib/messenger/fileStore.server';

export const dynamic = 'force-dynamic';

/** POST /api/messenger/files/from-chat — 채팅 공유 파일 자동 수집 */
export async function POST(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const storeId = String(body.storeId || '');
    const roomId = String(body.roomId || '');
    const url = String(body.url || '');
    const name = String(body.name || '');
    if (!storeId || !roomId || !url || !name) {
      return NextResponse.json({ error: 'storeId, roomId, url, name required' }, { status: 400 });
    }

    const file = await registerChatSharedFile({
      storeId,
      roomId,
      url,
      name,
      type: String(body.type || ''),
      size: Number(body.size || 0),
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
