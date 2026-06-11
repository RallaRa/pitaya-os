import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { adminDb } from '@/lib/firebase/admin';
import { getKSTTodayYMD } from '@/lib/dateUtils';
import { calcTimeSlotAovFromHourly, calcTimeSlotAovFromItems } from '@/lib/pos/timeSlotAov';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId');
  const date = searchParams.get('date') || getKSTTodayYMD();
  if (!storeId) return NextResponse.json({ error: 'storeId 필요' }, { status: 400 });

  const docId = `${storeId}_${date}`.replace(/[/\\#?]/g, '_').slice(0, 500);
  const cached = await adminDb.collection('pos_time_slot_aov').doc(docId).get();
  if (cached.exists && cached.data()?.slots) {
    return NextResponse.json({
      storeId,
      date,
      slots: cached.data()?.slots,
      insight: cached.data()?.insight ?? null,
      source: 'cache',
    });
  }

  const reportSnap = await adminDb.collection('daily_reports').doc(`pos_${storeId}_${date}`).get();
  if (!reportSnap.exists) {
    return NextResponse.json({ storeId, date, slots: [], insight: null, emptyReason: 'POS 데이터 없음' });
  }

  const data = reportSnap.data() || {};
  const timeSlots = (data.timeSlots || []) as Array<{ hour?: string; totalSale?: number; tranCount?: number }>;
  const result = timeSlots.length > 0
    ? calcTimeSlotAovFromHourly(timeSlots)
    : calcTimeSlotAovFromItems((data.items || []) as Array<{ time?: string; amount?: number; netSales?: number }>);

  return NextResponse.json({ storeId, date, ...result, source: timeSlots.length > 0 ? 'timeSlots' : 'items' });
}
