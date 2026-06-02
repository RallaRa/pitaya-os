import { NextResponse } from 'next/server';
import { Readable } from 'stream';
import { streamDriveFile } from '@/lib/googleDrive';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const fileId = searchParams.get('id')?.trim();
  const storeId = searchParams.get('store')?.trim();

  if (!fileId || !storeId) {
    return NextResponse.json({ error: 'id and store required' }, { status: 400 });
  }

  try {
    const { stream, mimeType } = await streamDriveFile(storeId, fileId);
    const webStream = Readable.toWeb(stream as Readable) as ReadableStream;

    return new Response(webStream, {
      headers: {
        'Content-Type': mimeType,
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 404 });
  }
}
