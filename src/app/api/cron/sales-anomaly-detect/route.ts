import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { cronUnauthorizedResponse, isCronAuthorized } from '@/lib/cronAuth';
import { runSalesAnomalyForStore } from '@/lib/salesAnomalyDetect';
import { ensureSalesAlertChannel, postMessengerText } from '@/lib/messenger/channels.server';

function kstYesterdayYMD() {
  const d = new Date(Date.now() + 9 * 3600_000 - 86400000);
  return d.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return cronUnauthorizedResponse();

  const url = new URL(req.url);
  const date = url.searchParams.get('date') || kstYesterdayYMD();

  const storesSnap = await adminDb.collection('stores').where('status', '==', 'active').limit(30).get();
  const storeIds = storesSnap.empty ? [] : storesSnap.docs.map(d => d.id);

  const results = [];
  for (const storeId of storeIds) {
    const r = await runSalesAnomalyForStore(storeId, date);
    if ('saved' in r && r.saved && 'aiSummary' in r && r.aiSummary) {
      try {
        const roomId = await ensureSalesAlertChannel(storeId);
        await postMessengerText({ roomId, text: `📊 매출 이상 탐지\n${r.aiSummary}` });
      } catch { /* ignore */ }
    }
    results.push(r);
  }

  return NextResponse.json({ ok: true, date, results });
}
