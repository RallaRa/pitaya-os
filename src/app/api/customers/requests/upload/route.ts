import { NextResponse } from 'next/server';
import { adminStorage } from '@/lib/firebase/admin';
import { verifyToken } from '@/lib/authVerify';
import { v4 as uuidv4 } from 'uuid';

const MAX_BYTES = 10 * 1024 * 1024;

// POST /api/customers/requests/upload
export async function POST(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { storeId, cusCode, fileName, fileContent, mimeType } = body;

    if (!storeId || !cusCode || !fileName || !fileContent) {
      return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 });
    }

    const base64 = String(fileContent).includes(',')
      ? String(fileContent).split(',')[1]
      : String(fileContent);
    const buffer = Buffer.from(base64, 'base64');

    if (buffer.length > MAX_BYTES) {
      return NextResponse.json({ error: '파일 크기는 10MB 이하여야 합니다.' }, { status: 400 });
    }

    const token = uuidv4();
    const ext = String(fileName).split('.').pop()?.toLowerCase() || 'bin';
    const safeName = `${Date.now()}_${token.slice(0, 8)}.${ext}`;
    const filePath = `customer_requests/${storeId}/${cusCode}/${safeName}`;

    const bucket = adminStorage.bucket();
    const storageFile = bucket.file(filePath);
    await storageFile.save(buffer, {
      metadata: {
        contentType: mimeType || 'application/octet-stream',
        metadata: { firebaseStorageDownloadTokens: token },
      },
    });

    const fileUrl =
      `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(filePath)}?alt=media&token=${token}`;

    return NextResponse.json({
      attachment: {
        id: token,
        fileName: String(fileName),
        fileUrl,
        mimeType: mimeType || 'application/octet-stream',
        size: buffer.length,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Upload failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
