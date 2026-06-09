import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { loadAnalysisPack } from '@/lib/aiAnalysis';

export const dynamic = 'force-dynamic';

/** 분석 모드 데이터 팩 미리보기 (LLM 없이 구조화 요약) */
export async function GET(req: Request) {
  try {
    await verifyToken(req);
    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get('storeId');
    const message = searchParams.get('message') || '매장 운영 종합 분석';

    if (!storeId) {
      return NextResponse.json({ error: 'storeId 필요' }, { status: 400 });
    }

    const pack = await loadAnalysisPack(storeId, message);

    return NextResponse.json({
      pack: pack.pack,
      packLabel: pack.packLabel,
      focusHint: pack.focusHint,
      asOf: pack.data.asOf,
      summary: pack.summary,
      headline: pack.data.headline,
      memberFlow: {
        lostBuyersCount: pack.data.memberFlow.lostBuyersCount,
        lostTopItems: pack.data.memberFlow.lostTopItems.slice(0, 5),
        visitorWoW: pack.data.memberFlow.visitorWoW,
      },
      itemDeclines: pack.data.itemDeclines.slice(0, 5),
      itemGains: pack.data.itemGains.slice(0, 5),
    });
  } catch (err: any) {
    console.error('[analysis-pack]', err);
    return NextResponse.json({ error: err.message || '분석 팩 로드 실패' }, { status: 500 });
  }
}
