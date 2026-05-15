// src/app/api/ai/route.ts
import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    // 1. 함수 내부에서 환경 변수를 호출하여 파일 최상단 크래시(HTML 에러) 원천 차단
    // 이름이 GEMINI든 GOOGLE이든 둘 중 하나만 있으면 무조건 잡도록 이중망 구축
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: '서버에 API 키가 설정되지 않았습니다. (.env.local 확인 필요)' }, 
        { status: 500 }
      );
    }

    const body = await req.json();
    const { message, persona } = body;

    if (!message || message.trim() === '') {
      return NextResponse.json({ error: '텍스트가 입력되지 않았습니다.' }, { status: 400 });
    }

    // 2. 동적 페르소나 주입
    let systemInstruction = '너는 Pitaya OS의 AI 비즈니스 분석가다. 팩트 기반으로 건조하고 명확하게 답변해라.';
    if (persona === 'assistant') {
      systemInstruction = '너는 Pitaya OS의 수석 프론트엔드/백엔드 개발자다. 코드를 요청받으면 정확하고 효율적인 조각 코드(Diff) 위주로 답변해라.';
    } else if (persona === 'analyst') {
      systemInstruction = '너는 Pitaya OS의 AI 비즈니스 데이터 분석가다. 매출, 재고 등 수치와 팩트 기반으로 건조하고 명확하게 요약 답변해라.';
    }

    // 3. 최신 엔진(2.5-flash)으로 구동
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: systemInstruction,
    });

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: message }] }],
      generationConfig: {
        temperature: 0.1, 
      },
    });

    const text = result.response.text();
    return NextResponse.json({ text });

  } catch (error: any) {
    console.error('AI API Error:', error);
    // 4. 에러가 나더라도 HTML이 아닌 무조건 JSON 규격으로 반환
    return NextResponse.json({ error: error.message || '서버 내부 통신 실패' }, { status: 500 });
  }
}/*

// [History: AI 대화모드 전용 단발성(Stateless) API 통신 라우트 신규 생성]
// [Update: AI 페르소나 분기 처리 기능 추가]
// [Update: 백엔드 API 에러 핸들링 로직 개선]
// [Update: 키 참조를 GOOGLE_API_KEY로 원복]
// [Update: 이미지 입력 처리를 위한 로직 추가 및 보고서용 페르소나 분리]
// [Fix: 404 오류 해결을 위해 gemini-2.5-flash 모델로 원복]
import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const apiKey = process.env.GOOGLE_API_KEY;

// API 키가 없는 경우 시작 시 에러 발생
if (!apiKey) {
  throw new Error('GOOGLE_API_KEY is not set in the environment variables.');
}

const genAI = new GoogleGenerativeAI(apiKey);

const personaInstructions = {
  assistant: "너는 pitaya os의 ai 이며, 현재는 초기버전 일반 제미나이와 동일하게 작동하나 개발을 서포트하는 지원자역할의 롤을 우선한다",
  analyst: "너는 Pitaya OS의 AI 데이터 분석가다. 사용자 질문에 대해 오직 데이터베이스 팩트 기반으로 3줄 요약만 해라. 모르면 모른다고 해라. 아첨이나 불필요한 서술은 금지한다.",
  reporter: "너는 사용자가 하루 동안의 업무를 정리하고 마감 보고서를 작성하는 것을 돕는 전문 비서 AI다. 사용자의 입력(텍스트, 이미지)을 분석하여 체계적이고 명확한 보고서 초안을 생성해라. 특히, 이미지에 포함된 시각적 데이터를 정확히 해석하고, 텍스트와 결합하여 종합적인 상황을 요약해야 한다. 보고서는 다음 항목을 포함해야 한다: 1. 주요 업무 요약, 2. 성과 및 특이사항, 3. 첨부 이미지에 대한 상세 설명, 4. 내일의 계획. 항상 전문적이고 간결한 톤을 유지해라."
};

// Base64 데이터 URL에서 MIME 타입과 데이터 추출하는 헬퍼 함수
function dataUrlToGoogleGenerativeAIPart(dataUrl: string): Part {
    const match = dataUrl.match(/^data:(.+);base64,(.+)$/);
    if (!match) {
        throw new Error('Invalid data URL format');
    }
    const [_, mimeType, base64] = match;
    return {
        inlineData: {
            mimeType,
            data: base64,
        },
    };
}

export async function POST(req: Request) {
  try {
    // 프론트엔드에서 보내는 데이터 구조에 맞게 `text`와 `image`를 받음
    const { text, image, persona = 'assistant' } = await req.json();

    if (!text && !image) {
        return NextResponse.json({ error: '텍스트 또는 이미지를 제공해야 합니다.' }, { status: 400 });
    }

    const systemInstruction = personaInstructions[persona as keyof typeof personaInstructions] || personaInstructions.assistant;
    
    // 멀티모달 입력을 지원하는 gemini-2.5-flash 모델 사용
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash', // 404 오류 해결을 위해 모델명 수정
      systemInstruction: systemInstruction,
    });

    const contentParts: Part[] = [];
    if (text) {
        contentParts.push({ text });
    }
    if (image) {
        try {
            const imagePart = dataUrlToGoogleGenerativeAIPart(image);
            contentParts.push(imagePart);
        } catch(e) {
            console.error("Error processing image data:", e);
            return NextResponse.json({ error: '첨부된 이미지 데이터 형식이 올바르지 않습니다.' }, { status: 400 });
        }
    }

    const result = await model.generateContent({
        contents: [{ role: 'user', parts: contentParts }],
        generationConfig: {
            temperature: 0.2, // 보고서 생성이므로 약간 더 예측 가능하게 조정
        }
    });

    const responseText = result.response.text();

    return NextResponse.json({ text: responseText });
  } catch (error) {
    console.error('Gemini API 통신 에러:', error);
    const errorMessage = error instanceof Error ? error.message : '알 수 없는 에러가 발생했습니다.';
    return NextResponse.json({ error: `AI 응답 생성 실패: ${errorMessage}` }, { status: 500 });
  }
}
*/