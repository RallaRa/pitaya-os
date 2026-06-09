import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { fetchWeather, getStoreCoords } from '@/lib/weather';
import { verifyToken } from '@/lib/authVerify';
import {
  generateTextWithFallback,
  generateVisionWithFallback,
  hasAnyAiProvider,
  stripJsonMarkdown,
} from '@/lib/aiProviderFallback';
import { aiMetaJson } from '@/lib/aiProviderMeta';
import { sendKakaoNotifySafe, sendKakaoNotifyToStore } from '@/lib/kakao/sendNotify';
import { appendStoreBusinessContext } from '@/lib/storeBusinessContext';

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

function getKSTToday(): string {
  return formatYMD(new Date(Date.now() + 9 * 60 * 60 * 1000));
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


export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();

    // ── 기존 보고서 불러오기 ──
    if (body.action === 'load') {
      const { storeId, reportDate } = body;
      if (!reportDate) {
        return NextResponse.json({ error: "날짜가 필요합니다." }, { status: 400 });
      }
      const snap = await adminDb.collection("daily_reports")
        .where("storeId", "==", storeId || '')
        .where("reportDate", "==", reportDate)
        .orderBy("createdAt", "desc")
        .limit(1)
        .get();
      if (snap.empty) {
        return NextResponse.json({ found: false });
      }
      const doc = snap.docs[0];
      return NextResponse.json({ found: true, id: doc.id, data: doc.data() });
    }

    // ── 보고서 저장 (신규 or 수정) ──
    if (body.action === 'save') {
      const { extractedData, uid, storeId, userName } = body;
      if (!extractedData) {
        return NextResponse.json({ error: "저장할 데이터가 없습니다." }, { status: 400 });
      }

      let reportDate: string = extractedData.reportDate || '';
      if (!reportDate) {
        const sn: string = extractedData.serialNumber || '';
        const snMatch = sn.match(/^(\d{4})(\d{2})(\d{2})/);
        if (snMatch) {
          reportDate = `${snMatch[1]}-${snMatch[2]}-${snMatch[3]}`;
        } else {
          reportDate = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
        }
      }

      let storeCoords = getStoreCoords();
      if (storeId) {
        const storeDoc = await adminDb.collection('stores').doc(storeId).get();
        if (storeDoc.exists) {
          const storeData = storeDoc.data() as any;
          storeCoords = getStoreCoords(storeData.regionSido);
        }
      }
      const weather = await fetchWeather(reportDate, storeCoords);

      // 같은 날짜+매장 문서가 있는지 확인
      const existing = await adminDb.collection("daily_reports")
        .where("storeId", "==", storeId || '')
        .where("reportDate", "==", reportDate)
        .orderBy("createdAt", "desc")
        .limit(1)
        .get();

      const editorInfo = { uid: uid || '', name: userName || '' };

      if (!existing.empty) {
        // 수정 — 기존 문서 업데이트 + editHistory 추가
        const docRef = existing.docs[0].ref;
        const prev = existing.docs[0].data();
        const historyEntry = {
          editedAt: FieldValue.serverTimestamp(),
          editedBy: editorInfo,
          snapshot: {
            totalSales:     prev.totalSales     ?? 0,
            customerCount:  prev.customerCount  ?? 0,
            netSales:       prev.netSales       ?? 0,
            returnAmount:   prev.returnAmount   ?? 0,
            discountAmount: prev.discountAmount ?? 0,
            reportDate:     prev.reportDate     ?? '',
          },
        };
        await docRef.update({
          ...extractedData,
          uid: uid || '',
          storeId: storeId || '',
          reportDate,
          weather: weather || prev.weather || null,
          lastModifiedAt: FieldValue.serverTimestamp(),
          lastModifiedBy: editorInfo,
          editHistory: FieldValue.arrayUnion(historyEntry),
        });
        sendKakaoNotifyToStore(storeId || '', {
          title: '✅ 일마감 수정',
          message: `${reportDate} 매출 ${Number(extractedData.totalSales || prev.totalSales || 0).toLocaleString()}원`,
          link: `${process.env.NEXT_PUBLIC_APP_URL || 'https://pitaya-osv1.vercel.app'}/dashboard/report/view`,
        }).catch(() => {});
        if (uid) {
          sendKakaoNotifySafe({
            userId: uid,
            title: '✅ 일마감 수정',
            message: `${reportDate} 매출 ${Number(extractedData.totalSales || prev.totalSales || 0).toLocaleString()}원`,
            link: `${process.env.NEXT_PUBLIC_APP_URL || 'https://pitaya-osv1.vercel.app'}/dashboard/report/view`,
          });
        }
        return NextResponse.json({ success: true, id: docRef.id, updated: true });
      }

      // 신규 생성
      const docRef = await adminDb.collection("daily_reports").add({
        ...extractedData,
        uid: uid || '',
        storeId: storeId || '',
        reportDate,
        weather: weather || null,
        createdAt: FieldValue.serverTimestamp(),
        lastModifiedAt: FieldValue.serverTimestamp(),
        lastModifiedBy: editorInfo,
        editHistory: [],
      });

      sendKakaoNotifyToStore(storeId || '', {
        title: '✅ 일마감 완료',
        message: `오늘 매출 ${Number(extractedData.totalSales || 0).toLocaleString()}원`,
        link: `${process.env.NEXT_PUBLIC_APP_URL || 'https://pitaya-osv1.vercel.app'}/dashboard/report/view`,
      }).catch(() => {});
      if (uid) {
        sendKakaoNotifySafe({
          userId: uid,
          title: '✅ 일마감 완료',
          message: `오늘 매출 ${Number(extractedData.totalSales || 0).toLocaleString()}원`,
          link: `${process.env.NEXT_PUBLIC_APP_URL || 'https://pitaya-osv1.vercel.app'}/dashboard/report/view`,
        });
      }

      return NextResponse.json({ success: true, id: docRef.id, updated: false });
    }

    const { text, fileContent, fileName, fileType, promotion, promotions } = body;

    if (!hasAnyAiProvider()) {
      return NextResponse.json({
        error: 'AI API 키 미설정',
        text: '⚠️ AI API 키가 설정되지 않았습니다. (GEMINI / ANTHROPIC / OPENAI / GROQ)',
        parsedData: null,
      }, { status: 503 });
    }

    let finalPrompt = text || '';
    let visionImages: { base64: string; mimeType: string }[] = [];

    if (fileType === 'excel' && fileContent) {
      if (fileContent.startsWith('data:')) {
        finalPrompt += `\n\n--- [첨부된 엑셀 파일: ${fileName}] ---\n(참고: XLSX 파일의 내용은 현재 텍스트로 직접 표시할 수 없습니다. 파일명을 바탕으로 내용을 추론하여 답변합니다.)`;
      } else {
        finalPrompt += `\n\n--- [첨부된 CSV 데이터: ${fileName}] ---\n${fileContent}\n-----------------------------------\n이 데이터를 바탕으로 정육점 마감 보고서를 작성하고 분석해줘.`;
      }
    } else if (fileType === 'image' && fileContent) {
      const mimeType = fileContent.substring(fileContent.indexOf(':') + 1, fileContent.indexOf(';'));
      const base64Data = fileContent.split(',')[1];
      visionImages.push({ base64: base64Data, mimeType });
      finalPrompt += `\n\n이 이미지는 정육점 매출 관련 자료입니다.
이미지를 분석하여 아래 항목을 추출해줘:

- totalSales: 표에서 합계 금액(총매출)을 숫자로 추출. 없으면 0.
- customerCount: 영수증 건수 또는 거래 건수를 숫자로 추출. 없으면 0.

금액은 콤마 제거한 순수 숫자로 반환해줘.
예) 1,250,000 → 1250000`;
    }

    const promoText = Array.isArray(promotions) && promotions.length > 0
      ? promotions.join(', ')
      : (promotion || '');
    if (promoText) {
      finalPrompt += `\n\n[오늘의 특가/프로모션: ${promoText}]`;
    }

    const receiptDateMatch = finalPrompt.match(/20\d{2}-\d{2}-\d{2}/);
    let targetDateStr = receiptDateMatch
      ? receiptDateMatch[0].replace(/-/g, '')
      : extractDateFromText(finalPrompt);

    if (!targetDateStr) {
      targetDateStr = getKSTToday();
    }

    const serialNumber = await generateSerialNumber(targetDateStr);

    const displayDate = `${targetDateStr.slice(0,4)}년 ${parseInt(targetDateStr.slice(4,6))}월 ${parseInt(targetDateStr.slice(6,8))}일`;
    finalPrompt += `\n\n[시스템 채번 일련번호: ${serialNumber} | 기준일: ${displayDate}]`;

    const systemInstruction = appendStoreBusinessContext(`**날짜 추출 최우선 규칙**:
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
    "reportDate": "",
    "totalSales": 0,
    "customerCount": 0,
    "receiptNumber": "",
    "serialNumber": "시스템이 제공한 일련번호를 그대로 복사하세요",
    "items": [],
    "returnAmount": 0,
    "discountAmount": 0,
    "netSales": 0,
    "promotions": [],
    "issues": []
  }
}

위 JSON 구조를 템플릿으로 사용하되, 'data' 객체 안의 값들은 당신이 추출한 실제 데이터로 채워야 합니다.
- reportDate (문자열): 전표/이미지/텍스트에서 추출한 날짜를 "YYYY-MM-DD" 형식으로 반환합니다. 추출 불가 시 빈 문자열 "".
- totalSales (숫자): 추출된 총매출 합계입니다. 없으면 0을 사용하세요.
- customerCount (숫자): 추출된 총 객수입니다. 없으면 0을 사용하세요.
- receiptNumber (문자열): 추출된 이력번호입니다. 없으면 빈 문자열 ""을 사용하세요.
- serialNumber (문자열): 프롬프트 하단 [시스템 채번 일련번호]에 적힌 값을 그대로 복사합니다. 절대 변경하지 마세요.
- items (배열): 품목별 거래 목록입니다. 각 항목은 {barcode, name, qty, amount, returnAmount, discountAmount, netSales} 형식입니다. 없으면 []을 사용하세요.
- returnAmount (숫자): 반품금액 합계입니다. 없으면 0을 사용하세요.
- discountAmount (숫자): 할인금액 합계입니다. 없으면 0을 사용하세요.
- netSales (숫자): 순매출 합계(totalSales - returnAmount - discountAmount)입니다. 없으면 0을 사용하세요.
- promotions (배열): 프롬프트에서 전달된 프로모션/이벤트를 항목별 문자열 배열로 반환합니다. 쉼표 구분 시 각각 분리. 없으면 [].
- issues (배열): 정육/축산/식품 시장 관련 오늘의 이슈나 트렌드를 AI 지식 기반으로 최대 2개 요약하여 [{title: "...", source: "AI 추천"}] 형식으로 반환합니다. 없으면 [].

**필수**: 'reply' 텍스트 마지막에 반드시 아래 규칙으로 날짜 확인 메시지를 작성하세요.
- 이미지가 첨부된 경우: 전표번호 앞 10자리에서 날짜를 추출하여 "전표 기준 날짜는 [추출한 날짜 YYYY년 M월 D일]입니다. 맞습니까?" 형식으로 작성
- 이미지가 없는 경우: 사용자 텍스트에서 날짜를 찾아 "입력하신 날짜는 [날짜]입니다. 맞습니까?" 형식으로 작성
- 날짜 확인 문구는 반드시 1개만 작성하세요. 절대 중복 작성 금지.`);

    let aiResult;
    try {
      if (visionImages.length > 0) {
        aiResult = await generateVisionWithFallback({
          system: systemInstruction,
          prompt: finalPrompt,
          images: visionImages,
          json: true,
          useCase: 'report',
        });
      } else {
        aiResult = await generateTextWithFallback({
          system: systemInstruction,
          prompt: finalPrompt,
          json: true,
          useCase: 'report',
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/503|overloaded|capacity/i.test(msg)) {
        return NextResponse.json({
          text: '⚠️ AI 서버가 혼잡합니다. 잠시 후 재시도해주세요.',
          parsedData: null,
          retryable: true,
        }, { status: 200 });
      }
      throw err;
    }

    const responseText = stripJsonMarkdown(aiResult.text);

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
      parsedData: parsedResponse.data,
      ...aiMetaJson(aiResult),
    });

  } catch (error: any) {
    console.error("Sales AI 백엔드 처리 오류:", error);

    const msg = error.message || '';
    let userMessage = '';
    let retryable = false;

    if (msg.includes('503')) {
      userMessage = '⚠️ AI 서버 트래픽 과다입니다. 잠시 후 재시도해주세요.';
      retryable = true;
    } else if (msg.includes('429') || /quota|rate limit|모든 AI/i.test(msg)) {
      userMessage = '⚠️ 모든 AI API 요청 한도가 초과되었습니다. 잠시 후 다시 시도해주세요.';
      retryable = true;
    } else if (msg.includes('400')) {
      userMessage = '⚠️ 이미지 처리 오류입니다. 이미지가 너무 크거나 형식이 올바르지 않습니다. 분석할 표 부분만 잘라서 다시 붙여넣어 주세요.';
      retryable = false;
    } else if (msg.includes('401') || msg.includes('403')) {
      userMessage = '⚠️ AI API 인증 오류입니다. API 키를 확인해주세요.';
      retryable = false;
    } else if (msg.includes('404')) {
      userMessage = '⚠️ AI 모델을 찾을 수 없습니다. 설정을 확인해주세요.';
      retryable = false;
    } else if (msg.includes('500')) {
      userMessage = '⚠️ AI 서버 내부 오류입니다. 잠시 후 재시도해주세요.';
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
