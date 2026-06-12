import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { isHrStoreAdmin } from '@/lib/hr/storeAdmin';
import {
  getProfitShareRun,
  previewProfitShare,
  runProfitSharePayroll,
} from '@/lib/hr-system/profitSharePayroll.server';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  const period = searchParams.get('period') || new Date().toISOString().slice(0, 7);
  const preview = searchParams.get('preview') === '1';

  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  try {
    if (preview) {
      const result = await previewProfitShare(storeId, period);
      return NextResponse.json({ preview: result });
    }
    const saved = await getProfitShareRun(storeId, period);
    if (saved) return NextResponse.json({ run: saved });
    const result = await previewProfitShare(storeId, period);
    return NextResponse.json({ preview: result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { storeId?: string; period?: string; skipMessenger?: boolean };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { storeId, period = new Date().toISOString().slice(0, 7), skipMessenger } = body;
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  const allowed = await isHrStoreAdmin(authUser.uid, storeId, authUser.email);
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const out = await runProfitSharePayroll(storeId, period, authUser.uid, { skipMessenger });
    return NextResponse.json({
      success: true,
      result: out.result,
      slipUpdates: out.slipUpdates,
      payrollCreated: out.payrollCreated,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
