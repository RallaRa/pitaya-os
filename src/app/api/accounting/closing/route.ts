import { NextResponse } from 'next/server';
import {
  getBalanceSheet,
  getIncomeStatement,
  getTrialBalance,
} from '@/lib/accounting/ledger.server';
import {
  handleAccountingApiError,
  requireAccountingAccess,
} from '@/lib/accounting/requireAccountingAccess';

function monthStartYMD() {
  const d = new Date(Date.now() + 9 * 3600_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function todayYMD() {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get('storeId');
    const type = searchParams.get('type') || 'trial-balance';
    const startDate = searchParams.get('startDate') || monthStartYMD();
    const endDate = searchParams.get('endDate') || todayYMD();
    const asOf = searchParams.get('asOf') || endDate;

    if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

    await requireAccountingAccess(req, 'accountingClosing', storeId);

    if (type === 'trial-balance') {
      const data = await getTrialBalance(storeId, endDate);
      return NextResponse.json({ ...data, endDate });
    }
    if (type === 'balance-sheet') {
      const data = await getBalanceSheet(storeId, asOf);
      return NextResponse.json(data);
    }
    if (type === 'income-statement') {
      const data = await getIncomeStatement(storeId, startDate, endDate);
      return NextResponse.json(data);
    }

    return NextResponse.json({ error: 'Unknown type' }, { status: 400 });
  } catch (e) {
    return handleAccountingApiError(e);
  }
}
