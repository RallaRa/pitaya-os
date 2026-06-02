import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { verifyToken } from '@/lib/authVerify';
import { HYGIENE_SECTIONS } from '@/lib/hygieneChecklist';
import {
  buildItemsWithSections,
  countItemsStats,
  getAutoFillSectionIndices,
  kstDateParts,
  sectionLabels,
  shouldFinalSaveOnEntry,
  type HygieneItems,
} from '@/lib/hygieneSchedule';

function calcStatus(passed: number, total: number): 'pass' | 'partial' | 'fail' {
  if (total === 0) return 'fail';
  if (passed === total) return 'pass';
  if (passed / total >= 0.8) return 'partial';
  return 'partial';
}

export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const storeId = String(body.storeId || '').trim();
    const checkDate = String(body.checkDate || '').trim() || kstDateParts().dateStr;

    if (!storeId) {
      return NextResponse.json({ error: 'storeId required' }, { status: 400 });
    }

    const { totalMinutes, dateStr: todayStr } = kstDateParts();
    const isToday = checkDate === todayStr;
    const sectionIndices = isToday ? getAutoFillSectionIndices(totalMinutes) : [];
    const doFinal = isToday && shouldFinalSaveOnEntry(totalMinutes);

    const existingSnap = await adminDb.collection('hygiene_checklists')
      .where('storeId', '==', storeId)
      .where('checkDate', '==', checkDate)
      .limit(1)
      .get();

    const existingData = existingSnap.empty ? null : existingSnap.docs[0].data();
    const existingItems = (existingData?.items || {}) as HygieneItems;

    const inspectorName =
      String(body.inspectorName || '').trim()
      || existingData?.inspectorName
      || authUser.email
      || '';

    let items = existingItems;
    let applied = false;
    let saveType: 'draft' | 'final' = existingData?.saveType === 'final' ? 'final' : 'draft';

    if (sectionIndices.length > 0) {
      items = buildItemsWithSections(existingItems, sectionIndices);
      applied = true;
      if (doFinal) saveType = 'final';
    }

    const { totalItems, passedItems } = countItemsStats(items);
    const now = FieldValue.serverTimestamp();
    const savedSections = HYGIENE_SECTIONS.map((_, i) => i).filter(si =>
      sectionIndices.includes(si) || (existingData?.savedSections as number[] | undefined)?.includes(si),
    );

    const payload: Record<string, unknown> = {
      uid: authUser.uid,
      inspectorName,
      items,
      totalItems,
      passedItems,
      status: calcStatus(passedItems, totalItems),
      saveType,
      savedSections: [...new Set(savedSections)],
      lastEntryAt: now,
      lastEntryUid: authUser.uid,
      lastEntryName: inspectorName,
      lastSavedAt: now,
      updatedAt: now,
    };

    if (applied) {
      payload.scheduleAppliedAt = now;
      payload.scheduleAppliedSections = sectionIndices;
    }
    if (doFinal && applied) {
      payload.scheduleFinalAt = now;
    }

    let docId: string;
    if (!existingSnap.empty) {
      docId = existingSnap.docs[0].id;
      await existingSnap.docs[0].ref.set(payload, { merge: true });
    } else {
      const ref = await adminDb.collection('hygiene_checklists').add({
        storeId,
        checkDate,
        ...payload,
        createdAt: now,
      });
      docId = ref.id;
    }

    const record = { id: docId, storeId, checkDate, ...payload };

    return NextResponse.json({
      record,
      applied,
      saveType,
      autoFilledSections: sectionIndices,
      autoFilledLabels: sectionLabels(sectionIndices),
      finalSaved: doFinal && applied,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
