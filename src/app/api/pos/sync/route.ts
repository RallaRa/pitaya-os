import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { fetchWeather, getStoreCoords } from '@/lib/weather';
import { sendKakaoNotifyToStore } from '@/lib/kakao/sendNotify';
import { runSalesHourlyAlertsForStore } from '@/lib/salesHourlyAlertRunner';

// ── 타입 ──────────────────────────────────────────────────────────
interface CustomerSale {
  Cus_Code:   string;
  Sale_Date:  string;
  totalSale:  number;
  visitCount: number;
}

interface SyncBody {
  storeId?: string;
  date: string;
  headers?: SatHeader[] | null;
  details?: SadDetail[] | null;
  finish?: FinishTotal | null;
  customerSales?: CustomerSale[] | null;
  isClosed?: boolean;
  weather?: Record<string, unknown> | null;
  timeSlots?: Array<{ posNo?: string; Hour?: string; hour?: string; totalSale?: number; tranCount?: number }> | null;
  syncedAt: string;
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
  saleTime?: string;
  posNo?: string;
  saleNum?: string;
  [key: string]: any;
}

interface PosBreakdown {
  posNo: string;
  totalSale: number;
  netSale: number;
  cashSale?: number;
  cardSale?: number;
  returnCount?: number;
  returnSale?: number;
}

interface FinishTotal {
  totalSale?: number;
  netSale?: number;
  cashSale?: number;
  cardSale?: number;
  returnCount?: number;
  returnSale?: number;
  cusPoint?: number;
  perPos?: PosBreakdown[];
  [key: string]: any;
}

// ── 뉴스 fetch (정육/축산 키워드, 네이버 뉴스 API) ─────────────────
interface NaverNewsItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .trim();
}

async function fetchNaverNews(): Promise<NaverNewsItem | null> {
  const clientId     = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const keywords = ['정육', '축산', '한우', '돼지고기'];
  for (const kw of keywords) {
    try {
      const q = encodeURIComponent(`${kw} 뉴스`);
      const res = await fetch(
        `https://openapi.naver.com/v1/search/news.json?query=${q}&display=1&sort=date`,
        {
          headers: {
            'X-Naver-Client-Id':     clientId,
            'X-Naver-Client-Secret': clientSecret,
          },
          signal: AbortSignal.timeout(5000),
        },
      );
      if (!res.ok) continue;
      const json = await res.json();
      const item = json.items?.[0];
      if (!item?.title) continue;
      return {
        title:       stripHtml(item.title       || ''),
        link:        item.link || item.originallink || '',
        pubDate:     item.pubDate || '',
        description: stripHtml(item.description || ''),
      };
    } catch { continue; }
  }
  return null;
}

