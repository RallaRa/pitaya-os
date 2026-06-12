import { NextResponse } from 'next/server';
import { requireSuperuser } from '@/lib/devAuth';
import { getCapsCameraById } from '@/lib/caps/capsConfig.server';
import { issueCapsStreamTicket } from '@/lib/caps/capsStreamTicket.server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const auth = await requireSuperuser(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await req.json();
    const cameraId = String(body.cameraId || '').trim();
    if (!cameraId) return NextResponse.json({ error: 'cameraId required' }, { status: 400 });

    const cam = await getCapsCameraById(cameraId);
    if (!cam) return NextResponse.json({ error: '카메라를 찾을 수 없습니다.' }, { status: 404 });

    const ticket = issueCapsStreamTicket(cameraId, auth.user!.uid);
    return NextResponse.json({
      ticket,
      streamType: cam.streamType,
      expiresInSec: 300,
      streamPath: `/api/superuser/caps/stream?cameraId=${encodeURIComponent(cameraId)}&ticket=${encodeURIComponent(ticket)}`,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '티켓 발급 실패';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
