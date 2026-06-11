import { NextResponse } from 'next/server';
import { isCronAuthorized, cronUnauthorizedResponse } from '@/lib/cronAuth';
import { updateAllStoreCustomerGrades, updateStoreCustomerGrades } from '@/lib/customerGrade.server';
import { updateAllStoreChurnScores, updateStoreChurnScores } from '@/lib/customerChurnScore.server';
import { runCustomerJourneyAllStores, runCustomerJourneyForStore } from '@/lib/customerJourney.server';
import { runRepurchaseCycleAllStores, runRepurchaseCycleForStore } from '@/lib/pos/repurchaseCycle.server';

const DEFAULT_STORE = 'STR-1779194754785';

/** 매일 자정 KST — 등급 산정 + 이탈 스코어 + 여정 큐 생성 */
export async function POST(req: Request) {
  if (!isCronAuthorized(req)) return cronUnauthorizedResponse();

  let storeId: string | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.storeId) storeId = String(body.storeId);
  } catch { /* optional body */ }

  try {
    const gradeResults = storeId
      ? [await updateStoreCustomerGrades(storeId)]
      : await updateAllStoreCustomerGrades();

    const churnResults = storeId
      ? [await updateStoreChurnScores(storeId)]
      : await updateAllStoreChurnScores();

    const journeyResults = storeId
      ? [await runCustomerJourneyForStore(storeId)]
      : await runCustomerJourneyAllStores();

    const repurchaseResults = storeId
      ? [await runRepurchaseCycleForStore(storeId)]
      : await runRepurchaseCycleAllStores();

    return NextResponse.json({
      ok: true,
      grade: gradeResults,
      churn: churnResults,
      journey: journeyResults,
      repurchase: repurchaseResults,
      processedAt: new Date().toISOString(),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: 'customer-automation cron — grade + churn score + journey + repurchase queue',
    defaultStore: DEFAULT_STORE,
  });
}
