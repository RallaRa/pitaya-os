import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { isCronAuthorized, cronUnauthorizedResponse } from '@/lib/cronAuth';
import { getKSTTodayYMD } from '@/lib/dateUtils';
import { runHygieneFollowupAlerts } from '@/lib/hygieneAutomation.server';

/** 15분마다 — 위생 점검 마감+30분 미완료 시 메신저 알림 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return cronUnauthorizedResponse();

  const storeId = new URL(req.url).searchParams.get('storeId');
  const dateYmd = getKSTTodayYMD();

  try {
    if (storeId) {
      const sent = await runHygieneFollowupAlerts(storeId, dateYmd);
      return NextResponse.json({ ok: true, storeId, sent });
    }

    const storesSnap = await adminDb.collection('stores').where('status', '==', 'active').limit(30).get();
    const results = [];
    for (const doc of storesSnap.docs) {
      results.push({
        storeId: doc.id,
        sent: await runHygieneFollowupAlerts(doc.id, dateYmd),
      });
    }
    return NextResponse.json({ ok: true, dateYmd, results });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return GET(req);
}
