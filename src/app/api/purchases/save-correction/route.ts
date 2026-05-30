import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { verifyToken } from '@/lib/authVerify';
import { createHash } from 'crypto';

export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const {
      storeId,
      supplierName,
      originalResult,
      correctedResult,
      imageHash,
    } = body;

    if (!storeId || !supplierName) {
      return NextResponse.json({ error: 'storeId, supplierName 필수' }, { status: 400 });
    }
    if (!originalResult || !correctedResult) {
      return NextResponse.json({ error: 'originalResult, correctedResult 필수' }, { status: 400 });
    }

    const hash = imageHash || createHash('sha256')
      .update(JSON.stringify(originalResult))
      .digest('hex')
      .slice(0, 16);

    const docId = `${storeId}_${hash}_${Date.now()}`;
    await adminDb.collection('ocr_corrections').doc(docId).set({
      storeId,
      supplierName: String(supplierName).trim(),
      originalResult,
      correctedResult,
      imageHash: hash,
      uid: authUser.uid,
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true, id: docId });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[save-correction]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
