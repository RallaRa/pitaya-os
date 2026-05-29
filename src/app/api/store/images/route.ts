import { NextResponse } from 'next/server';
import { adminDb, adminStorage } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyToken, getActualGroupId, isAdminGroup } from '@/lib/authVerify';
import { isSuperuserEmail } from '@/lib/auth/permissions';
import { v4 as uuidv4 } from 'uuid';
import { STORE_IMAGE_TYPES } from '@/lib/storeImages';

const VALID_CATEGORIES = new Set(STORE_IMAGE_TYPES.map(t => t.id));

async function assertCanManage(uid: string, email: string | undefined, storeId: string) {
  if (isSuperuserEmail(email)) return;
  const groupId = await getActualGroupId(uid, storeId);
  if (!isAdminGroup(groupId)) {
    throw new Error('권한 없음. 관리자 이상만 이미지를 관리할 수 있습니다.');
  }
}

function serializeImages(raw: Record<string, any> | undefined) {
  const result: Record<string, any[]> = {};
  for (const type of STORE_IMAGE_TYPES) {
    const list = raw?.[type.id];
    result[type.id] = Array.isArray(list)
      ? list.map(item => ({
          ...item,
          uploadedAt: item.uploadedAt?.toDate?.()?.toISOString?.() ?? item.uploadedAt ?? null,
        }))
      : [];
  }
  return result;
}

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId');
  if (!storeId) return NextResponse.json({ error: 'storeId 필요' }, { status: 400 });

  try {
    const doc = await adminDb.collection('stores').doc(storeId).get();
    if (!doc.exists) return NextResponse.json({ error: '매장 없음' }, { status: 404 });
    const images = serializeImages(doc.data()?.images);
    return NextResponse.json({ images });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { storeId, category, files } = body as {
      storeId: string;
      category: string;
      files: { fileName: string; fileContent: string; mimeType: string; fileSize?: number }[];
    };

    if (!storeId || !category || !VALID_CATEGORIES.has(category as any)) {
      return NextResponse.json({ error: '필수 항목 누락 또는 잘못된 카테고리' }, { status: 400 });
    }
    if (!Array.isArray(files) || files.length === 0) {
      return NextResponse.json({ error: '업로드할 파일이 없습니다.' }, { status: 400 });
    }

    await assertCanManage(authUser.uid, authUser.email, storeId);

    const storeRef = adminDb.collection('stores').doc(storeId);
    const storeDoc = await storeRef.get();
    if (!storeDoc.exists) return NextResponse.json({ error: '매장 없음' }, { status: 404 });

    const bucket = adminStorage.bucket();
    const uploaded: any[] = [];

    for (const file of files) {
      if (!file.fileContent || !file.fileName) continue;

      const base64 = file.fileContent.includes(',') ? file.fileContent.split(',')[1] : file.fileContent;
      const buffer = Buffer.from(base64, 'base64');

      if (buffer.length > 15 * 1024 * 1024) {
        return NextResponse.json({ error: '파일 크기는 15MB 이하여야 합니다.' }, { status: 400 });
      }

      const token = uuidv4();
      const ext = file.fileName.split('.').pop()?.toLowerCase() || 'jpg';
      const safeName = `${category}_${Date.now()}_${token.slice(0, 8)}.${ext}`;
      const storagePath = `stores/${storeId}/images/${category}/${safeName}`;

      await bucket.file(storagePath).save(buffer, {
        metadata: {
          contentType: file.mimeType || 'application/octet-stream',
          metadata: { firebaseStorageDownloadTokens: token },
        },
      });

      const fileUrl =
        `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`;

      uploaded.push({
        fileName: file.fileName,
        storagePath,
        fileUrl,
        category,
        fileSize: file.fileSize ?? buffer.length,
        mimeType: file.mimeType || 'application/octet-stream',
        uploadedAt: FieldValue.serverTimestamp(),
        uploadedBy: authUser.uid,
      });
    }

    if (uploaded.length === 0) {
      return NextResponse.json({ error: '업로드할 파일이 없습니다.' }, { status: 400 });
    }

    await storeRef.set({
      [`images.${category}`]: FieldValue.arrayUnion(...uploaded),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    const responseItems = uploaded.map(item => ({
      ...item,
      uploadedAt: new Date().toISOString(),
    }));

    return NextResponse.json({ success: true, uploaded: responseItems });
  } catch (e: any) {
    const status = e.message?.includes('권한') ? 403 : 500;
    return NextResponse.json({ error: e.message }, { status });
  }
}

export async function DELETE(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { storeId, category, storagePath } = body;

    if (!storeId || !category || !storagePath) {
      return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 });
    }

    await assertCanManage(authUser.uid, authUser.email, storeId);

    const storeRef = adminDb.collection('stores').doc(storeId);
    const storeDoc = await storeRef.get();
    if (!storeDoc.exists) return NextResponse.json({ error: '매장 없음' }, { status: 404 });

    const list: any[] = storeDoc.data()?.images?.[category] || [];
    const target = list.find(item => item.storagePath === storagePath);
    if (!target) return NextResponse.json({ error: '이미지 없음' }, { status: 404 });

    try {
      await adminStorage.bucket().file(storagePath).delete();
    } catch { /* already deleted */ }

    await storeRef.update({
      [`images.${category}`]: FieldValue.arrayRemove(target),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    const status = e.message?.includes('권한') ? 403 : 500;
    return NextResponse.json({ error: e.message }, { status });
  }
}
