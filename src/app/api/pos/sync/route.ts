import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

// ── 인증 ──────────────────────────────────────────────────────────
function authenticate(req: Request): boolean {
  const auth = req.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const expected = process.env.POS_BRIDGE_KEY;
  if (!expected) return false;
  return token === expected;
}

// ── 타입 ──────────────────────────────────────────────────────────
interface SyncBody {
  storeId?: string;         // 미전송 시 POS_STORE_ID 환경변수 폴백
  date: string;             // "YYYY-MM-DD"
  headers?: SatHeader[] | null;
  details?: SadDetail[] | null;
  finish?: FinishTotal | null;
  syncedAt: string;         // ISO 날짜문자열
}

interface SatHeader {
  totalSale?: number;
  cardSale?: number;
  cashSale?: number;
  profitPri?: number;
  transCount?: number;
  [key: string]: any;
}

interface SadDetail {
  barcode?: string;
  goodsName?: string;
  categoryCode?: string;
  categoryName?: string;
  saleCount?: number;
  sellPrice?: number;
  totalPrice?: number;
  purPrice?: number;
  profitPrice?: number;
  [key: string]: any;
}

interface FinishTotal {
  totalSale?: number;
  netSale?: number;
  cashSale?: number;
  cardSale?: number;
  returnCount?: number;
  returnSale?: number;
  cusPoint?: number;
  [key: string]: any;
}

// ── POST /api/pos/sync ────────────────────────────────────────────
export async function POST(req: Request) {
  if (!authenticate(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: SyncBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const storeId   = body.storeId || process.env.POS_STORE_ID || '';
  const { date, syncedAt } = body;
  const headers  = Array.isArray(body.headers)  ? body.headers  : [];
  const details  = Array.isArray(body.details)  ? body.details  : [];
  const finish   = body.finish ?? null;

  if (!storeId || !date || !syncedAt) {
    return NextResponse.json(
      { error: 'storeId(or POS_STORE_ID env), date, syncedAt are required' },
      { status: 400 },
    );
  }

  const batch = adminDb.batch();

  // 1. 매출 헤더 (SaT) — 하루 1건으로 합산
  const headerDoc = headers.reduce<SatHeader>(
    (acc, h) => ({
      totalSale:   (acc.totalSale  || 0) + (h.totalSale  || 0),
      cardSale:    (acc.cardSale   || 0) + (h.cardSale   || 0),
      cashSale:    (acc.cashSale   || 0) + (h.cashSale   || 0),
      profitPri:   (acc.profitPri  || 0) + (h.profitPri  || 0),
      transCount:  (acc.transCount || 0) + (h.transCount || 0),
    }),
    {},
  );

  const headerRef = adminDb
    .collection('pos_sales_header')
    .doc(`${storeId}_${date}`);

  batch.set(headerRef, {
    storeId,
    date,
    totalSale:  headerDoc.totalSale  ?? 0,
    cardSale:   headerDoc.cardSale   ?? 0,
    cashSale:   headerDoc.cashSale   ?? 0,
    profitPri:  headerDoc.profitPri  ?? 0,
    transCount: headerDoc.transCount ?? 0,
    syncedAt,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  // 2. 매출 상세 (SaD) — 바코드별 upsert
  let savedDetails = 0;
  for (const d of details) {
    const barcode = d.barcode || `NO_BARCODE_${savedDetails}`;
    const detailRef = adminDb
      .collection('pos_sales_detail')
      .doc(`${storeId}_${date}_${barcode}`);

    batch.set(detailRef, {
      storeId,
      date,
      barcode:      d.barcode       ?? '',
      goodsName:    d.goodsName     ?? '',
      categoryCode: d.categoryCode  ?? '',
      categoryName: d.categoryName  ?? '',
      saleCount:    d.saleCount     ?? 0,
      sellPrice:    d.sellPrice     ?? 0,
      totalPrice:   d.totalPrice    ?? 0,
      purPrice:     d.purPrice      ?? 0,
      profitPrice:  d.profitPrice   ?? 0,
      syncedAt,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    savedDetails++;
  }

  // 3. 일마감 합계 (Finish_Total)
  let hasFinish = false;
  if (finish) {
    const finishRef = adminDb
      .collection('pos_finish_total')
      .doc(`${storeId}_${date}`);

    batch.set(finishRef, {
      storeId,
      date,
      totalSale:   finish.totalSale   ?? 0,
      netSale:     finish.netSale     ?? 0,
      cashSale:    finish.cashSale    ?? 0,
      cardSale:    finish.cardSale    ?? 0,
      returnCount: finish.returnCount ?? 0,
      returnSale:  finish.returnSale  ?? 0,
      cusPoint:    finish.cusPoint    ?? 0,
      syncedAt,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    hasFinish = true;
  }

  // 4. 동기화 로그
  const logRef = adminDb.collection('pos_sync_log').doc();
  batch.set(logRef, {
    storeId,
    date,
    headerCount:  headers.length,
    detailCount:  details.length,
    hasFinish,
    syncedAt,
    status: 'success',
    createdAt: FieldValue.serverTimestamp(),
  });

  await batch.commit();

  return NextResponse.json({
    success: true,
    saved: {
      headers: headers.length,
      details: savedDetails,
      finish: hasFinish,
    },
  });
}
