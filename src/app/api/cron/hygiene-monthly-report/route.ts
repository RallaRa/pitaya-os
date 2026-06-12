import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { isCronAuthorized, cronUnauthorizedResponse } from '@/lib/cronAuth';
import {
  archiveOldHygieneLogs,
  generateHygieneMonthlyReport,
  postHygieneMonthlyReportMessenger,
} from '@/lib/hygieneAutomation.server';

/** 매월 1일 — 위생 월간 보고 + 1년 초과 아카이브 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return cronUnauthorizedResponse();

  const url = new URL(req.url);
  const storeId = url.searchParams.get('storeId');
  const month = url.searchParams.get('month') || (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 7);
  })();

  try {
    if (storeId) {
      const report = await generateHygieneMonthlyReport(storeId, month);
      await postHygieneMonthlyReportMessenger(storeId, report);
      const archived = await archiveOldHygieneLogs(storeId);
      return NextResponse.json({ ok: true, storeId, month, archived, report });
    }

    const storesSnap = await adminDb.collection('stores').where('status', '==', 'active').limit(30).get();
    const results = [];
    for (const doc of storesSnap.docs) {
      const report = await generateHygieneMonthlyReport(doc.id, month);
      await postHygieneMonthlyReportMessenger(doc.id, report);
      const archived = await archiveOldHygieneLogs(doc.id);
      results.push({ storeId: doc.id, archived, completionRate: report.completionRate });
    }
    return NextResponse.json({ ok: true, month, results });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return GET(req);
}
