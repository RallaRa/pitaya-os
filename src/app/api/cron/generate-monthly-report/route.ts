import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { cronUnauthorizedResponse, isCronAuthorized } from '@/lib/cronAuth';
import { buildMonthlyReport } from '@/lib/monthlyReport';
import { ensureSalesAlertChannel, postMessengerText } from '@/lib/messenger/channels.server';

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return cronUnauthorizedResponse();

  const kst = new Date(Date.now() + 9 * 3600_000);
  const prev = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth() - 1, 1));
  const year = prev.getUTCFullYear();
  const month = prev.getUTCMonth() + 1;

  const storesSnap = await adminDb.collection('stores').where('status', '==', 'active').limit(30).get();
  const results = [];

  for (const doc of storesSnap.docs) {
    const storeId = doc.id;
    const report = await buildMonthlyReport(storeId, year, month);
    const docId = `${storeId}_${report.month}`;
    await adminDb.collection('monthly_reports').doc(docId).set({
      ...report,
      generatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    try {
      const roomId = await ensureSalesAlertChannel(storeId);
      await postMessengerText({
        roomId,
        text: `📋 ${report.month} 월간 리포트\n순매출 ${report.netSales.toLocaleString()}원 · 객수 ${report.customerCount.toLocaleString()}명 · 객단가 ${report.avgTicket.toLocaleString()}원\n/dashboard/report/monthly?month=${report.month}`,
      });
    } catch { /* ignore */ }

    results.push({ storeId, month: report.month });
  }

  return NextResponse.json({ ok: true, results });
}
