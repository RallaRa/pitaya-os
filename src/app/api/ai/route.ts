// [History: AI 대화모드 전용 단발성(Stateless) API 통신 라우트 신규 생성]
// [Update: AI 페르소나 분기 처리 기능 추가]
// [Update: 백엔드 API 에러 핸들링 로직 개선]
import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const apiKey = process.env.GOOGLE_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey || '');

const personaInstructions = {
  assistant: "너는 pitaya os의 ai 이며, 현재는 초기버전 일반 제미나이와 동일하게 작동하나 개발을 서포트하는 지원자역할의 롤을 우선한다",
  analyst: "너는 Pitaya OS의 AI 데이터 분석가다. 사용자 질문에 대해 오직 데이터베이스 팩트 기반으로 3줄 요약만 해라. 모르면 모른다고 해라. 아첨이나 불필요한 서술은 금지한다.",
};

export async function POST(req: Request) {
  // API 키 유무를 먼저 확인
  if (!apiKey) {
    console.error('GOOGLE_API_KEY is not set in the environment variables.');
    return NextResponse.json({ error: '서버에 API 키가 설정되지 않았습니다.' }, { status: 500 });
  }

  try {
    const { message, persona = 'assistant' } = await req.json();

    const systemInstruction = personaInstructions[persona as keyof typeof personaInstructions] || personaInstructions.assistant;

    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction: systemInstruction,
    });

    const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: message }] }],
        generationConfig: {
            temperature: 0.1,
        }
    });

    const responseText = result.response.text();

    return NextResponse.json({ text: responseText });
  } catch (error) {
    // 발생한 실제 에러 메시지를 클라이언트로 전달
    console.error('Gemini API 통신 에러:', error);
    const errorMessage = error instanceof Error ? error.message : '알 수 없는 에러가 발생했습니다.';
    return NextResponse.json({ error: `AI 응답 생성 실패: ${errorMessage}` }, { status: 500 });
  }
}
