import { NextResponse } from 'next/server';
import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

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
  const snapshot = await adminDb.collection("daily_reports")
    .orderBy("createdAt", "desc")
    .limit(1)
    .get();

  if (snapshot.empty) {
    return formatYMD(new Date());
  }

  const latestSerial: string = (snapshot.docs[0].data() as any).serialNumber || '';
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
  const baseSerial = `${targetDateStr}-DSC-0001`;

  const snapshot = await adminDb.collection("daily_reports")
    .where("serialNumber", ">=", targetDateStr)
    .where("serialNumber", "<", targetDateStr + "~")
    .get();

  if (snapshot.empty) return baseSerial;

  let maxRevision = 0;
  let hasBase = false;

  snapshot.docs.forEach(doc => {
    const sn: string = (doc.data() as any).serialNumber || '';
    if (sn === baseSerial) hasBase = true;
    const revMatch = sn.match(/-(\d{2})$/);
    if (revMatch) maxRevision = Math.max(maxRevision, parseInt(revMatch[1]));
  });

  if (!hasBase) return baseSerial;
  return `${baseSerial}-${String(maxRevision + 1).padStart(2, '0')}`;
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (body.action === 'save') {
      const { extractedData, uid, storeId } = body;
      if (!extractedData) {
        return NextResponse.json({ error: "저장할 데이터가 없습니다." }, { status: 400 });
      }

      const docRef = await adminDb.collection("daily_reports").add({
        ...extractedData,
        uid: uid || '',
        storeId: storeId || '',
        reportDate: new Date().toISOString(),
        createdAt: FieldValue.serverTimestamp(),
      });

      return NextResponse.json({ success: true, id: docRef.id });
    }

    const { text, fileContent, fileName, fileType } = body;

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    let finalPrompt = text || '';
    let imageParts: Part[] = [];

    if (fileType === 'excel' && fileContent) {
      if (fileContent.startsWith('data:')) {
        finalPrompt += `\n\n--- [첨부된 엑셀 파일: ${fileName}] ---\n(참고: XLSX 파일의 내용은 현재 텍스트로 직접 표시할 수 없습니다. 파일명을 바탕으로 내용을 추론하여 답변합니다.)`;
      } else {
        finalPrompt += `\n\n--- [첨부된 CSV 데이터: ${fileName}] ---\n${fileContent}\n-----------------------------------\n이 데이터를 바탕으로 정육점 마감 보고서를 작성하고 분석해줘.`;
      }
    } else if (fileType === 'image' && fileContent) {
      const mimeType = fileContent.substring(fileContent.indexOf(':') + 1, fileContent.indexOf(';'));
      const base64Data = fileContent.split(',')[1];
      imageParts.push({ inlineData: { data: base64Data, mimeType } });
      finalPrompt += `\n\n이 이미지는 정육점 매출 관련 자료입니다.
이미지를 분석하여 아래 항목을 추출해줘:

- totalSales: 표에서 합계 금액(총매출)을 숫자로 추출. 없으면 0.
- customerCount: 영수증 건수 또는 거래 건수를 숫자로 추출. 없으면 0.

금액은 콤마 제거한 순수 숫자로 반환해줘.
예) 1,250,000 → 1250000`;
    }

    const receiptDateMatch = finalPrompt.match(/20\d{2}-\d{2}-\d{2}/);
    let targetDateStr = receiptDateMatch
      ? receiptDateMatch[0].replace(/-/g, '')
      : extractDateFromText(finalPrompt);

    if (!targetDateStr) {
      targetDateStr = await getNextTargetDate();
    }

    const serialNumber = await generateSerialNumber(targetDateStr);

    const displayDate = `${targetDateStr.slice(0,4)}년 ${parseInt(targetDateStr.slice(4,6))}월 ${parseInt(targetDateStr.slice(6,8))}일`;
    finalPrompt += `\n\n[시스템 채번 일련번호: ${serialNumber} | 기준일: ${displayDate}]`;

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
  "reply": "여기에 사장님께 전달할 자연스러운 대화형 분석 내용을 작성합니다. (마크다운 사용 가능)\\n\\n---\\n해당 문서는 [기준일을 'YYYY년 M월 D일' 형식으로] 의 마감 데이터로 저장됩니다. 맞습니까?",
  "data": {
    "totalSales": 0,
    "customerCount": 0,
    "receiptNumber": "",
    "serialNumber": "시스템이 제공한 일련번호를 그대로 복사하세요",
    "items": [],
    "returnAmount": 0,
    "discountAmount": 0,
    "netSales": 0,
    "promotion": ""
  }
}

