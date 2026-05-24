import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';

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
  try {
    const { message, history } = await req.json();
    if (!message?.trim()) return NextResponse.json({ error: '메시지를 입력해주세요' }, { status: 400 });

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'GROQ_API_KEY 미설정' }, { status: 500 });

    const groq = new Groq({ apiKey });

    const messages: Groq.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...((history || []) as Groq.Chat.ChatCompletionMessageParam[]).slice(-6),
      { role: 'user', content: message },
    ];

    const completion = await groq.chat.completions.create({
      model: 'llama3-70b-8192',
      messages,
      temperature: 0.1,
      max_tokens: 1024,
    });

    const raw = completion.choices[0]?.message?.content?.trim() || '{}';
    let parsed: any;
    try {
      const cleaned = raw.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = {
        action: 'chat',
        items: [],
        filter: null,
        message: raw,
      };
    }

    return NextResponse.json(parsed);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
