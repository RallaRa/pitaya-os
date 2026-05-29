import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { verifyToken } from '@/lib/authVerify';
import { dailyReportDocId } from '@/lib/reportCompare';
import { posDailySalesDocId } from '@/lib/posDailySales';

// GET /api/pos/sales-by-time?storeId=X&date=YYYY-MM-DD
export async function GET(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  const date    = searchParams.get('date')    || '';

  if (!storeId || !date) {
    return NextResponse.json({ error: 'storeId and date required' }, { status: 400 });
  }

  const dailySnap = await adminDb.collection('pos_daily_sales').doc(posDailySalesDocId(storeId, date)).get();
  if (dailySnap.exists) {
    const d = dailySnap.data()!;
    return NextResponse.json({
      timeSlots: d.timeSlots || [],
      posBreakdown: d.posBreakdown || {},
    });
  }

  const reportSnap = await adminDb.collection('daily_reports').doc(dailyReportDocId(storeId, date)).get();
  if (!reportSnap.exists) {
    return NextResponse.json({ timeSlots: [], posBreakdown: {} });
  }

  const d = reportSnap.data()!;
  return NextResponse.json({
    timeSlots: d.timeSlots || [],
    posBreakdown: d.posBreakdown || {},
  });
}
