import { NextResponse } from 'next/server';
import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import { db } from '@/lib/firebase/firebase';
import { collection, addDoc, serverTimestamp, getDocs, query, orderBy, where, limit } from 'firebase/firestore';

// ────────────────────────────────────────────────
// [일련번호 채번 헬퍼 함수들]
// ────────────────────────────────────────────────

function formatYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function extractDateFromText(text: string): string | null {
  const fullMatch = text.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
  if (fullMatch) {
    return `${fullMatch[1]}${fullMatch[2].padStart(2,'0')}${fullMatch[3].padStart(2,'0')}`;
  }
  const koMatch = text.match(/(\d{1,2})월\s*(\d{1,2})일/);
  if (koMatch) {
    const year = new Date().getFullYear();
    return `${year}${koMatch[1].padStart(2,'0')}${koMatch[2].padStart(2,'0')}`;
  }
  const slashMatch = text.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (slashMatch) {
    const year = new Date().getFullYear();
    return `${year}${slashMatch[1].padStart(2,'0')}${slashMatch[2].padStart(2,'0')}`;
  }
  return null;
}

async function getNextTargetDate(): Promise<string> {
  const q = query(collection(db, "daily_reports"), orderBy("createdAt", "desc"), limit(1));
  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    return formatYMD(new Date());
  }

  const latestSerial: string = snapshot.docs[0].data().serialNumber || '';
  const datePart = latestSerial.slice(0, 8);

  if (/^\d{8}$/.test(datePart)) {
    const base = new Date(
      parseInt(datePart.slice(0, 4)),
      parseInt(datePart.slice(4, 6)) - 1,
      parseInt(datePart.slice(6, 8)) + 1
    );
    return formatYMD(base);
  }

  return formatYMD(new Date());
}

