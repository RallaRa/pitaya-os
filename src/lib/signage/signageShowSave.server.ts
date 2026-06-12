import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { planToSignageContentUrl, type SignageSlidePlan } from '@/lib/signage/signageShowPlanner';

export const SIGNAGE_AUTO_ROTATION_SOURCE = 'auto_rotation';

export interface SaveSignageShowOptions {
  autoApprove?: boolean;
  createdBy?: string;
  rotationSource?: typeof SIGNAGE_AUTO_ROTATION_SOURCE | 'manual';
}

async function syncSignagePlaylist(storeId: string) {
  const approvedSnap = await adminDb.collection('signage_content')
    .where('storeId', '==', storeId)
    .where('status', '==', 'approved')
    .get();
  const approved = approvedSnap.docs
    .map(d => ({ id: d.id, order: (d.data().order as number) ?? 0 }))
    .sort((a, b) => a.order - b.order);
  await adminDb.collection('signage_playlist').doc(storeId).set({
    storeId,
    approvedIds: approved.map(a => a.id),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return approved.map(a => a.id);
}

/** 기존 자동 로테이션 슬라이드 제거 후 플레이리스트 동기화 */
export async function clearAutoRotationSlides(storeId: string): Promise<number> {
  const snap = await adminDb.collection('signage_content')
    .where('storeId', '==', storeId)
    .get();

  const toDelete = snap.docs.filter(d => d.data().rotationSource === SIGNAGE_AUTO_ROTATION_SOURCE);
  if (!toDelete.length) return 0;

  const batch = adminDb.batch();
  for (const doc of toDelete) {
    batch.delete(doc.ref);
  }
  await batch.commit();
  await syncSignagePlaylist(storeId);
  return toDelete.length;
}

export async function saveSignageShowPlan(
  storeId: string,
  slides: SignageSlidePlan[],
  opts: SaveSignageShowOptions = {},
): Promise<{ createdIds: string[]; approvedIds?: string[] }> {
  const autoApprove = opts.autoApprove ?? false;
  const createdBy = opts.createdBy || 'system';
  const rotationSource = opts.rotationSource;

  const countSnap = await adminDb.collection('signage_content')
    .where('storeId', '==', storeId)
    .get();
  let orderBase = countSnap.size;

  const batch = adminDb.batch();
  const createdIds: string[] = [];

  for (const slide of slides) {
    const ref = adminDb.collection('signage_content').doc();
    batch.set(ref, {
      storeId,
      type: 'text',
      title: slide.title,
      url: planToSignageContentUrl(slide),
      thumbnailUrl: '',
      duration: slide.duration,
      order: orderBase++,
      status: autoApprove ? 'approved' : 'pending',
      aiPrompt: `[${slide.topic}] ${slide.body}`,
      bgColor: slide.bgColor || '#1a1a2e',
      textColor: slide.textColor || '#ffffff',
      createdAt: FieldValue.serverTimestamp(),
      createdBy,
      ...(rotationSource ? { rotationSource } : {}),
      ...(autoApprove ? { approvedAt: FieldValue.serverTimestamp() } : {}),
    });
    createdIds.push(ref.id);
  }

  await batch.commit();

  if (autoApprove) {
    const approvedIds = await syncSignagePlaylist(storeId);
    return { createdIds, approvedIds };
  }

  return { createdIds };
}
