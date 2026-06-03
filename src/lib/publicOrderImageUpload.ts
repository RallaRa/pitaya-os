import { adminDb } from '@/lib/firebase/admin';
import { uploadPublicOrderPhotoToDrive } from '@/lib/googleDrive';

export async function uploadPublicOrderPhoto(
  storeId: string,
  sessionId: string,
  fileContent: string,
  fileName: string,
  mimeType = 'image/jpeg',
): Promise<string> {
  return uploadPublicOrderPhotoToDrive(storeId, sessionId, fileContent, fileName, mimeType);
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
    visitorCount: 0,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}
