import { NextResponse } from 'next/server';
import { getCapsCameraById } from '@/lib/caps/capsConfig.server';
import { verifyCapsStreamTicket } from '@/lib/caps/capsStreamTicket.server';
import { requireSuperuser } from '@/lib/devAuth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SNAPSHOT_INTERVAL_MS = 2000;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const cameraId = searchParams.get('cameraId') || '';
  const ticket = searchParams.get('ticket') || '';

  let authorized = ticket && verifyCapsStreamTicket(ticket, cameraId);

  if (!authorized) {
    const auth = await requireSuperuser(req);
    authorized = !auth.error;
  }

  if (!authorized || !cameraId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cam = await getCapsCameraById(cameraId);
  if (!cam?.streamUrl) {
    return NextResponse.json({ error: '카메라 스트림 URL 없음' }, { status: 404 });
  }

  try {
    const upstream = await fetch(cam.streamUrl, {
      headers: {
        'User-Agent': 'PitayaOS-CapsProxy/1.0',
        Accept: '*/*',
      },
      signal: AbortSignal.timeout(cam.streamType === 'snapshot' ? 15_000 : 60_000),
      cache: 'no-store',
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `업스트림 오류 HTTP ${upstream.status}` },
        { status: 502 },
      );
    }

    const contentType = upstream.headers.get('content-type')
      || (cam.streamType === 'hls' ? 'application/vnd.apple.mpegurl' : 'image/jpeg');

    if (cam.streamType === 'snapshot') {
      const buf = await upstream.arrayBuffer();
      return new NextResponse(buf, {
        headers: {
          'Content-Type': contentType.split(';')[0],
          'Cache-Control': `public, max-age=${Math.floor(SNAPSHOT_INTERVAL_MS / 1000)}`,
        },
      });
    }

    const body = upstream.body;
    if (!body) {
      return NextResponse.json({ error: '스트림 본문 없음' }, { status: 502 });
    }

    return new NextResponse(body, {
      headers: {
        'Content-Type': contentType.split(';')[0],
        'Cache-Control': 'no-store',
        ...(cam.streamType === 'mjpeg' ? { 'X-Accel-Buffering': 'no' } : {}),
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '스트림 프록시 실패';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
