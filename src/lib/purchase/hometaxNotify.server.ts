import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { notifyUser } from '@/lib/notifications/notifyUser';

const NOTIFY_COOLDOWN_MS = 24 * 60 * 60 * 1000;

function tsToMillis(v: unknown): number | null {
  if (!v) return null;
  if (typeof v === 'object' && v !== null && 'toDate' in v && typeof (v as { toDate: () => Date }).toDate === 'function') {
    return (v as { toDate: () => Date }).toDate().getTime();
  }
  if (typeof v === 'object' && v !== null && '_seconds' in v) {
    return Number((v as { _seconds: number })._seconds) * 1000;
  }
  return null;
}

/** 홈택스 세션 만료 시 매장 구성원에게 알림 (24시간에 1회) */
export async function notifyHometaxSessionExpired(storeId: string): Promise<boolean> {
  const ref = adminDb.collection('store_hometax_sessions').doc(storeId);
  const snap = await ref.get();
  if (!snap.exists) return false;

  const data = snap.data()!;
  const lastNotified = tsToMillis(data.lastExpiryNotifiedAt);
  if (lastNotified && Date.now() - lastNotified < NOTIFY_COOLDOWN_MS) {
    return false;
  }

  const storeSnap = await adminDb.collection('stores').doc(storeId).get();
  const storeName = String(storeSnap.data()?.name || storeSnap.data()?.storeName || '매장');

  const uids = new Set<string>();
  if (data.linkedBy) uids.add(String(data.linkedBy));

  const members = await adminDb
    .collection('user_store_map')
    .where('storeId', '==', storeId)
    .get();
  members.docs.forEach(d => {
    const uid = String(d.data().uid || '');
    if (uid) uids.add(uid);
  });

  if (uids.size === 0) return false;

  const link = '/dashboard/settings/hometax';
  const message = `${storeName} 홈택스 연결이 만료되었습니다. Chrome 확장 또는 수동 연결로 세션을 갱신하세요.`;

  await Promise.all([...uids].map(uid =>
    notifyUser(uid, {
      title: '홈택스 세션 만료',
      message,
      link,
      type: 'hometax_session_expired',
      storeId,
    }),
  ));

  await ref.set({ lastExpiryNotifiedAt: FieldValue.serverTimestamp() }, { merge: true });
  return true;
}

export async function clearHometaxExpiryNotification(storeId: string) {
  await adminDb.collection('store_hometax_sessions').doc(storeId).set({
    lastExpiryNotifiedAt: null,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

export async function checkAllHometaxSessionsAndNotify(): Promise<{
  checked: number;
  expired: number;
  notified: number;
}> {
  const snap = await adminDb.collection('store_hometax_sessions').get();
  let expired = 0;
  let notified = 0;

  for (const doc of snap.docs) {
    const status = String(doc.data().lastSyncStatus || '');
    if (status !== 'expired') continue;
    expired++;
    const sent = await notifyHometaxSessionExpired(doc.id);
    if (sent) notified++;
  }

  return { checked: snap.size, expired, notified };
}
