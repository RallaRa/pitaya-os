import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';

const SYSTEM_PROMPT = `너는 정육점 매입관리 AI 도우미야.
사용자 입력을 분석해서 반드시 아래 JSON만 반환해. 다른 텍스트 없이 순수 JSON만.

처리 가능한 액션:
- 거래처 정보 조회/수정
- 발주 설정 수정 (발주요일, 수령요일, 리드타임 등)
- 매입 등록 도움
- 수령 완료 처리
- 일반 대화

반환 JSON 형식:
{
  "action": "query_supplier" | "update_supplier" | "add_order" | "complete_delivery" | "chat",
  "targetSupplier": "거래처명 또는 null",
  "updateFields": { "필드명": "값" },
  "changeMemo": "변경 사유",
  "confirmRequired": true | false,
  "confirmMessage": "확인이 필요한 경우 사용자에게 보여줄 메시지",
  "message": "사용자에게 보여줄 한국어 응답"
}

규칙:
- 정보 변경 시 confirmRequired: true
- 단순 조회/일반대화 시 confirmRequired: false
- message는 항상 친절한 한국어`;

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
      model: 'llama-3.3-70b-versatile',
      messages, temperature: 0.1, max_tokens: 1024,
    });

    const raw = completion.choices[0]?.message?.content?.trim() || '{}';
    let parsed: any;
    try {
      parsed = JSON.parse(raw.replace(/```json|```/g,'').trim());
    } catch {
      parsed = { action:'chat', targetSupplier:null, updateFields:{}, confirmRequired:false, message: raw };
    }
    return NextResponse.json(parsed);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
