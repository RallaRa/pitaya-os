import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import {
  generateTextWithFallback,
  hasAnyAiProvider,
  stripJsonMarkdown,
} from '@/lib/aiProviderFallback';
import { aiMetaJson } from '@/lib/aiProviderMeta';

const SYSTEM_PROMPT = `너는 정육점 저울 코드 관리 도우미야.
사용자 입력을 분석해서 반드시 아래 JSON만 반환해.
다른 텍스트 없이 순수 JSON만 반환.

입력 패턴:
- '100 한우모듬' → 코드:100, 품목:한우모듬 추가
- '100 한우모듬, 200 한돈삼겹' → 2개 동시 추가
- '9 한우곱창, 10 한우국거리, 21 한우등심불고기' → 다중 추가
- '100 삭제' → 코드 100 삭제
- '100 한우특모듬으로 수정' → 품목명 수정
- '한우 전체 보여줘' → 한우 필터 쿼리
- '전체 삭제' → 전체 초기화
- '목록 보여줘', '전체 보기' 등 → query action

반환 JSON 형식:
{
  "action": "add" | "delete" | "update" | "query" | "clear" | "chat",
  "items": [{ "code": 숫자, "name": "문자열" }],
  "filter": "필터키워드 또는 null",
  "message": "사용자에게 보여줄 한국어 응답"
}

규칙:
- action이 'add'일 때: items 배열에 추가할 항목들
- action이 'delete'일 때: items 배열에 삭제할 코드(name은 빈 문자열)
- action이 'update'일 때: items 배열에 { code, name } (수정할 코드와 새 품목명)
- action이 'query'일 때: filter에 검색 키워드
- action이 'clear'일 때: items 빈 배열
- action이 'chat'일 때: 일반 대화 응답 (items 빈 배열)
- message는 항상 친절한 한국어로`;

export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { message, history } = await req.json();
    if (!message?.trim()) return NextResponse.json({ error: '메시지를 입력해주세요' }, { status: 400 });

    if (!hasAnyAiProvider()) {
      return NextResponse.json({ error: 'AI API 키 미설정' }, { status: 503 });
    }

    const historyLines = ((history || []) as { role: string; content: string }[])
      .slice(-6)
      .map(m => `${m.role}: ${m.content}`)
      .join('\n');
    const prompt = historyLines ? `${historyLines}\nuser: ${message}` : message;

    const aiResult = await generateTextWithFallback({
      system: SYSTEM_PROMPT,
      prompt,
      json: true,
      temperature: 0.1,
      useCase: 'fast',
    });

    const raw = stripJsonMarkdown(aiResult.text) || '{}';
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { action: 'chat', items: [], filter: null, message: raw };
    }

    return NextResponse.json({ ...parsed, ...aiMetaJson(aiResult) });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
