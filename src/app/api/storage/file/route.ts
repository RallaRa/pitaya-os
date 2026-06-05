import { NextResponse } from 'next/server';
import { getAdminStorageBucket } from '@/lib/firebase/admin';

/** GCS 커스텀 버킷 파일 — token 쿼리로 공개 조회 (사이니지·매입 원본 등) */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const path = searchParams.get('path');
  const token = searchParams.get('token');

  if (!path || !token) {
    return NextResponse.json({ error: 'path, token required' }, { status: 400 });
  }
  if (path.includes('..') || path.startsWith('/')) {
    return NextResponse.json({ error: 'invalid path' }, { status: 400 });
  }

  try {
    const bucket = getAdminStorageBucket();
    const file = bucket.file(path);
    const [exists] = await file.exists();
    if (!exists) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }

    const [metadata] = await file.getMetadata();
    const storedToken = metadata.metadata?.firebaseStorageDownloadTokens;
    if (!storedToken || storedToken !== token) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    const [buf] = await file.download();
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': metadata.contentType || 'application/octet-stream',
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[storage/file]', msg);
    return NextResponse.json({ error: 'download failed' }, { status: 500 });
  }
}
