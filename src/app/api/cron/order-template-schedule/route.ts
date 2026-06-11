import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { cronUnauthorizedResponse, isCronAuthorized } from '@/lib/cronAuth';

/** KST 기준 스케줄된 발주 템플릿 실행 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return cronUnauthorizedResponse();

  const kst = new Date(Date.now() + 9 * 3600_000);
  const dow = kst.getUTCDay();
  const hour = kst.getUTCHours();

  const snap = await adminDb.collection('order_templates').where('active', '==', true).get();
  let executed = 0;

  for (const doc of snap.docs) {
    const tpl = doc.data();
    const schedule = tpl.schedule;
    if (!schedule || schedule.dow !== dow || schedule.hour !== hour) continue;

    const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    try {
      await fetch(`${base}/api/order-templates/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-cron-secret': process.env.CRON_SECRET || '' },
        body: JSON.stringify({ templateId: doc.id, storeId: tpl.storeId, cron: true }),
      });
      executed++;
    } catch { /* skip */ }
  }

  return NextResponse.json({ ok: true, executed });
}
