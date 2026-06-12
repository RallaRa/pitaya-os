import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { loadSignageShowContext } from '@/lib/signage/signageShowContext.server';
import { buildFallbackShowPlan, sanitizeSlidesForCustomer } from '@/lib/signage/signageShowPlanner';
import {
  clearAutoRotationSlides,
  saveSignageShowPlan,
  SIGNAGE_AUTO_ROTATION_SOURCE,
} from '@/lib/signage/signageShowSave.server';

export interface SignageRotationResult {
  storeId: string;
  skipped?: boolean;
  reason?: string;
  removed?: number;
  created?: number;
  slotLabel?: string;
}

async function shouldRotateStore(storeId: string): Promise<{ ok: boolean; reason?: string }> {
  const settingsSnap = await adminDb.collection('signage_settings').doc(storeId).get();
  const settings = settingsSnap.data() || {};
  if (settings.autoShowRotation === false) {
    return { ok: false, reason: 'autoShowRotation_disabled' };
  }

  const screensSnap = await adminDb.collection('signage_screens')
    .where('storeId', '==', storeId)
    .limit(1)
    .get();
  if (!screensSnap.empty) return { ok: true };

  const approvedSnap = await adminDb.collection('signage_content')
    .where('storeId', '==', storeId)
    .where('status', '==', 'approved')
    .limit(1)
    .get();
  if (!approvedSnap.empty) return { ok: true };

  const contentSnap = await adminDb.collection('signage_content')
    .where('storeId', '==', storeId)
    .limit(200)
    .get();
  if (contentSnap.docs.some(d => d.data().rotationSource === SIGNAGE_AUTO_ROTATION_SOURCE)) {
    return { ok: true };
  }

  return { ok: false, reason: 'no_signage_usage' };
}

export async function runSignageShowRotation(storeId: string): Promise<SignageRotationResult> {
  const gate = await shouldRotateStore(storeId);
  if (!gate.ok) {
    return { storeId, skipped: true, reason: gate.reason };
  }

  const ctx = await loadSignageShowContext(storeId);
  const plan = buildFallbackShowPlan(ctx);
  const slides = sanitizeSlidesForCustomer(plan.slides);
  if (!slides.length) {
    return { storeId, skipped: true, reason: 'empty_plan' };
  }

  const removed = await clearAutoRotationSlides(storeId);
  const { createdIds } = await saveSignageShowPlan(storeId, slides, {
    autoApprove: true,
    createdBy: 'system-cron',
    rotationSource: SIGNAGE_AUTO_ROTATION_SOURCE,
  });

  await adminDb.collection('signage_settings').doc(storeId).set({
    storeId,
    lastAutoRotationAt: FieldValue.serverTimestamp(),
    lastRotationSlot: ctx.rotation.slotLabel,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return {
    storeId,
    removed,
    created: createdIds.length,
    slotLabel: ctx.rotation.slotLabel,
  };
}

export async function runSignageShowRotationForAllStores(limit = 50): Promise<SignageRotationResult[]> {
  const storesSnap = await adminDb.collection('stores').limit(limit).get();
  const results: SignageRotationResult[] = [];
  for (const doc of storesSnap.docs) {
    results.push(await runSignageShowRotation(doc.id));
  }
  return results;
}
