import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { verifyToken } from '@/lib/authVerify';
import { appendStoreBusinessContext } from '@/lib/storeBusinessContext';

const PAGE_HINTS: Record<string, string> = {
  register: 'OCR 인식 품목 단가 적정성 확인. 이력번호 누락 지적. 알리아스 매칭 판단 도움.',
  ledger: '이상 거래 탐지. 거래처 편중 분석. 월별 매입 트렌드 해석.',
  'by-supplier': '거래처별 단가 적정성 분석. 외상잔액 위험 판단. 거래처 변경 권고 여부.',
  prices: '시세 대비 과다 매입 품목 찾기. 마진율 낮아진 품목 경고. 발주 타이밍 권고.',
  'trace-ledger': '법정 필수항목 누락 탐지. 이력번호 유효성 확인. 법정 요건 충족 여부.',
  'trace-numbers': '이력번호 이상 패턴 탐지. 미확인 이력 확인. 통계 요약.',
};

function buildSystemPrompt(context: any): string {
  const pageHint = PAGE_HINTS[context.currentPage] || '';
  const dataSnippet = JSON.stringify(context.currentData || {}).slice(0, 2000);

  return appendStoreBusinessContext(`너는 정육점 매입 전문 AI 어드바이저야.
현재 사용자가 보고 있는 화면 데이터를 바탕으로 실용적이고 구체적인 조언을 해줘.
추측은 [추정], 확실한 근거가 있으면 [데이터 기반], 위험/문제는 [주의]로 표시해.
200자 이내로 간결하게 답변해. 한국어로만 답변.

현재 화면: ${context.currentPage}
${pageHint}

현재 화면 데이터:
${dataSnippet}`);
}

export async function POST(req: NextRequest) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { context, message, history } = await req.json();

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'GROQ_API_KEY 미설정' }, { status: 500 });

    const groq = new Groq({ apiKey });

    const messages: Groq.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: buildSystemPrompt(context) },
      ...((history || []) as Groq.Chat.ChatCompletionMessageParam[]).slice(-6),
      { role: 'user', content: message },
    ];

    const stream = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages,
      max_tokens: 512,
      temperature: 0.3,
      stream: true,
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const data = JSON.stringify(chunk);
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
