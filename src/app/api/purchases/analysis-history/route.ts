import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyToken } from '@/lib/authVerify';
import type { FileAnalysisMeta } from '@/lib/purchaseAiLabels';

const COLLECTION = 'purchase_analysis_history';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  const limit = Math.min(Number(searchParams.get('limit') || 40), 100);

  if (!storeId) return NextResponse.json({ error: 'storeId 필수' }, { status: 400 });

  try {
    let snap;
    try {
      snap = await adminDb.collection(COLLECTION)
        .where('storeId', '==', storeId)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();
    } catch (indexErr) {
      console.warn('[analysis-history] index fallback:', indexErr);
      snap = await adminDb.collection(COLLECTION)
        .where('storeId', '==', storeId)
        .limit(limit)
        .get();
    }

    const entries = snap.docs.map(doc => {
      const d = doc.data();
      return {
        id: doc.id,
        storeId: d.storeId,
        uid: d.uid,
        userMessage: d.userMessage || '',
        fileNames: d.fileNames || [],
        fileResults: d.fileResults || [],
        invoiceCount: d.invoiceCount || 0,
        suppliers: d.suppliers || [],
        success: !!d.success,
        errors: d.errors || [],
        createdAt: d.createdAt?.toDate?.()?.toISOString?.() || d.createdAt || null,
        invoices: d.invoices || [],
      };
    }).sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    });

    return NextResponse.json({ entries });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[analysis-history GET]', msg);
    return NextResponse.json({ error: msg, entries: [] }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const {
      storeId,
      userMessage,
      fileNames,
      fileResults,
      invoiceCount,
      suppliers,
      success,
      errors,
      invoices,
    } = body;

    if (!storeId) return NextResponse.json({ error: 'storeId 필수' }, { status: 400 });

    const docRef = await adminDb.collection(COLLECTION).add({
      storeId,
      uid: authUser.uid,
      userMessage: String(userMessage || '').slice(0, 500),
      fileNames: Array.isArray(fileNames) ? fileNames.slice(0, 20) : [],
      fileResults: (Array.isArray(fileResults) ? fileResults : []).slice(0, 20) as FileAnalysisMeta[],
      invoiceCount: Number(invoiceCount || 0),
      suppliers: Array.isArray(suppliers) ? suppliers.slice(0, 10) : [],
      success: !!success,
      errors: Array.isArray(errors) ? errors.slice(0, 5) : [],
      invoices: Array.isArray(invoices) ? invoices.slice(0, 15) : [],
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true, id: docRef.id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id') || '';
  if (!id) return NextResponse.json({ error: 'id 필수' }, { status: 400 });

  const ref = adminDb.collection(COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const data = snap.data();
  if (data?.uid !== authUser.uid) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await ref.delete();
  return NextResponse.json({ ok: true });
}
