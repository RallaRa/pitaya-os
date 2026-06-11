import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { isHrStoreAdmin } from '@/lib/hr/storeAdmin';
import {
  cancelPayrollRun,
  confirmPayrollRun,
  getPayrollRun,
  listPayrollRuns,
  listPayrollSlips,
  runPayrollCalculation,
} from '@/lib/hr-system/payrollService';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  const period = searchParams.get('period') || '';

  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  if (period) {
    const run = await getPayrollRun(storeId, period);
    const slips = run ? await listPayrollSlips(storeId, period) : [];
    return NextResponse.json({ run, slips });
  }

  const runs = await listPayrollRuns(storeId);
  return NextResponse.json({ runs });
}

export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { storeId?: string; period?: string; action?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { storeId, period, action } = body;
  if (!storeId || !period) {
    return NextResponse.json({ error: 'storeId, period required' }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}$/.test(period)) {
    return NextResponse.json({ error: 'period는 YYYY-MM 형식' }, { status: 400 });
  }

  const allowed = await isHrStoreAdmin(authUser.uid, storeId, authUser.email);
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    if (action === 'confirm') {
      await confirmPayrollRun(storeId, period, authUser.uid);
      const run = await getPayrollRun(storeId, period);
      return NextResponse.json({ run, message: '급여 마감이 확정되었습니다.' });
    }
    if (action === 'cancel') {
      await cancelPayrollRun(storeId, period);
      const run = await getPayrollRun(storeId, period);
      return NextResponse.json({ run, message: '급여 마감이 취소되었습니다.' });
    }

    const result = await runPayrollCalculation(storeId, period, authUser.uid);
    return NextResponse.json({
      ...result,
      message: `${period} 급여 ${result.slipCount}명 계산 완료`,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '처리 실패';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