async function generateSerialNumber(targetDateStr: string): Promise<string> {
  const baseSerial = `${targetDateStr}-MG-0001`;

  const q = query(
    collection(db, "daily_reports"),
    where("serialNumber", ">=", targetDateStr),
    where("serialNumber", "<", targetDateStr + "")
  );
  const snapshot = await getDocs(q);

  if (snapshot.empty) return baseSerial;

  let maxRevision = 0;
  let hasBase = false;

  snapshot.docs.forEach(doc => {
    const sn: string = doc.data().serialNumber || '';
    if (sn === baseSerial) hasBase = true;
    const revMatch = sn.match(/-(\d{2})$/);
    if (revMatch) maxRevision = Math.max(maxRevision, parseInt(revMatch[1]));
  });

  if (!hasBase) return baseSerial;
  return `${baseSerial}-${String(maxRevision + 1).padStart(2, '0')}`;
}
// ────────────────────────────────────────────────

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
      finalPrompt += `\n\n이 이미지는 정육점 매출 관련 자료입니다.
이미지를 분석하여 아래 항목을 추출해줘:

- totalSales: 표에서 합계 금액(총매출)을 숫자로 추출. 없으면 0.
- customerCount: 영수증 건수 또는 거래 건수를 숫자로 추출. 없으면 0.

금액은 콤마 제거한 순수 숫자로 반환해줘.
예) 1,250,000 → 1250000`;
    }

    // ── [일련번호 채번] ──────────────────────────────
    // 규칙 1: 사용자 텍스트에서 명시적 날짜 추출 (최우선)
    let targetDateStr = extractDateFromText(finalPrompt);

    // 규칙 2: 명시적 날짜 없을 경우 DB 조회로 자동 채번
    if (!targetDateStr) {
      targetDateStr = await getNextTargetDate();
    }

    // 규칙 3: 수정 차수 포함 최종 일련번호 생성
    const serialNumber = await generateSerialNumber(targetDateStr);

    // 규칙 4: AI 프롬프트에 일련번호 주입
    const displayDate = `${targetDateStr.slice(0,4)}년 ${parseInt(targetDateStr.slice(4,6))}월 ${parseInt(targetDateStr.slice(6,8))}일`;
    finalPrompt += `\n\n[시스템 채번 일련번호: ${serialNumber} | 기준일: ${displayDate}]`;
    // ────────────────────────────────────────────────

    // 대화와 데이터를 완벽히 분리하는 JSON 강제화 시스템 명령어
    const systemInstruction = `**날짜 추출 최우선 규칙**:
1. 이미지가 첨부된 경우, 반드시 이미지 안의 전표번호에서 날짜를 추출하세요.
   전표번호 형식 예시: 2026-05-17020004 → 날짜: 2026-05-17
2. 추출한 날짜를 data.reportDate에 "YYYY-MM-DD" 형식으로 반환하세요.
3. 시스템이 주입한 [시스템 채번 일련번호]의 기준일은 무시하고, 반드시 전표번호에서 추출한 날짜를 기준으로 reply를 작성하세요.
4. reply 마지막에 반드시 아래 형식으로 확인 요청하세요: "전표 기준 날짜는 [추출한 날짜 YYYY년 M월 D일]입니다. 맞습니까?"

중요: reply 필드 안에서 줄바꿈이 필요할 때는 반드시 \\n 이스케이프 문자를 사용하고 실제 엔터(줄바꿈 문자)를 절대 사용하지 마세요.

당신은 육류 유통 및 매장 관리 전문가이자 Pitaya OS의 AI 경영 비서입니다.
사장님들에게 전문적이고 명확한 피드백을 제공하세요.

**매우 중요**: 당신의 응답은 반드시 아래와 같이 'reply'와 'data' 키를 포함한 단일 JSON 객체 형식이어야 합니다.
JSON 외부에 어떠한 텍스트나 마크다운(\`\`\`)도 추가하지 마세요.

{
  "reply": "여기에 사장님께 전달할 자연스러운 대화형 분석 내용을 작성합니다. (마크다운 사용 가능)\n\n---\n해당 문서는 [기준일을 'YYYY년 M월 D일' 형식으로] 의 마감 데이터로 저장됩니다. 맞습니까?",
  "data": {
    "totalSales": 0,
    "customerCount": 0,
    "receiptNumber": "",
    "serialNumber": "시스템이 제공한 일련번호를 그대로 복사하세요"
  }
}

위 JSON 구조를 템플릿으로 사용하되, 'data' 객체 안의 값들은 당신이 추출한 실제 데이터로 채워야 합니다.
- totalSales (숫자): 추출된 총매출 합계입니다. 없으면 0을 사용하세요.
- customerCount (숫자): 추출된 총 객수입니다. 없으면 0을 사용하세요.
- receiptNumber (문자열): 추출된 이력번호입니다. 없으면 빈 문자열 ""을 사용하세요.
- serialNumber (문자열): 프롬프트 하단 [시스템 채번 일련번호]에 적힌 값을 그대로 복사합니다. 절대 변경하지 마세요.

**필수**: 'reply' 텍스트 마지막에 반드시 다음 검증 메시지를 포함하세요.
"해당 문서는 [기준일을 'YYYY년 M월 D일' 형식으로]의 마감 데이터로 저장됩니다. 맞습니까?"
기준일은 프롬프트 하단 [시스템 채번 일련번호] 옆 '기준일' 값을 사용하세요.`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [...imageParts, { text: finalPrompt }] }],
      systemInstruction: { role: 'system', parts: [{ text: systemInstruction }]},
      generationConfig: {
        responseMimeType: "application/json", 
      }
    });
    
    const responseText = result.response.text();

    let parsedResponse;
    try {
      // 1차: 그대로 파싱 시도
      parsedResponse = JSON.parse(responseText);
    } catch (e1) {
      try {
        // 2차: JSON 블록만 추출 후 파싱
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("JSON 블록 없음");

        // 문자열 값 안의 줄바꿈만 제거
        const extracted = jsonMatch[0]
          .replace(/("(?:[^"\\]|\\.)*")/g, (match) =>
            match.replace(/\n/g, '\\n').replace(/\r/g, '').replace(/\t/g, '\\t')
          );
        parsedResponse = JSON.parse(extracted);
      } catch (e2) {
        console.error("JSON 파싱 최종 실패. 원본:", responseText);
        return NextResponse.json({
          text: "AI 응답 파싱에 실패했습니다. 다시 시도해주세요.",
          parsedData: null
        }, { status: 200 });
      }
    }

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