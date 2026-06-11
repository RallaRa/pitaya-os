import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { ensureSalesAlertChannel, postMessengerText } from '@/lib/messenger/channels.server';
import {
  loadCostRatioDetail,
  type CostRatioItemRow,
} from '@/lib/costRatio';

function alertDocId(storeId: string, itemId: string): string {
  return `${storeId}_${itemId}`.replace(/[/\\#?]/g, '_').slice(0, 500);
}

function formatAlertMessage(row: CostRatioItemRow): string {
  const est = row.isEstimated ? ' (추정)' : '';
  return [
    '⚠️ 원가율 경고',
    `품목: ${row.name}${est}`,
    `현재 원가율: ${(row.actualRatio * 100).toFixed(1)}%`,
    `목표: ${(row.targetRatio * 100).toFixed(1)}%`,
    '→ 가격 조정 검토 필요',
  ].join('\n');
}

async function shouldSendAlert(
  storeId: string,
  itemId: string,
  actualRatio: number,
  force: boolean,
): Promise<boolean> {
  if (force) return true;
  const ref = adminDb.collection('cost_ratio_alert_sent').doc(alertDocId(storeId, itemId));
  const snap = await ref.get();
  if (!snap.exists) return true;

  const prev = Number(snap.data()?.actualRatio ?? 0);
  const lastAt = snap.data()?.sentAt;
  const lastMs = lastAt?.toMillis?.() ?? 0;
  const dayAgo = Date.now() - 86400000;

  if (actualRatio > prev + 0.01) return true;
  if (lastMs < dayAgo) return true;
  return false;
}

async function markAlertSent(storeId: string, itemId: string, actualRatio: number) {
  await adminDb.collection('cost_ratio_alert_sent').doc(alertDocId(storeId, itemId)).set({
    storeId,
    itemId,
    actualRatio,
    sentAt: FieldValue.serverTimestamp(),
  });
}

export async function sendCostRatioAlertForItem(
  storeId: string,
  itemId: string,
  force = false,
): Promise<{ sent: boolean; reason?: string }> {
  const detail = await loadCostRatioDetail(storeId);
  const row = detail.items.find(i => i.id === itemId);
  if (!row) return { sent: false, reason: 'item_not_found' };
  if (!row.isOverTarget) return { sent: false, reason: 'within_target' };

  const ok = await shouldSendAlert(storeId, itemId, row.actualRatio, force);
  if (!ok) return { sent: false, reason: 'deduped' };

  try {
    const roomId = await ensureSalesAlertChannel(storeId);
    await postMessengerText({ roomId, text: formatAlertMessage(row) });
    await markAlertSent(storeId, itemId, row.actualRatio);
    return { sent: true };
  } catch (e) {
    console.warn('[costRatioAlert] send failed:', e);
    return { sent: false, reason: 'messenger_error' };
  }
}

export async function sendCostRatioAlertsForStore(
  storeId: string,
  force = false,
): Promise<{ sent: number; skipped: number }> {
  const detail = await loadCostRatioDetail(storeId);
  let sent = 0;
  let skipped = 0;

  for (const row of detail.items.filter(i => i.isOverTarget)) {
    const result = await sendCostRatioAlertForItem(storeId, row.id, force);
    if (result.sent) sent += 1;
    else skipped += 1;
  }

  return { sent, skipped };
}
