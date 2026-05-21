import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

const SYSTEM_INSTRUCTIONS: Record<string, string> = {
  default: '당신은 Pitaya OS의 AI 경영 비서입니다. 소상공인 매장(정육점·식품점 등) 운영을 전문적으로 돕습니다. 매출 분석, 재고 관리, 가격 전략, 직원 관리, 경영 상담, 시장 트렌드 등을 안내합니다. 친절하고 실용적인 답변을 제공하며 필요 시 마크다운을 활용합니다.',
  analyst: '당신은 Pitaya OS의 AI 데이터 분석가입니다. 매출, 재고 등 수치와 팩트 기반으로 명확하게 요약 답변합니다.',
};

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: '서버에 API 키가 설정되지 않았습니다.' }, { status: 500 });
    }

    const { message, persona, history } = await req.json();
    if (!message?.trim()) {
      return NextResponse.json({ error: '메시지 없음' }, { status: 400 });
    }

    const systemInstruction = SYSTEM_INSTRUCTIONS[persona] || SYSTEM_INSTRUCTIONS.default;
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    // history: [{role: 'user'|'model', content: string}] — Gemini 형식으로 변환
    const geminiHistory = (history || []).map((msg: { role: string; content: string }) => ({
      role: msg.role as 'user' | 'model',
      parts: [{ text: msg.content }],
    }));

    const chat = model.startChat({
      history: geminiHistory,
      systemInstruction: { role: 'system', parts: [{ text: systemInstruction }] },
      generationConfig: { temperature: 0.2 },
    });

    const result = await chat.sendMessage(message);
    const text = result.response.text();
    return NextResponse.json({ text });
  } catch (error: any) {
    console.error('AI API Error:', error);
    return NextResponse.json(
      { text: '⚠️ AI 응답 중 오류가 발생했습니다. 다시 시도해주세요.' },
      { status: 200 }
    );
  }
}
