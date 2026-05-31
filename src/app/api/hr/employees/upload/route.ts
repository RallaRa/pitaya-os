import { NextResponse } from 'next/server';
import { adminStorage } from '@/lib/firebase/admin';
import { verifyToken } from '@/lib/authVerify';
import { isAdminOrAbove } from '@/lib/auth/permissions';
import { adminDb } from '@/lib/firebase/admin';
import { v4 as uuidv4 } from 'uuid';

const ALLOWED_TYPES = ['employment_contract', 'health_certificate', 'bank_account'] as const;

async function checkAdmin(req: Request) {
  const user = await verifyToken(req);
  if (!user) return null;
  const userDoc = await adminDb.collection('users').doc(user.uid).get();
  const data = userDoc.data();
  if (!isAdminOrAbove(data?.groupId || 'staff', data?.email)) return null;
  return user;
}

export async function POST(req: Request) {
  const admin = await checkAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const body = await req.json();
    const { storeId, empNo, linkedUid, docType, fileName, fileContent, mimeType } = body;

    if (!storeId || !docType || !fileContent || !fileName) {
      return NextResponse.json({ error: 'storeId, docType, fileName, fileContent 필수' }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(docType)) {
      return NextResponse.json({ error: '지원하지 않는 문서 유형' }, { status: 400 });
    }

    const base64 = fileContent.includes(',') ? fileContent.split(',')[1] : fileContent;
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length > 15 * 1024 * 1024) {
      return NextResponse.json({ error: '파일 크기는 15MB 이하여야 합니다.' }, { status: 400 });
    }

    const folderKey = empNo || (linkedUid ? `_draft_${linkedUid}` : '_draft');
    const token = uuidv4();
    const ext = fileName.split('.').pop()?.toLowerCase() || 'bin';
    const safeName = `${Date.now()}_${token.slice(0, 8)}.${ext}`;
    const filePath = `hr_docs/${storeId}/${folderKey}/${docType}/${safeName}`;

    const bucket = adminStorage.bucket();
    const storageFile = bucket.file(filePath);
    await storageFile.save(buffer, {
      metadata: {
        contentType: mimeType || 'application/octet-stream',
        metadata: { firebaseStorageDownloadTokens: token },
      },
    });

    const bucketName = bucket.name;
    const fileUrl =
      `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(filePath)}?alt=media&token=${token}`;

    return NextResponse.json({
      ok: true,
      fileName,
      fileUrl,
      filePath,
      mimeType: mimeType || 'application/octet-stream',
      uploadedAt: new Date().toISOString(),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
