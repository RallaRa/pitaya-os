import { NextResponse } from 'next/server';
import { isCronAuthorized, cronUnauthorizedResponse } from '@/lib/cronAuth';
import { updateAllStoreCustomerGrades, updateStoreCustomerGrades } from '@/lib/customerGrade.server';
import { runCustomerJourneyAllStores, runCustomerJourneyForStore } from '@/lib/customerJourney.server';

const DEFAULT_STORE = 'STR-1779194754785';

/** 매일 자정 KST — 등급 산정 + 여정 큐 생성 */
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

    const journeyResults = storeId
      ? [await runCustomerJourneyForStore(storeId)]
      : await runCustomerJourneyAllStores();

    return NextResponse.json({
      ok: true,
      grade: gradeResults,
      journey: journeyResults,
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
    message: 'customer-automation cron — grade update + journey queue',
    defaultStore: DEFAULT_STORE,
  });
}
