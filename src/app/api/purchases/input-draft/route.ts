import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyToken } from '@/lib/authVerify';
import { sanitizeGroupsForDraft } from '@/lib/purchaseInputDraftSanitize';

const COLLECTION = 'purchase_input_drafts';

function draftDocId(storeId: string, uid: string) {
  return `${storeId}_${uid}`;
}

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const storeId = new URL(req.url).searchParams.get('storeId') || '';
  if (!storeId) return NextResponse.json({ error: 'storeId 필수' }, { status: 400 });

  const snap = await adminDb.collection(COLLECTION).doc(draftDocId(storeId, authUser.uid)).get();
  if (!snap.exists) return NextResponse.json({ draft: null });

  const d = snap.data()!;
  return NextResponse.json({
    draft: {
      storeId: d.storeId,
      groups: d.groups || [],
      analysisHistoryId: d.analysisHistoryId || null,
      updatedAt: d.updatedAt?.toDate?.()?.toISOString?.() || d.updatedAt || null,
    },
  });
}

export async function PUT(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { storeId, groups, analysisHistoryId } = body;
    if (!storeId) return NextResponse.json({ error: 'storeId 필수' }, { status: 400 });

    const sanitized = sanitizeGroupsForDraft(Array.isArray(groups) ? groups : []);
    const ref = adminDb.collection(COLLECTION).doc(draftDocId(storeId, authUser.uid));

    if (!sanitized.length) {
      await ref.delete().catch(() => {});
      return NextResponse.json({ ok: true, cleared: true });
    }

    await ref.set({
      storeId,
      uid: authUser.uid,
      groups: sanitized,
      analysisHistoryId: analysisHistoryId || null,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return NextResponse.json({ ok: true, groupCount: sanitized.length });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const storeId = new URL(req.url).searchParams.get('storeId') || '';
  if (!storeId) return NextResponse.json({ error: 'storeId 필수' }, { status: 400 });

  await adminDb.collection(COLLECTION).doc(draftDocId(storeId, authUser.uid)).delete().catch(() => {});
  return NextResponse.json({ ok: true });
}
