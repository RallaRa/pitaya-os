import { NextResponse } from 'next/server';
import { getFundBalances } from '@/lib/accounting/ledger.server';
import { getPaymentSchedule } from '@/lib/accounting/periods.server';
import {
  handleAccountingApiError,
  requireAccountingAccess,
} from '@/lib/accounting/requireAccountingAccess';

function todayYMD() {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get('storeId');
    const type = searchParams.get('type') || 'balances';
    const asOf = searchParams.get('asOf') || todayYMD();
    const daysAhead = Number(searchParams.get('daysAhead') || 60);

    if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

    await requireAccountingAccess(req, 'accountingFund', storeId);

    if (type === 'balances') {
      const rows = await getFundBalances(storeId, asOf);
      return NextResponse.json({ rows, asOf });
    }
    if (type === 'payment-schedule') {
      const rows = await getPaymentSchedule(storeId, daysAhead);
      return NextResponse.json({ rows, daysAhead });
    }

    return NextResponse.json({ error: 'Unknown type' }, { status: 400 });
  } catch (e) {
    return handleAccountingApiError(e);
  }
}
