import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { verifyToken } from '@/lib/authVerify';
import { getKSTTodayYMD } from '@/lib/dateUtils';
import {
  createDefaultTargetsDoc,
  normalizeTargetPeriods,
  resolveActivePeriod,
  resolvePreviousPeriod,
  type StoreSalesTargetsDoc,
  type TargetPeriod,
} from '@/lib/salesTargets';

async function loadDoc(storeId: string): Promise<StoreSalesTargetsDoc> {
  const snap = await adminDb.collection('store_sales_targets').doc(storeId).get();
  if (!snap.exists) return createDefaultTargetsDoc(storeId);
  const data = snap.data() as StoreSalesTargetsDoc;
  return {
    storeId,
    periods: data.periods?.length ? data.periods : createDefaultTargetsDoc(storeId).periods,
    updatedAt: data.updatedAt as string | undefined,
  };
}

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  const doc = await loadDoc(storeId);
  const todayYm = getKSTTodayYMD().slice(0, 7);
  const periods = normalizeTargetPeriods(doc.periods);
  const activePeriod = resolveActivePeriod(periods, todayYm);
  const previousPeriod = resolvePreviousPeriod(periods, todayYm);

  return NextResponse.json({
    ...doc,
    periods,
    todayYm,
    activePeriod,
    previousPeriod,
  });
}

export async function PUT(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const storeId = String(body.storeId || '');
    if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

    const rawPeriods = (body.periods || []) as TargetPeriod[];
    const periods = normalizeTargetPeriods(
      rawPeriods.length ? rawPeriods : createDefaultTargetsDoc(storeId).periods,
    );

    const doc: StoreSalesTargetsDoc = {
      storeId,
      periods: periods.map(p => ({
        id: p.id || `p_${p.startYm}`,
        startYm: p.startYm,
        endYm: p.endYm,
        months: Object.fromEntries(
          Object.entries(p.months || {}).map(([ym, v]) => [
            ym,
            {
              sales: Math.max(0, Math.round(Number((v as { sales?: number }).sales) || 0)),
              customers: Math.max(0, Math.round(Number((v as { customers?: number }).customers) || 0)),
            },
          ]),
        ),
      })),
      updatedAt: new Date().toISOString(),
    };

    await adminDb.collection('store_sales_targets').doc(storeId).set({
      ...doc,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const todayYm = getKSTTodayYMD().slice(0, 7);
    return NextResponse.json({
      ok: true,
      periods: doc.periods,
      activePeriod: resolveActivePeriod(doc.periods, todayYm),
      previousPeriod: resolvePreviousPeriod(doc.periods, todayYm),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
