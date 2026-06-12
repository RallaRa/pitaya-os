import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import {
  getDailyChecklist,
  saveDailyChecklistPhase,
} from '@/lib/dailyChecklist.server';
import type { ChecklistPhase } from '@/lib/dailyChecklist';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  const checkDate = searchParams.get('date') || '';

  if (!storeId || !checkDate) {
    return NextResponse.json({ error: 'storeId, date required' }, { status: 400 });
  }

  try {
    const record = await getDailyChecklist(storeId, checkDate);
    return NextResponse.json({ record });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const storeId = String(body.storeId || '');
    const checkDate = String(body.checkDate || body.date || '');
    const phase = body.phase as ChecklistPhase;
    const assigneeName = String(body.assigneeName || authUser.email || '');
    const notes = String(body.notes || '');
    const items = body.items || {};
    const finalize = !!body.finalize;

    if (!storeId || !checkDate || (phase !== 'open' && phase !== 'close')) {
      return NextResponse.json({ error: 'storeId, checkDate, phase(open|close) required' }, { status: 400 });
    }

    const result = await saveDailyChecklistPhase({
      storeId,
      checkDate,
      phase,
      assigneeName,
      notes,
      items,
      uid: authUser.uid,
      finalize,
    });

    if (finalize && !result.complete) {
      return NextResponse.json({
        error: '모든 항목을 체크해야 완료할 수 있습니다',
        uncheckedLabels: result.uncheckedLabels,
        checked: result.checked,
        total: result.total,
      }, { status: 400 });
    }

    return NextResponse.json({ success: true, ...result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