위 JSON 구조를 템플릿으로 사용하되, 'data' 객체 안의 값들은 당신이 추출한 실제 데이터로 채워야 합니다.
- totalSales (숫자): 추출된 총매출 합계입니다. 없으면 0을 사용하세요.
- customerCount (숫자): 추출된 총 객수입니다. 없으면 0을 사용하세요.
- receiptNumber (문자열): 추출된 이력번호입니다. 없으면 빈 문자열 ""을 사용하세요.
- serialNumber (문자열): 프롬프트 하단 [시스템 채번 일련번호]에 적힌 값을 그대로 복사합니다. 절대 변경하지 마세요.
- items (배열): 품목별 거래 목록입니다. 각 항목은 {barcode, name, qty, amount, returnAmount, discountAmount, netSales} 형식입니다. 없으면 []을 사용하세요.
- returnAmount (숫자): 반품금액 합계입니다. 없으면 0을 사용하세요.
- discountAmount (숫자): 할인금액 합계입니다. 없으면 0을 사용하세요.
- netSales (숫자): 순매출 합계(totalSales - returnAmount - discountAmount)입니다. 없으면 0을 사용하세요.
- promotion (문자열): 프롬프트에서 전달된 프로모션/이벤트 내용을 그대로 복사합니다. 없으면 빈 문자열 ""을 사용하세요.

**필수**: 'reply' 텍스트 마지막에 반드시 아래 규칙으로 날짜 확인 메시지를 작성하세요.
- 이미지가 첨부된 경우: 전표번호 앞 10자리에서 날짜를 추출하여 "전표 기준 날짜는 [추출한 날짜 YYYY년 M월 D일]입니다. 맞습니까?" 형식으로 작성
- 이미지가 없는 경우: 사용자 텍스트에서 날짜를 찾아 "입력하신 날짜는 [날짜]입니다. 맞습니까?" 형식으로 작성
- 날짜 확인 문구는 반드시 1개만 작성하세요. 절대 중복 작성 금지.`;

    const generateWithRetry = async (retryCount = 0): Promise<any> => {
      try {
        return await model.generateContent({
          contents: [{ role: 'user', parts: [...imageParts, { text: finalPrompt }] }],
          systemInstruction: { role: 'system', parts: [{ text: systemInstruction }] },
          generationConfig: { responseMimeType: "application/json" }
        });
      } catch (err: any) {
        const is503 = err.message?.includes('503');
        if (is503 && retryCount < 3) {
          await new Promise(res => setTimeout(res, 2000));
          return generateWithRetry(retryCount + 1);
        }
        if (is503) {
          return NextResponse.json({
            text: "⚠️ Gemini 서버가 혼잡합니다. 잠시 후 재시도해주세요.",
            parsedData: null,
            retryable: true
          }, { status: 200 });
        }
        throw err;
      }
    };

    const result = await generateWithRetry();
    if (result instanceof NextResponse) return result;

    const responseText = result.response.text();

    let parsedResponse;
    try {
      parsedResponse = JSON.parse(responseText);
    } catch (e1) {
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("JSON 블록 없음");
        const extracted = jsonMatch[0]
          .replace(/("(?:[^"\\]|\\.)*")/g, (match: string) =>
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

    const msg = error.message || '';
    let userMessage = '';
    let retryable = false;

    if (msg.includes('503')) {
      userMessage = '⚠️ Gemini 서버 트래픽 과다입니다. 현재 구글 AI 서버에 요청이 몰려 처리가 지연되고 있습니다. 잠시 후 재시도해주세요.';
      retryable = true;
    } else if (msg.includes('429')) {
      userMessage = '⚠️ API 요청 한도 초과입니다. 단시간에 너무 많은 요청이 발생했습니다. 1분 후 다시 시도해주세요.';
      retryable = true;
    } else if (msg.includes('400')) {
      userMessage = '⚠️ 이미지 처리 오류입니다. 이미지가 너무 크거나 형식이 올바르지 않습니다. 분석할 표 부분만 잘라서 다시 붙여넣어 주세요.';
      retryable = false;
    } else if (msg.includes('401') || msg.includes('403')) {
      userMessage = '⚠️ API 인증 오류입니다. Gemini API 키가 유효하지 않거나 만료되었습니다.';
      retryable = false;
    } else if (msg.includes('404')) {
      userMessage = '⚠️ AI 모델을 찾을 수 없습니다. gemini-2.5-flash 모델명을 확인해주세요.';
      retryable = false;
    } else if (msg.includes('500')) {
      userMessage = '⚠️ Gemini 서버 내부 오류입니다. 잠시 후 재시도해주세요.';
      retryable = true;
    } else if (msg.includes('Failed to fetch') || msg.includes('ECONNREFUSED')) {
      userMessage = '⚠️ 네트워크 연결 오류입니다. 인터넷 연결 상태를 확인해주세요.';
      retryable = true;
    } else if (msg.includes('JSON') || msg.includes('parse')) {
      userMessage = '⚠️ AI 응답 파싱 오류입니다. 다시 시도해주세요.';
      retryable = true;
    } else {
      userMessage = `⚠️ 알 수 없는 오류가 발생했습니다. 다시 시도해주세요. (${msg})`;
      retryable = true;
    }

    return NextResponse.json({ error: msg, text: userMessage, parsedData: null, retryable }, { status: 200 });
  }
}
