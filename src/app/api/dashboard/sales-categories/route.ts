import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { adminDb } from '@/lib/firebase/admin';
import { getKSTTodayYMD } from '@/lib/dateUtils';
import {
  aggregateSalesCategories,
  SALES_CATEGORY_COLORS,
  SALES_CATEGORY_LABELS,
  SALES_CATEGORY_ORDER,
  type SalesCategoryKey,
} from '@/lib/pos/salesCategory';
import { getStoreSalesCategoryKeywords } from '@/lib/pos/salesCategoryAggregate.server';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId');
  const date = searchParams.get('date') || getKSTTodayYMD();

  if (!storeId) return NextResponse.json({ error: 'storeId 필요' }, { status: 400 });

  try {
    const docId = `${storeId}_${date}`.replace(/[/\\#?]/g, '_').slice(0, 500);
    const cached = await adminDb.collection('sales_categories').doc(docId).get();

    if (cached.exists && cached.data()?.categories) {
      const data = cached.data()!;
      const chart = SALES_CATEGORY_ORDER.map(key => ({
        key,
        label: SALES_CATEGORY_LABELS[key],
        color: SALES_CATEGORY_COLORS[key],
        amount: data.categories[key]?.amount ?? 0,
        pct: data.categories[key]?.pct ?? 0,
      })).filter(row => row.amount > 0);

      return NextResponse.json({
        storeId,
        date,
        totalAmount: data.totalAmount ?? 0,
        categories: data.categories,
        chart,
        source: 'cache',
      });
    }

    const reportSnap = await adminDb.collection('daily_reports').doc(`pos_${storeId}_${date}`).get();
    if (!reportSnap.exists) {
      return NextResponse.json({
        storeId,
        date,
        totalAmount: 0,
        categories: null,
        chart: [],
        emptyReason: 'POS 동기화 데이터가 없습니다.',
      });
    }

    const items = (reportSnap.data()?.items || []) as Array<{
      name?: string;
      amount?: number;
      netSales?: number;
      qty?: number;
    }>;
    const customKeywords = await getStoreSalesCategoryKeywords(storeId);
    const agg = aggregateSalesCategories(
      items.map(it => ({ name: it.name, netSales: it.netSales ?? it.amount, qty: it.qty })),
      customKeywords,
    );

    const chart = SALES_CATEGORY_ORDER.map(key => ({
      key,
      label: SALES_CATEGORY_LABELS[key],
      color: SALES_CATEGORY_COLORS[key],
      amount: agg.categories[key].amount,
      pct: agg.categories[key].pct,
    })).filter(row => row.amount > 0);

    return NextResponse.json({
      storeId,
      date,
      totalAmount: agg.totalAmount,
      categories: agg.categories,
      chart,
      source: 'computed',
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'sales-categories failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
