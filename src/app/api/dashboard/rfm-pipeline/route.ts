import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { getStoreGradeStats } from '@/lib/customerGrade.server';
import { PITAYA_GRADE_LABELS, type PitayaGrade } from '@/lib/customerGrade';

export async function GET(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const storeId = new URL(req.url).searchParams.get('storeId') || '';
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  try {
    const stats = await getStoreGradeStats(storeId);
    const grades = (Object.keys(PITAYA_GRADE_LABELS) as PitayaGrade[]).map(grade => ({
      grade,
      label: PITAYA_GRADE_LABELS[grade],
      count: stats.byGrade[grade] || 0,
      sharePct: stats.total > 0
        ? Math.round(((stats.byGrade[grade] || 0) / stats.total) * 1000) / 10
        : 0,
    }));

    return NextResponse.json({
      total: stats.total,
      grades,
      generatedAt: stats.generatedAt,
      emptyReason: stats.total === 0 ? '등록 고객 데이터가 없습니다.' : null,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[dashboard/rfm-pipeline]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
