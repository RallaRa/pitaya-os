import { NextResponse } from 'next/server';
import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import { verifyToken } from '@/lib/authVerify';
import { compressBase64Image, estimateBase64Bytes } from '@/lib/compressImageServer';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB per image (post-compress guard)

const SYSTEM_INSTRUCTION = `당신은 매입/구매 문서 전문 분석 AI입니다.
하나 또는 여러 장의 거래명세서, 세금계산서, 매입전표, 영수증을 분석하여 정확한 JSON 배열로 반환합니다.

**중요**: 반드시 아래 구조의 JSON 배열만 반환하세요. 마크다운(\`\`\`)이나 다른 텍스트는 절대 포함하지 마세요.

[
  {
    "purchaseDate": "YYYY-MM-DD",
    "supplierName": "공급업체명",
    "invoiceNumber": "전표/세금계산서 번호 (없으면 빈 문자열)",
    "items": [
      {
        "name": "품명",
        "qty": 수량(숫자),
        "unit": "단위(kg/개/박스 등)",
        "unitPrice": 단가(숫자),
        "supplyAmount": 공급가액(숫자),
        "taxAmount": 세액(숫자),
        "traceNo": "이력번호 (없으면 빈 문자열)",
        "origin": "원산지 (없으면 빈 문자열)",
        "cut": "부위명 (없으면 빈 문자열)",
        "grade": "등급 (없으면 빈 문자열)"
      }
    ],
    "supplyAmount": 공급가액합계(숫자),
    "taxAmount": 세액합계(숫자),
    "totalAmount": 합계금액(숫자),
    "paymentMethod": "결제방법 (현금/카드/외상/이체, 없으면 빈 문자열)",
    "memo": "특이사항 (없으면 빈 문자열)"
  }
]

규칙:
- 여러 장의 문서가 있으면 각 문서를 별도 객체로 반환.
- 한 이미지에 여러 업체 명세가 있으면 각각 별도 객체로.
- purchaseDate: 문서에서 날짜 추출, 형식은 YYYY-MM-DD. 추출 불가 시 오늘 날짜.
- 금액은 콤마 제거한 순수 숫자 (예: 1,250,000 → 1250000).
- 이력번호/원산지/부위/등급이 없으면 빈 문자열 반환.
- items가 없으면 [] 반환.`;

async function generateWithRetry(model: any, contents: any, retryCount = 0): Promise<any> {
  try {
    return await model.generateContent({
      contents,
      systemInstruction: { role: 'system', parts: [{ text: SYSTEM_INSTRUCTION }] },
      generationConfig: { responseMimeType: 'application/json' },
    });
  } catch (err: any) {
    if (err.message?.includes('503') && retryCount < 3) {
      await new Promise(res => setTimeout(res, 2000));
      return generateWithRetry(model, contents, retryCount + 1);
    }
    throw err;
  }
}

async function prepareImageContent(content: string, fileName: string) {
  try {
    const { data, mimeType } = await compressBase64Image(content);
    if (estimateBase64Bytes(data) > MAX_IMAGE_BYTES) {
      console.warn(`[analyze-multi] 이미지 용량 초과: ${fileName}`);
      return null;
    }
    return { base64Data: data, mimeType };
  } catch (e: any) {
    console.error(`[analyze-multi] 이미지 압축 실패 (${fileName}):`, e?.message || e);
    return null;
  }
}

