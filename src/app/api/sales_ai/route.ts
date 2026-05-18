import { NextResponse } from 'next/server';
import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import { db } from '@/lib/firebase/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

// Gemini API 초기화
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // --- [신규 추가] DB 저장 요청인 경우 백엔드에서 안전하게 처리 ---
    if (body.action === 'save') {
      const { extractedData } = body;
      if (!extractedData) {
        return NextResponse.json({ error: "저장할 데이터가 없습니다." }, { status: 400 });
      }
      
      const docRef = await addDoc(collection(db, "daily_reports"), {
        ...extractedData,
        reportDate: new Date().toISOString(),
        createdAt: serverTimestamp()
      });
      
      return NextResponse.json({ success: true, id: docRef.id });
    }
    // -------------------------------------------------------------

    // 기존 AI 파일 분석 로직
    const { text, fileContent, fileName, fileType } = body;

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    let finalPrompt = text || '';
    let imageParts: Part[] = [];

    // 1. 엑셀(CSV) 파일 분기 처리
    if (fileType === 'excel' && fileContent) {
        if (fileContent.startsWith('data:')) { 
            finalPrompt += `\n\n--- [첨부된 엑셀 파일: ${fileName}] ---\n(참고: XLSX 파일의 내용은 현재 텍스트로 직접 표시할 수 없습니다. 파일명을 바탕으로 내용을 추론하여 답변합니다.)`;
        } else { 
            finalPrompt += `\n\n--- [첨부된 CSV 데이터: ${fileName}] ---\n${fileContent}\n-----------------------------------\n이 데이터를 바탕으로 정육점 마감 보고서를 작성하고 분석해줘.`;
        }
    } 
    // 2. 거래명세서 이미지 파일 분기 처리
    else if (fileType === 'image' && fileContent) {
      const mimeType = fileContent.substring(fileContent.indexOf(':') + 1, fileContent.indexOf(';'));
      const base64Data = fileContent.split(',')[1];
      
      imageParts.push({
        inlineData: {
          data: base64Data,
          mimeType: mimeType
        }
      });
      finalPrompt += `\n\n이 거래명세서/영수증 사진을 분석하여 거래처명, 품목별 단가, 수량, 그리고 축산물 이력번호(12자리)를 정확히 추출해줘.`;
    }

    // 대화와 데이터를 완벽히 분리하는 JSON 강제화 시스템 명령어
    const systemInstruction = `당신은 육류 유통 및 매장 관리 전문가이자 Pitaya OS의 AI 경영 비서입니다.
사장님들에게 전문적이고 명확한 피드백을 제공하세요.
    
**매우 중요**: 당신의 응답은 반드시 아래와 같이 'reply'와 'data' 키를 포함한 단일 JSON 객체 형식이어야 합니다.
JSON 외부에 어떠한 텍스트나 마크다운(\`\`\`)도 추가하지 마세요.

{
  "reply": "여기에 사장님께 전달할 자연스러운 대화형 분석 내용을 작성합니다. (마크다운 사용 가능)",
  "data": {
    "totalSales": 0,
    "customerCount": 0,
    "receiptNumber": ""
  }
}

위 JSON 구조를 템플릿으로 사용하되, 'data' 객체 안의 값들은 당신이 추출한 실제 데이터로 채워야 합니다.
- totalSales (숫자): 추출된 총매출 합계입니다. 없으면 0을 사용하세요.
- customerCount (숫자): 추출된 총 객수입니다. 없으면 0을 사용하세요.
- receiptNumber (문자열): 추출된 이력번호입니다. 없으면 빈 문자열 ""을 사용하세요.`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [...imageParts, { text: finalPrompt }] }],
      systemInstruction: { role: 'system', parts: [{ text: systemInstruction }]},
      generationConfig: {
        responseMimeType: "application/json", 
      }
    });
    
    const responseText = result.response.text();
    const parsedResponse = JSON.parse(responseText);

    return NextResponse.json({ 
      text: parsedResponse.reply,       
      parsedData: parsedResponse.data  
    });

  } catch (error: any) {
    console.error("Sales AI 백엔드 처리 오류:", error);
    return NextResponse.json(
      { 
        error: error.message || "서버에서 AI 요청을 처리하는 중 오류가 발생했습니다.",
        text: "죄송합니다, 대표님. 요청을 처리하는 중에 예상치 못한 오류가 발생했습니다. 백엔드 로그를 확인해주세요.",
        parsedData: null
      },
      { status: 500 }
    );
  }
}