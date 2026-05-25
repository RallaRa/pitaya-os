import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate()+n); return r; }
function toYMD(d: Date) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }

export async function POST(req: Request) {
  const secret = req.headers.get('x-cron-secret');
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const storesSnap = await adminDb.collection('stores').get();
    let created = 0;

    for (const storeDoc of storesSnap.docs) {
      const storeId = storeDoc.id;
      const suppliersSnap = await adminDb.collection('suppliers').doc(storeId)
        .collection('list').where('status', '==', 'active').get();

      for (const supDoc of suppliersSnap.docs) {
        const sup = supDoc.data();
        const orderDays: number[] = sup.orderDays || [];
        const deliveryDays: number[] = sup.deliveryDays || [];
        const leadTime: number = sup.leadTime || 1;

        const today = new Date();
        // 8주치 캘린더 생성
        for (let i = 0; i < 56; i++) {
          const d = addDays(today, i);
          const dow = d.getDay();
          const dateStr = toYMD(d);

          if (orderDays.includes(dow)) {
            // 발주 마감 이벤트
            await adminDb.collection('hr_calendar_events').add({
              storeId, title: `📦 ${sup.supplierName} 발주마감`,
              date: dateStr, allDay: true,
              color: '#f97316', eventType: 'order_deadline',
              supplierId: supDoc.id, supplierName: sup.supplierName,
              createdAt: FieldValue.serverTimestamp(), source: 'cron',
            });
            created++;

            // 입고 예정 이벤트 (리드타임 후)
            const deliveryDate = toYMD(addDays(d, leadTime));
            await adminDb.collection('hr_calendar_events').add({
              storeId, title: `🚚 ${sup.supplierName} 입고예정`,
              date: deliveryDate, allDay: true,
              color: '#22c55e', eventType: 'delivery_expected',
              supplierId: supDoc.id, supplierName: sup.supplierName,
              createdAt: FieldValue.serverTimestamp(), source: 'cron',
            });
            created++;
          }
        }
      }
    }

    return NextResponse.json({ ok: true, created });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
