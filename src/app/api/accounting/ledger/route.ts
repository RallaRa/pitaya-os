import { NextResponse } from 'next/server';
import {
  getAccountBalances,
  getAccountLedger,
  getGeneralLedger,
  getPartnerLedger,
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
    const type = searchParams.get('type') || 'general';
    const startDate = searchParams.get('startDate') || monthStartYMD();
    const endDate = searchParams.get('endDate') || todayYMD();
    const accountCode = searchParams.get('accountCode') || '';
    const partner = searchParams.get('partner') || '';
    const asOf = searchParams.get('asOf') || endDate;

    if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

    await requireAccountingAccess(req, 'accountingLedger', storeId);

    if (type === 'general') {
      const rows = await getGeneralLedger(storeId, startDate, endDate);
      return NextResponse.json({ rows, startDate, endDate });
    }
    if (type === 'by-account') {
      if (!accountCode) return NextResponse.json({ error: 'accountCode required' }, { status: 400 });
      const data = await getAccountLedger(storeId, accountCode, startDate, endDate);
      return NextResponse.json({ ...data, startDate, endDate, accountCode });
    }
    if (type === 'by-partner') {
      const rows = await getPartnerLedger(storeId, partner, startDate, endDate);
      return NextResponse.json({ rows, startDate, endDate, partner });
    }
    if (type === 'balance') {
      const rows = await getAccountBalances(storeId, asOf);
      return NextResponse.json({ rows, asOf });
    }

    return NextResponse.json({ error: 'Unknown type' }, { status: 400 });
  } catch (e) {
    return handleAccountingApiError(e);
  }
}
