import { adminDb } from '@/lib/firebase/admin';

const RECENT_SYNC_MS = 30 * 24 * 60 * 60 * 1000;

function syncTimestamp(data: FirebaseFirestore.DocumentData): number | null {
  const ts = data.syncedAt ?? data.createdAt;
  if (!ts) return null;
  if (typeof ts.toDate === 'function') return ts.toDate().getTime();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  return null;
}

/** 매장에 POS bridge 연동이 활성인지 확인합니다. */
export async function storeHasPosBridge(storeId: string): Promise<boolean> {
  if (!storeId) return false;

  const storeDoc = await adminDb.collection('stores').doc(storeId).get();
  if (storeDoc.exists) {
    const flag = storeDoc.data()?.posBridgeEnabled;
    if (flag === true) return true;
    if (flag === false) return false;
  }

  const logSnap = await adminDb.collection('pos_sync_log')
    .where('storeId', '==', storeId)
    .limit(30)
    .get()
    .catch(() => null);

  if (!logSnap?.empty) {
    const now = Date.now();
    for (const doc of logSnap.docs) {
      const t = syncTimestamp(doc.data());
      if (t && now - t < RECENT_SYNC_MS) return true;
    }
  }

  return false;
}
