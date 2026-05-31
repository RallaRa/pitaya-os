import { NextResponse } from 'next/server';
import { adminDb, adminStorage } from '@/lib/firebase/admin';
import { verifyToken } from '@/lib/authVerify';
import { v4 as uuidv4 } from 'uuid';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sessionId } = await params;
  let body: { fileName?: string; fileContent?: string; mimeType?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.fileContent || !body.fileName) {
    return NextResponse.json({ error: '파일이 필요합니다' }, { status: 400 });
  }

  try {
    const sessionDoc = await adminDb.collection('public_order_sessions').doc(sessionId).get();
    if (!sessionDoc.exists) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    const storeId = sessionDoc.data()?.storeId;

    const base64 = body.fileContent.includes(',')
      ? body.fileContent.split(',')[1]
      : body.fileContent;
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length > 10 * 1024 * 1024) {
      return NextResponse.json({ error: '10MB 이하만 업로드 가능합니다' }, { status: 400 });
    }

    const token = uuidv4();
    const ext = body.fileName.split('.').pop()?.toLowerCase() || 'jpg';
    const safeName = `line_${Date.now()}_${token.slice(0, 8)}.${ext}`;
    const storagePath = `stores/${storeId}/public-orders/${sessionId}/${safeName}`;

    const bucket = adminStorage.bucket();
    await bucket.file(storagePath).save(buffer, {
      metadata: {
        contentType: body.mimeType || 'image/jpeg',
        metadata: { firebaseStorageDownloadTokens: token },
      },
    });

    const photoUrl =
      `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`;

    return NextResponse.json({ photoUrl });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
