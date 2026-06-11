import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import {
  handleAccountingApiError,
  requireAccountingAccess,
} from '@/lib/accounting/requireAccountingAccess';
import { listAccountingPeriods, setAccountingPeriodClosed } from '@/lib/accounting/periods.server';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get('storeId');
    const year = searchParams.get('year') || '';

    if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

    await requireAccountingAccess(req, 'accountingClosing', storeId);

    const periods = await listAccountingPeriods(storeId, year || undefined);
    return NextResponse.json({ periods });
  } catch (e) {
    return handleAccountingApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const storeId = String(body.storeId || '');
    const period = String(body.period || '');
    const closed = body.closed !== false;

    if (!storeId || !/^\d{4}-\d{2}$/.test(period)) {
      return NextResponse.json({ error: 'storeId, period(YYYY-MM) required' }, { status: 400 });
    }

    const { uid } = await requireAccountingAccess(req, 'accountingClosing', storeId);
    await setAccountingPeriodClosed({ storeId, period, closed, uid });

    return NextResponse.json({ success: true, period, closed });
  } catch (e) {
    return handleAccountingApiError(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const storeId = String(body.storeId || '');
    const period = String(body.period || '');

    if (!storeId || !period) {
      return NextResponse.json({ error: 'storeId, period required' }, { status: 400 });
    }

    const { uid } = await requireAccountingAccess(req, 'accountingClosing', storeId);
    await setAccountingPeriodClosed({ storeId, period, closed: false, uid });

    return NextResponse.json({ success: true, period, closed: false });
  } catch (e) {
    return handleAccountingApiError(e);
  }
}
