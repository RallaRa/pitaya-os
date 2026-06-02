import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { verifyToken } from '@/lib/authVerify';
import { uploadPublicOrderPhotoToDrive } from '@/lib/googleDrive';

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
    const storeId = sessionDoc.data()?.storeId as string;

    const photoUrl = await uploadPublicOrderPhotoToDrive(
      storeId,
      sessionId,
      body.fileContent,
      body.fileName,
      body.mimeType || 'image/jpeg',
    );

    return NextResponse.json({ photoUrl });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
