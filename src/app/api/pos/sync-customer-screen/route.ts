import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { encrypt } from '@/lib/encryption';
import { mergePhoneSyncToDoc, normalizePhoneDigits } from '@/lib/phonePii';
import { rematchIdentitiesByPhoneMatchKey } from '@/lib/publicOrderIdentity';

function checkAuth(req: Request): boolean {
  const apiKey =
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    req.headers.get('x-api-key') ||
    '';
  return !!process.env.POS_BRIDGE_KEY && apiKey === process.env.POS_BRIDGE_KEY;
}

// POST /api/pos/sync-customer-screen
// POS 결제/판매 화면에서 스크rape한 cusCode + 평문 전화 1명 반영
export async function POST(req: Request) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!process.env.ENCRYPTION_KEY) {
    return NextResponse.json({ error: 'ENCRYPTION_KEY not configured' }, { status: 500 });
  }

  let body: {
    storeId?: string;
    cusCode?: string;
    phoneFull?: string;
    phone?: string;
    memberName?: string;
    source?: string;
    rematch?: boolean;
    syncedAt?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const storeId = body.storeId || process.env.POS_STORE_ID || '';
  const cusCode = String(body.cusCode || '').trim();
  const phoneFull = normalizePhoneDigits(body.phoneFull || body.phone || '');
  const memberName = String(body.memberName || '').trim();
  const syncedAt = body.syncedAt || new Date().toISOString();
  const rematch = body.rematch !== false;

  if (!storeId || !cusCode || !phoneFull) {
    return NextResponse.json(
      { error: 'storeId, cusCode, phoneFull required' },
      { status: 400 },
    );
  }

  const ref = adminDb.collection('pos_customers').doc(`${storeId}_${cusCode}`);
  const existingSnap = await ref.get();
  const existing = existingSnap.exists
    ? (existingSnap.data() as Record<string, unknown>)
    : undefined;

  const doc: Record<string, unknown> = {
    cusCode,
    storeId,
    syncedAt,
    phoneScreenSource: body.source || 'pos_screen',
    phoneScreenCapturedAt: syncedAt,
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (!existing?.nameEncrypted && memberName) {
    doc.nameEncrypted = encrypt(memberName);
  }
  if (!existing?.isActive) {
    doc.isActive = '1';
  }

  const phoneOutcome = mergePhoneSyncToDoc(
    doc,
    existing,
    syncedAt,
    undefined,
    phoneFull,
  );

  await ref.set(doc, { merge: true });

  let rematchResult = null;
  if (rematch) {
    rematchResult = await rematchIdentitiesByPhoneMatchKey(storeId, phoneFull);
  }

  return NextResponse.json({
    success: true,
    cusCode,
    phoneOutcome,
    rematch: rematchResult,
  });
}
