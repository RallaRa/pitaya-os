import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { verifyToken } from '@/lib/authVerify';
import { generateTextWithFallback, hasAnyAiProvider, stripJsonMarkdown } from '@/lib/aiProviderFallback';
import { getKSTTodayYMD } from '@/lib/dateUtils';
import {
  baselineToAdviceResult,
  CUSTOMER_ADVICE_SEGMENT_LABELS,
  isCustomerAdviceSegment,
  parseSegmentAdviceJson,
  type CustomerAdviceSegment,
  type SegmentAdviceAiResult,
} from '@/lib/marketing/customerSegmentAdvice';
import {
  buildSegmentAdvicePrompt,
  buildSegmentMarketingContext,
} from '@/lib/marketing/customerSegmentAdvice.server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function cacheDocId(storeId: string, segment: CustomerAdviceSegment, today: string) {
  return `segment_advice_${storeId}_${segment}_${today}`;
}

async function readCache(
  storeId: string,
  segment: CustomerAdviceSegment,
  today: string,
): Promise<SegmentAdviceAiResult | null> {
  try {
    const snap = await adminDb.collection('dashboard_cache').doc(cacheDocId(storeId, segment, today)).get();
    if (!snap.exists) return null;
    const d = snap.data();
    return (d?.result as SegmentAdviceAiResult) || null;
  } catch {
    return null;
  }
}

async function writeCache(
  storeId: string,
  segment: CustomerAdviceSegment,
  today: string,
  result: SegmentAdviceAiResult,
) {
  try {
    await adminDb.collection('dashboard_cache').doc(cacheDocId(storeId, segment, today)).set({
      result,
      segment,
      storeId,
      cachedAt: new Date(),
    });
  } catch { /* ignore */ }
}

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  const segmentParam = searchParams.get('segment') || '';
  const refresh = searchParams.get('refresh') === '1';

  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  if (!isCustomerAdviceSegment(segmentParam)) {
    return NextResponse.json({ error: 'invalid segment' }, { status: 400 });
  }

  const segment = segmentParam;
  const today = getKSTTodayYMD();
  const generatedAt = new Date().toISOString();

  if (!refresh) {
    const cached = await readCache(storeId, segment, today);
    if (cached) {
      return NextResponse.json({
        ...cached,
        segment,
        segmentLabel: CUSTOMER_ADVICE_SEGMENT_LABELS[segment],
        cached: true,
      });
    }
  }

  try {
    const ctx = await buildSegmentMarketingContext(storeId, segment);

    if (ctx.count === 0) {
      const empty: SegmentAdviceAiResult = {
        summary: `${CUSTOMER_ADVICE_SEGMENT_LABELS[segment]} 대상 고객이 현재 없습니다.`,
        couponStrategy: '해당 세그먼트 고객 발생 시 자동 알림·쿠폰 큐를 확인하세요.',
        messageTone: '—',
        actions: ['고객 동기화 후 재확인', '방문 데이터가 쌓이면 세그먼트가 자동 갱신됩니다.'],
        sampleMessage: '',
        timing: '—',
        cautions: [],
        generatedAt,
      };
      return NextResponse.json({
        ...empty,
        segment,
        segmentLabel: CUSTOMER_ADVICE_SEGMENT_LABELS[segment],
        context: ctx,
        cached: false,
        empty: true,
      });
    }

    let advice: SegmentAdviceAiResult;

    if (!hasAnyAiProvider()) {
      advice = baselineToAdviceResult(segment, generatedAt);
    } else {
      const dataBlock = buildSegmentAdvicePrompt(ctx);
      const prompt = `당신은 정육점 CRM·마케팅 전문가입니다.
아래 고객 세그먼트 데이터를 분석해 마케팅 전략을 JSON으로만 응답하세요.

${dataBlock}

응답 형식 (순수 JSON만):
{
  "summary": "한 줄 핵심 전략",
  "couponStrategy": "쿠폰·혜택 제안",
  "messageTone": "문자 톤 가이드",
  "actions": ["실행 조치 1", "실행 조치 2", "실행 조치 3"],
  "sampleMessage": "발송용 샘플 문자 1개",
  "timing": "발송 타이밍",
  "cautions": ["주의사항 1", "주의사항 2"]
}`;

      const ai = await generateTextWithFallback({
        prompt,
        system: 'Pitaya OS 고객 마케팅 어드바이저. 데이터 기반으로만 답하고 과장하지 마세요.',
        json: true,
        useCase: 'insight',
      });

      const parsed = parseSegmentAdviceJson(stripJsonMarkdown(ai.text));
      advice = parsed
        ? { ...parsed, provider: ai.provider, generatedAt }
        : { ...baselineToAdviceResult(segment, generatedAt), provider: ai.provider };
    }

    await writeCache(storeId, segment, today, advice);

    return NextResponse.json({
      ...advice,
      segment,
      segmentLabel: CUSTOMER_ADVICE_SEGMENT_LABELS[segment],
      context: ctx,
      cached: false,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[marketing/segment-advice]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