// ── POS 데이터 → daily_reports 변환 저장 ──────────────────────────
async function syncToDailyReports(params: {
  storeId: string;
  date: string;
  headerDoc: SatHeader;
  details: SadDetail[];
  finish: FinishTotal | null;
  timeSlots: Array<{ posNo?: string; hour?: string; totalSale?: number; tranCount?: number }>;
  syncedAt: string;
}) {
  const { storeId, date, headerDoc, details, finish, timeSlots, syncedAt } = params;
  const posBreakdown: PosBreakdown[] = finish?.perPos ?? [];

  // SaT 집계를 primary로 사용 (일마감 여부와 무관하게 실거래 반영)
  const satTotal    = headerDoc.totalSale ?? 0;
  const finishTotal = finish?.totalSale   ?? 0;
  const totalSales  = satTotal;

  // isClosed: 마감 테이블이 있더라도 마감 이후 추가 매출(satTotal > finishTotal+10원)이
  // 발생한 경우 미마감으로 자동 전환 → 최신 실시간 매출 반영
  const baseIsClosed        = !!(finish && finishTotal > 0);
  const hasPostCloseActivity = baseIsClosed && (satTotal > finishTotal + 1000);
  const isClosed            = baseIsClosed && !hasPostCloseActivity;

  // netSales: 진짜 마감 완료 시 Finish SUM(다중POS 합산), 그 외 SaT 실시간 집계
  const netSales = isClosed ? (finish!.netSale ?? 0) : satTotal;
  const cashSale    = finish?.cashSale    ?? headerDoc.cashSale  ?? 0;
  const cardSale    = finish?.cardSale    ?? headerDoc.cardSale  ?? 0;
  const returnSale  = finish?.returnSale  ?? 0;
  const returnCount = finish?.returnCount ?? 0;
  const transCount  = headerDoc.transCount ?? 0;
  const cusPoint    = finish?.cusPoint    ?? 0;

  // 품목별 items 변환
  const items = details.map(d => ({
    barcode:       d.barcode       ?? '',
    name:          d.goodsName     ?? '',
    time:          d.saleTime      ?? '',
    posNo:         d.posNo         ?? '',
    saleNum:       d.saleNum       ?? '',
    qty:           d.saleCount     ?? 0,
    amount:        d.totalPrice    ?? 0,
    sellPrice:     d.sellPrice     ?? 0,
    purPrice:      d.purPrice      ?? 0,
    profitPrice:   d.profitPrice   ?? 0,
    netSales:      d.totalPrice    ?? 0,
    categoryCode:  d.categoryCode  ?? '',
    categoryName:  d.categoryName  ?? '',
    returnAmount:  0,
    discountAmount: 0,
  }));

  // 날씨 fetch
  let weather = null;
  try {
    const storeDoc = await adminDb.collection('stores').doc(storeId).get();
    const regionSido = storeDoc.exists ? (storeDoc.data() as any)?.regionSido : undefined;
    weather = await fetchWeather(date, getStoreCoords(regionSido));
  } catch { /* 날씨 실패해도 저장 계속 */ }

  // 뉴스 fetch (최근 30일 데이터만, 과거 대량 마이그레이션 시 API 절약)
  let news: NaverNewsItem | null = null;
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  if (date >= cutoff) {
    news = await fetchNaverNews();
  }

  // daily_reports upsert (ID: pos_{storeId}_{date})
  const docId = `pos_${storeId}_${date}`;
  const docRef = adminDb.collection('daily_reports').doc(docId);
  const snap = await docRef.get();

  const payload = {
    storeId,
    reportDate:    date,
    serialNumber:  `pos_${storeId}_${date}`,
    receiptNumber: '',
    totalSales,
    netSales,
    cashSale,
    cardSale,
    returnAmount:   returnSale,
    returnCount,
    discountAmount: 0,
    customerCount:  transCount,
    cusPoint,
    items,
    isClosed,
    posBreakdown: posBreakdown.length > 0 ? posBreakdown : [],
    timeSlots,
    weather:    weather ?? null,
    news:       news    ?? null,
    issues:     [],
    promotions: [],
    source:    'pos_bridge',
    syncedAt,
    lastModifiedAt: FieldValue.serverTimestamp(),
    editHistory: snap.exists ? undefined : [],
  };

  if (!snap.exists) {
    await docRef.set({ ...payload, createdAt: FieldValue.serverTimestamp() });
  } else {
    const { editHistory: _eh, ...updatePayload } = payload;
    await docRef.update(updatePayload);
  }

  // pos_daily_sales — 대시보드 실시간 구독용
  const dailySalesId = `${storeId}_${date}`;
  const headersArr = [{
    totalSale:  headerDoc.totalSale  ?? 0,
    cardSale:   headerDoc.cardSale   ?? 0,
    cashSale:   headerDoc.cashSale   ?? 0,
    profitPri:  headerDoc.profitPri  ?? 0,
    transCount: headerDoc.transCount ?? 0,
  }];
  const finishPayload = finish ? {
    totalSale:   finish.totalSale   ?? 0,
    netSale:     finish.netSale     ?? 0,
    cashSale:    finish.cashSale    ?? 0,
    cardSale:    finish.cardSale    ?? 0,
    returnCount: finish.returnCount ?? 0,
    returnSale:  finish.returnSale  ?? 0,
    cusPoint:    finish.cusPoint    ?? 0,
    perPos:      finish.perPos      ?? [],
  } : null;

  await adminDb.collection('pos_daily_sales').doc(dailySalesId).set({
    storeId,
    date,
    isClosed,
    headers: headersArr,
    finish: finishPayload,
    totalSales,
    netSales,
    cashSale,
    cardSale,
    returnAmount: returnSale,
    returnCount,
    customerCount: transCount,
    posBreakdown: posBreakdown.length > 0 ? posBreakdown : [],
    timeSlots,
    syncedAt,
    source: 'pos_bridge',
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

// ── POST /api/pos/sync ────────────────────────────────────────────
export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization');
  const apiKey = authHeader?.replace('Bearer ', '') || req.headers.get('x-api-key');
  if (apiKey !== process.env.POS_BRIDGE_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: SyncBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const storeId      = body.storeId || process.env.POS_STORE_ID || '';
  const { date, syncedAt } = body;
  const headers      = Array.isArray(body.headers)       ? body.headers       : [];
  const details      = Array.isArray(body.details)       ? body.details       : [];
  const finish       = body.finish ?? null;
  const customerSales = Array.isArray(body.customerSales) ? body.customerSales : [];
  const timeSlotsRaw = Array.isArray(body.timeSlots) ? body.timeSlots : [];
  const timeSlots = timeSlotsRaw.map(r => ({
    posNo:     String(r.posNo ?? ''),
    hour:      String(r.hour ?? r.Hour ?? ''),
    totalSale: Number(r.totalSale ?? 0),
    tranCount: Number(r.tranCount ?? 0),
  }));

  if (!storeId || !date || !syncedAt) {
    return NextResponse.json(
      { error: 'storeId(or POS_STORE_ID env), date, syncedAt are required' },
      { status: 400 },
    );
  }

  const hasSalesPayload =
    headers.length > 0
    || details.length > 0
    || !!(finish && ((finish.totalSale ?? 0) > 0 || (finish.netSale ?? 0) > 0));

  if (!hasSalesPayload) {
    const existingDaily = await adminDb.collection('pos_daily_sales').doc(`${storeId}_${date}`).get();
    const prevTotal = Number(existingDaily.data()?.totalSales ?? 0);
    if (existingDaily.exists && prevTotal > 0) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'empty_payload_preserves_existing',
        message: `${date} 기존 매출 ${prevTotal.toLocaleString()}원 유지 — 빈 동기화는 무시했습니다.`,
      });
    }
  }

  const batch = adminDb.batch();

  // 1. 매출 헤더 (SaT)
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

  batch.set(
    adminDb.collection('pos_sales_header').doc(`${storeId}_${date}`),
    {
      storeId, date,
      totalSale:  headerDoc.totalSale  ?? 0,
      cardSale:   headerDoc.cardSale   ?? 0,
      cashSale:   headerDoc.cashSale   ?? 0,
      profitPri:  headerDoc.profitPri  ?? 0,
      transCount: headerDoc.transCount ?? 0,
      syncedAt,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  // 2. 매출 상세 (SaD)
  let savedDetails = 0;
  for (const d of details) {
    const barcode = d.barcode || `NO_BARCODE_${savedDetails}`;
    batch.set(
      adminDb.collection('pos_sales_detail').doc(`${storeId}_${date}_${barcode}`),
      {
        storeId, date,
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
      },
      { merge: true },
    );
    savedDetails++;
  }

  // 3. 일마감 합계 (Finish_Total)
  let hasFinish = false;
  if (finish) {
    batch.set(
      adminDb.collection('pos_finish_total').doc(`${storeId}_${date}`),
      {
        storeId, date,
        totalSale:    finish.totalSale   ?? 0,
        netSale:      finish.netSale     ?? 0,
        cashSale:     finish.cashSale    ?? 0,
        cardSale:     finish.cardSale    ?? 0,
        returnCount:  finish.returnCount ?? 0,
        returnSale:   finish.returnSale  ?? 0,
        cusPoint:     finish.cusPoint    ?? 0,
        posBreakdown: finish.perPos      ?? [],
        syncedAt,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    hasFinish = true;
  }

  // 4. 고객 구매이력 (당일 방문 고객)
  for (const cs of customerSales) {
    const code = String(cs.Cus_Code || '').trim();
    if (!code) continue;
    batch.set(
      adminDb.collection('pos_customer_sales').doc(`${storeId}_${code}_${date}`),
      {
        cusCode:    code,
        storeId,
        date,
        totalSale:  Number(cs.totalSale  || 0),
        visitCount: Number(cs.visitCount || 0),
        syncedAt,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  // 5. 동기화 로그
  batch.set(adminDb.collection('pos_sync_log').doc(), {
    storeId, date,
    headerCount:    headers.length,
    detailCount:    details.length,
    hasFinish,
    customerCount:  customerSales.length,
    syncedAt,
    status: 'success',
    createdAt: FieldValue.serverTimestamp(),
  });

  await batch.commit();

  await adminDb.collection('stores').doc(storeId).set(
    { posBridgeEnabled: true, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );

  // 5. daily_reports 동시 저장 (실패해도 응답은 성공)
  let dailyReportSaved = false;
  let syncedTotalSales = 0;
  try {
    await syncToDailyReports({ storeId, date, headerDoc, details, finish, timeSlots, syncedAt });
    dailyReportSaved = true;
    syncedTotalSales = headerDoc.totalSale ?? finish?.totalSale ?? 0;
  } catch (err) {
    console.error('[pos/sync] daily_reports 저장 실패:', err);
  }

  if (dailyReportSaved) {
    sendKakaoNotifyToStore(storeId, {
      title: '🥩 POS 매출 동기화',
      message: `${date} 매출 ${Number(syncedTotalSales).toLocaleString()}원`,
      link: `${process.env.NEXT_PUBLIC_APP_URL || 'https://pitaya-osv1.vercel.app'}/dashboard/report/view`,
    }).catch(() => {});

    runSalesHourlyAlertsForStore(storeId).catch(err => {
      console.error('[pos/sync] sales hourly alert failed:', err);
    });
  }

  return NextResponse.json({
    success: true,
    saved: {
      headers: headers.length,
      details: savedDetails,
      finish: hasFinish,
      dailyReport: dailyReportSaved,
    },
  });
}
