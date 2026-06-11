import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getPosAlertSettings } from '@/lib/pos/posAlertSettings';

function autoContentDocId(storeId: string): string {
  return `${storeId}_pos_auto_top1`.replace(/[/\\#?]/g, '_').slice(0, 500);
}

async function syncPlaylistWithAuto(storeId: string, autoContentId: string): Promise<void> {
  const snap = await adminDb.collection('signage_content')
    .where('storeId', '==', storeId)
    .where('status', '==', 'approved')
    .get();

  const others = snap.docs
    .filter(d => d.id !== autoContentId)
    .map(d => ({ id: d.id, order: Number(d.data().order ?? 0) }))
    .sort((a, b) => a.order - b.order);

  const approvedIds = [autoContentId, ...others.map(o => o.id)];

  await adminDb.collection('signage_playlist').doc(storeId).set({
    storeId,
    approvedIds,
    autoTopItemId: autoContentId,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

export async function updateSignageTopSeller(
  storeId: string,
  items: Array<{ name: string; qty: number }>,
): Promise<{ updated: boolean; itemName?: string; qty?: number }> {
  const settings = await getPosAlertSettings(storeId);
  if (!settings.signageAutoSwitchEnabled) {
    return { updated: false };
  }

  const sorted = [...items].filter(i => i.name && i.qty > 0).sort((a, b) => b.qty - a.qty);
  const top = sorted[0];
  if (!top) return { updated: false };

  const docId = autoContentDocId(storeId);
  const prev = await adminDb.collection('signage_content').doc(docId).get();
  const prevName = String(prev.data()?.autoItemName || '');
  if (prevName === top.name && Number(prev.data()?.autoQty || 0) === top.qty) {
    return { updated: false, itemName: top.name, qty: top.qty };
  }

  const payload = JSON.stringify({
    title: '🔥 오늘의 인기',
    body: top.name,
    footer: `최근 1시간 ${top.qty}개 판매`,
  });

  await adminDb.collection('signage_content').doc(docId).set({
    storeId,
    type: 'text',
    title: `🔥 ${top.name}`,
    url: payload,
    duration: 15,
    order: -1,
    status: 'approved',
    source: 'pos_auto_top1',
    autoItemName: top.name,
    autoQty: top.qty,
    approvedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  await syncPlaylistWithAuto(storeId, docId);

  await adminDb.collection('signage_settings').doc(storeId).set({
    storeId,
    lastAutoItem: top.name,
    lastAutoQty: top.qty,
    lastAutoAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return { updated: true, itemName: top.name, qty: top.qty };
}
