import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { verifyToken } from '@/lib/authVerify';
import { getAdminStorageBucket } from '@/lib/firebase/admin';
import { buildStoredFileUrl, formatStorageError } from '@/lib/firebase/storageBucket';

const MIME_EXT: Record<string, string> = {
  'video/webm': 'webm',
  'video/mp4': 'mp4',
  'image/png': 'png',
  'image/jpeg': 'jpg',
};

export async function POST(req: NextRequest) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { storeId, fileName, fileContent, mimeType } = body as {
      storeId?: string;
      fileName?: string;
      fileContent?: string;
      mimeType?: string;
    };

    if (!fileContent) {
      return NextResponse.json({ error: '파일이 필요합니다' }, { status: 400 });
    }

    const base64 = fileContent.includes(',') ? fileContent.split(',')[1] : fileContent;
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length > 80 * 1024 * 1024) {
      return NextResponse.json({ error: '80MB 이하만 업로드 가능합니다' }, { status: 400 });
    }

    const token = uuidv4();
    const sid = storeId || 'global';
    const contentType = mimeType || 'video/webm';
    const extFromName = fileName?.split('.').pop()?.toLowerCase();
    const ext = extFromName || MIME_EXT[contentType] || 'webm';
    const storagePath = `signage/${sid}/${Date.now()}.${ext}`;

    const bucket = getAdminStorageBucket();
    await bucket.file(storagePath).save(buffer, {
      metadata: {
        contentType,
        metadata: { firebaseStorageDownloadTokens: token },
      },
    });

    const url = buildStoredFileUrl(bucket.name, storagePath, token);

    return NextResponse.json({ url, thumbnailUrl: url, success: true });
  } catch (e: unknown) {
    const msg = formatStorageError(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
