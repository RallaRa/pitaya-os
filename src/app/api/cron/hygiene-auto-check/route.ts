import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { HYGIENE_SECTIONS } from '@/lib/hygieneChecklist';

// 섹션 키 → HYGIENE_SECTIONS category 매핑
const SECTION_CATEGORY: Record<string, string> = {
  작업전:   '위생상태(작업전)',
  중간점검: '위생상태(작업중)',
  마감점검: '위생상태(작업후)',
};

function kstNow() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return {
    hour:    kst.getUTCHours(),
    minute:  kst.getUTCMinutes(),
    dateStr: kst.toISOString().slice(0, 10),
  };
}

async function sendNotificationsToStore(
  storeId: string,
  message: string,
  link: string,
) {
  const membersSnap = await adminDb
    .collection('user_store_map')
    .where('storeId', '==', storeId)
    .get();
  if (membersSnap.empty) return;

  const batch = adminDb.batch();
  membersSnap.docs.forEach(m => {
    const ref = adminDb.collection('notifications').doc();
    batch.set(ref, {
      targetUid:  m.data().uid,
      senderUid:  '',
      senderName: 'Pitaya OS',
      type:       'hygiene_auto',
      title:      '✅ 위생점검 자동완성',
      message,
      link,
      isRead:     false,
      createdAt:  FieldValue.serverTimestamp(),
    });
  });
  await batch.commit();
}

async function autoCheckSection(storeId: string, dateStr: string, sectionKey: string) {
  const category = SECTION_CATEGORY[sectionKey];
  if (!category) return;

  const section = HYGIENE_SECTIONS.find(s => s.category === category);
  if (!section) return;

  const ts = FieldValue.serverTimestamp();

  // 섹션 항목별 업데이트 필드 구성
  const updates: Record<string, unknown> = {
    [`sections.${sectionKey}.completed`]:    true,
    [`sections.${sectionKey}.completedBy`]:  '자동완성',
    [`sections.${sectionKey}.completedAt`]:  ts,
    [`autoChecks.${sectionKey}`]: { auto: true, at: ts },
    updatedAt: ts,
  };

  section.items.forEach((_, idx) => {
    updates[`sections.${sectionKey}.items.${idx}.checked`]    = true;
    updates[`sections.${sectionKey}.items.${idx}.checkedBy`]  = '자동완성';
    updates[`sections.${sectionKey}.items.${idx}.checkedAt`]  = ts;
  });

  // 기존 문서 조회 (query 기반 — auto-ID or deterministic)
  const existing = await adminDb
    .collection('hygiene_checklists')
    .where('storeId', '==', storeId)
    .where('checkDate', '==', dateStr)
    .limit(1)
    .get();

  if (!existing.empty) {
    await existing.docs[0].ref.update(updates as Record<string, unknown>);
  } else {
    // 문서 없으면 새로 생성
    await adminDb
      .collection('hygiene_checklists')
      .doc(`${storeId}_${dateStr}`)
      .set({
        storeId,
        checkDate: dateStr,
        saveType:  'auto',
        createdAt: ts,
        ...updates,
      }, { merge: true });
  }
}

// UTC 5,11,23 → KST 14,20,08 에 실행됨
export async function POST(req: Request) {
  const secret = req.headers.get('x-cron-secret');
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { hour, dateStr } = kstNow();

  // KST 14시 → 중간점검(작업중) 자동 완성
  const isMidday  = hour === 14;
  // KST 20시 → 마감점검(작업후) 자동 완성
  const isEvening = hour === 20;

  if (!isMidday && !isEvening) {
    return NextResponse.json({ ok: true, skipped: true, reason: `kstHour=${hour} (not 14 or 20)` });
  }

  const sectionKey  = isMidday ? '중간점검' : '마감점검';
  const sectionName = isMidday ? '위생상태(작업중)' : '위생상태(작업후)';
  const storesSnap  = await adminDb.collection('stores').get();
  let processed = 0;

  for (const storeDoc of storesSnap.docs) {
    const storeId = storeDoc.id;
    try {
      // 이미 완료된 섹션이면 건너뜀
      const checkSnap = await adminDb
        .collection('hygiene_checklists')
        .where('storeId', '==', storeId)
        .where('checkDate', '==', dateStr)
        .limit(1)
        .get();

      const existing = checkSnap.empty ? null : checkSnap.docs[0].data();
      if (existing?.sections?.[sectionKey]?.completed === true) continue;

      await autoCheckSection(storeId, dateStr, sectionKey);
      await sendNotificationsToStore(
        storeId,
        `✅ ${sectionName} 자동완성되었습니다`,
        '/dashboard/hygiene',
      );
      processed++;
    } catch {}
  }

  return NextResponse.json({ ok: true, dateStr, kstHour: hour, sectionKey, processed });
}
