import { adminDb, adminStorage } from '@/lib/firebase/admin';
import { v4 as uuidv4 } from 'uuid';

export async function uploadPublicOrderPhoto(
  storeId: string,
  sessionId: string,
  fileContent: string,
  fileName: string,
  mimeType = 'image/jpeg',
): Promise<string> {
  const base64 = fileContent.includes(',') ? fileContent.split(',')[1] : fileContent;
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length > 10 * 1024 * 1024) {
    throw new Error('10MB 이하만 업로드 가능합니다');
  }

  const token = uuidv4();
  const ext = fileName.split('.').pop()?.toLowerCase() || 'jpg';
  const safeName = `line_${Date.now()}_${token.slice(0, 8)}.${ext}`;
  const storagePath = `stores/${storeId}/public-orders/${sessionId}/${safeName}`;

  const bucket = adminStorage.bucket();
  await bucket.file(storagePath).save(buffer, {
    metadata: {
      contentType: mimeType,
      metadata: { firebaseStorageDownloadTokens: token },
    },
  });

  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`;
}

export interface ChatImageInput {
  fileName: string;
  fileContent: string;
  mimeType?: string;
}

export async function ensureSessionForPhotos(
  storeId: string,
  sessionId: string | undefined,
  titleHint?: string,
): Promise<string> {
  if (sessionId) {
    const doc = await adminDb.collection('public_order_sessions').doc(sessionId).get();
    if (doc.exists && doc.data()?.storeId === storeId) return sessionId;
  }

  const { generatePublicToken } = await import('@/lib/publicOrders');
  const { FieldValue } = await import('firebase-admin/firestore');
  const title = (titleHint || '').trim() || `사진 등록 ${new Date().toISOString().slice(0, 10)}`;
  const ref = await adminDb.collection('public_order_sessions').add({
    storeId,
    title,
    description: '',
    status: 'draft',
    publicToken: generatePublicToken(),
    orderDeadline: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}
