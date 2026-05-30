import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { verifyToken } from '@/lib/authVerify';
import { getKSTTodayYMD, getKSTYesterdayYMD } from '@/lib/dateUtils';
import {
  getDisplayTotalSale,
  getDisplayNetSales,
  posDailySalesDocId,
  type SalesDocData,
} from '@/lib/posDailySales';
import { dailyReportDocId } from '@/lib/reportCompare';

async function loadSalesDoc(storeId: string, dateStr: string): Promise<SalesDocData | null> {
  const posSnap = await adminDb.collection('pos_daily_sales')
    .doc(posDailySalesDocId(storeId, dateStr))
    .get();
  if (posSnap.exists) return posSnap.data() as SalesDocData;

  const reportSnap = await adminDb.collection('daily_reports')
    .doc(dailyReportDocId(storeId, dateStr))
    .get();
  if (reportSnap.exists) return reportSnap.data() as SalesDocData;

  const qSnap = await adminDb.collection('daily_reports')
    .where('storeId', '==', storeId)
    .where('reportDate', '==', dateStr)
    .limit(5)
    .get();
  if (!qSnap.empty) {
    const docs = qSnap.docs
      .map(d => d.data() as SalesDocData & { source?: string; lastModifiedAt?: { toMillis?: () => number } })
      .sort((a, b) => (b.lastModifiedAt?.toMillis?.() ?? 0) - (a.lastModifiedAt?.toMillis?.() ?? 0));
    return docs.find(d => d.source === 'pos_bridge') || docs[0] || null;
  }

  return null;
}

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  const dateParam = searchParams.get('date') || '';
  const todayStr = dateParam || getKSTTodayYMD();
  const yesterdayStr = getKSTYesterdayYMD();

  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  try {
    const [todayDoc, yesterdayDoc] = await Promise.all([
      loadSalesDoc(storeId, todayStr),
      loadSalesDoc(storeId, yesterdayStr),
    ]);

    const totalSales = getDisplayTotalSale(todayDoc);
    const netSales = getDisplayNetSales(todayDoc);
    const yesterdayTotal = getDisplayTotalSale(yesterdayDoc);
    const yesterdayNet = getDisplayNetSales(yesterdayDoc);

    return NextResponse.json({
      todayStr,
      yesterdayStr,
      today: todayDoc,
      yesterday: yesterdayDoc,
      totalSales,
      netSales,
      yesterdayTotal,
      yesterdayNet,
      isClosed: todayDoc?.isClosed ?? false,
      syncedAt: (todayDoc as { syncedAt?: string } | null)?.syncedAt ?? null,
      noData: !todayDoc && !yesterdayDoc,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