export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) {
    console.warn('[analyze-multi] Unauthorized');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const cloudKey  = process.env.GOOGLE_CLOUD_API_KEY;
  if (!geminiKey && !cloudKey) {
    console.error('[analyze-multi] GEMINI_API_KEY / GOOGLE_CLOUD_API_KEY 미설정');
    return NextResponse.json({ error: 'GEMINI_API_KEY 또는 GOOGLE_CLOUD_API_KEY 미설정' }, { status: 500 });
  }

  let body: any;
  try {
    const rawText = await req.text();
    if (!rawText) {
      return NextResponse.json({ error: '요청 본문이 비어 있습니다.' }, { status: 400 });
    }
    if (rawText.length > 10 * 1024 * 1024) {
      console.warn(`[analyze-multi] 413 body too large: ${rawText.length} chars`);
      return NextResponse.json(
        { error: '이미지 용량이 너무 큽니다. 이미지를 줄여서 다시 시도해주세요.' },
        { status: 413 },
      );
    }
    body = JSON.parse(rawText);
  } catch (e: any) {
    console.error('[analyze-multi] JSON 파싱 실패:', e?.message || e);
    const msg = String(e?.message || '');
    if (msg.includes('413') || msg.toLowerCase().includes('too large') || msg.toLowerCase().includes('limit')) {
      return NextResponse.json(
        { error: '이미지 용량이 너무 큽니다. 이미지를 줄여서 다시 시도해주세요.' },
        { status: 413 },
      );
    }
    return NextResponse.json({ error: '요청 파싱 실패. 파일 크기를 줄여주세요.' }, { status: 400 });
  }

  try {
    const { files, message } = body;
    if (!Array.isArray(files) || files.length === 0) {
      return NextResponse.json({ error: '분석할 파일이 없습니다.' }, { status: 400 });
    }

    console.log(`[analyze-multi] start user=${authUser.uid} files=${files.length}`);

    const genAI = new GoogleGenerativeAI(geminiKey || cloudKey!);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const imageFiles = files.filter((f: any) => f.type === 'image' || f.type === 'pdf');
    const textFiles  = files.filter((f: any) => f.type !== 'image' && f.type !== 'pdf');

    const qualities: any[] = [];
    const allInvoices: any[] = [];

    async function checkQuality(base64Data: string, mimeType: string, fileName: string) {
      try {
        const qRes = await model.generateContent({
          contents: [{ role: 'user', parts: [
            { inlineData: { mimeType: mimeType || 'image/jpeg', data: base64Data } },
            { text: `OCR 품질 평가. JSON만: {"quality":"good|poor|unreadable","issues":[],"confidence":0-100,"feedback":"한국어 피드백"}` },
          ]}],
          generationConfig: { responseMimeType: 'application/json' },
        });
        const qt = qRes.response.text().trim().replace(/```json|```/g, '').trim();
        return { fileName, ...JSON.parse(qt) };
      } catch (e: any) {
        console.warn(`[analyze-multi] OCR 품질 평가 실패 (${fileName}):`, e?.message);
        return { fileName, quality: 'good', confidence: 70, issues: [], feedback: '' };
      }
    }

    for (const file of imageFiles) {
      if (!file.content) continue;

      const prepared = file.type === 'image'
        ? await prepareImageContent(file.content, file.name || 'image')
        : {
            base64Data: file.content.split(',')[1] || file.content,
            mimeType: file.content.substring(file.content.indexOf(':') + 1, file.content.indexOf(';')) || 'application/pdf',
          };

      if (!prepared?.base64Data) {
        qualities.push({
          fileName: file.name,
          quality: 'unreadable',
          confidence: 0,
          issues: ['용량 초과 또는 압축 실패'],
          feedback: '이미지 용량이 너무 큽니다. 더 작은 이미지로 다시 시도해주세요.',
        });
        continue;
      }

      const { base64Data, mimeType } = prepared;

      const quality = await checkQuality(base64Data, mimeType, file.name);
      qualities.push(quality);

      if (quality.quality === 'unreadable' || (quality.confidence != null && quality.confidence < 30)) {
        continue;
      }

      const parts: Part[] = [];
      if (message?.trim()) parts.push({ text: message });
      parts.push({ inlineData: { mimeType: mimeType || 'image/jpeg', data: base64Data } });

      const result = await generateWithRetry(model, [{ role: 'user', parts }]);
      const text = result.response.text().trim().replace(/```json|```/g, '').trim();
      try {
        const parsed = JSON.parse(text);
        const invs = Array.isArray(parsed) ? parsed : [parsed];
        allInvoices.push(...invs.filter((inv: any) => inv && (inv.supplierName || inv.items?.length > 0)));
      } catch {
        const match = text.match(/\[[\s\S]*\]/);
        if (match) {
          const invs = JSON.parse(match[0]);
          allInvoices.push(...invs.filter((inv: any) => inv && (inv.supplierName || inv.items?.length > 0)));
        }
      }
      await new Promise(r => setTimeout(r, 300));
    }

    if (textFiles.length > 0) {
      const parts: Part[] = [];
      if (message?.trim()) parts.push({ text: message });
      for (const file of textFiles) {
        if (file.content) parts.push({ text: `[파일: ${file.name}]\n${file.content}` });
      }
      if (parts.length > 0) {
        const result = await generateWithRetry(model, [{ role: 'user', parts }]);
        const text = result.response.text().trim().replace(/```json|```/g, '').trim();
        try {
          const parsed = JSON.parse(text);
          const invs = Array.isArray(parsed) ? parsed : [parsed];
          allInvoices.push(...invs.filter((inv: any) => inv && (inv.supplierName || inv.items?.length > 0)));
        } catch (parseErr: any) {
          console.warn('[analyze-multi] 텍스트 파일 JSON 파싱 실패:', parseErr?.message);
        }
      }
    }

    if (imageFiles.length === 0 && textFiles.length === 0) {
      return NextResponse.json({ error: '분석할 내용이 없습니다.' }, { status: 400 });
    }

    const invoices = allInvoices;

    let reply = invoices.length > 0
      ? `${invoices.length}건의 매입 내역을 추출했습니다. 시트에서 내용을 확인·수정 후 저장하세요.`
      : '문서에서 매입 내역을 추출하지 못했습니다. 더 선명한 이미지로 다시 시도해보세요.';

    const poor = qualities.filter(q => q.quality !== 'good');
    if (poor.length > 0) {
      reply += `\n\n⚠️ ${poor.length}개 파일 품질 주의: ${poor.map((q: any) => q.feedback || q.fileName).join(' / ')}`;
    }

    console.log(`[analyze-multi] done invoices=${invoices.length} qualities=${qualities.length}`);
    return NextResponse.json({ invoices, reply, qualities });
  } catch (e: any) {
    const msg = e.message || '';
    console.error('[analyze-multi] 오류:', msg, e?.stack);
    let userError = msg || '분석 중 오류가 발생했습니다.';
    let status = 500;
    if (msg.includes('503') || msg.includes('overloaded')) userError = 'Gemini 서버가 혼잡합니다. 잠시 후 재시도해주세요.';
    else if (msg.includes('429')) userError = 'API 요청 한도 초과입니다. 잠시 후 다시 시도해주세요.';
    else if (msg.includes('400') || msg.includes('invalid')) userError = '이미지 처리 오류입니다. 더 선명한 이미지로 다시 시도해주세요.';
    else if (msg.includes('JSON') || msg.includes('파싱')) userError = 'AI 분석 결과 파싱 실패. 문서를 다시 업로드해보세요.';
    else if (msg.toLowerCase().includes('too large') || msg.includes('413')) {
      userError = '이미지 용량이 너무 큽니다. 이미지를 줄여서 다시 시도해주세요.';
      status = 413;
    }
    return NextResponse.json(
      { error: userError, detail: process.env.NODE_ENV === 'development' ? msg : undefined },
      { status },
    );
  }
}
