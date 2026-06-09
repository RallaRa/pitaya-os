import { NextResponse } from 'next/server';
import { adminDb, adminStorage } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyToken } from '@/lib/authVerify';
import { v4 as uuidv4 } from 'uuid';
import {
  generateTextWithFallback,
  generateVisionWithFallback,
  hasAnyAiProvider,
  isQuotaOrRateLimitError,
  stripJsonMarkdown,
  type FallbackResult,
} from '@/lib/aiProviderFallback';
import { aiMetaJson } from '@/lib/aiProviderMeta';
import { sendKakaoNotifySafe, sendKakaoNotifyToStore } from '@/lib/kakao/sendNotify';
import { registerExpiryRemindersFromPurchase } from '@/lib/expiryReminder/fromPurchaseTrace';
import { syncItemPricesForPurchase } from '@/lib/purchaseItemPriceSync';
import {
  extFromMime,
  mimeFromFileType,
  type PurchaseAttachment,
} from '@/lib/purchaseAttachments';
import { appendStoreBusinessContext } from '@/lib/storeBusinessContext';

const SYSTEM_INSTRUCTION = appendStoreBusinessContext(`당신은 매입/구매 문서 전문 분석 AI입니다.
거래명세서, 세금계산서, 매입전표, 영수증 이미지 또는 데이터를 분석하여 정확한 JSON을 반환합니다.

**중요**: 반드시 아래 구조의 JSON만 반환하세요. 마크다운(\`\`\`)이나 다른 텍스트는 절대 포함하지 마세요.

{
  "reply": "사장님께 전달할 분석 요약 (마크다운 가능, \\n으로 줄바꿈)",
  "data": {
    "purchaseDate": "YYYY-MM-DD",
    "supplierName": "공급업체명",
    "invoiceNumber": "전표/세금계산서 번호 (없으면 빈 문자열)",
    "items": [
      { "name": "품명", "category": "한돈|한우|수입육|계육및기타|박스|용기|봉투|케이스|스티커|기타원부자재", "qty": 수량(숫자), "unit": "단위(kg/개/박스/세트 등)", "unitPrice": 단가(숫자), "supplyAmount": 공급가액(숫자), "taxAmount": 세액(숫자) }
    ],
    "supplyAmount": 공급가액합계(숫자),
    "taxAmount": 세액합계(숫자),
    "totalAmount": 합계금액(숫자),
    "memo": "특이사항 (없으면 빈 문자열)"
  }
}

규칙:
- purchaseDate: 문서에서 날짜 추출, 형식은 YYYY-MM-DD. 추출 불가 시 오늘 날짜.
- items가 없으면 [] 반환.
- 금액은 콤마 제거한 순수 숫자 (예: 1,250,000 → 1250000).
- reply에서 줄바꿈은 반드시 \\n 이스케이프 사용.`);

async function analyzePurchaseDocument(body: {
  fileContent?: string;
  fileName?: string;
  fileType?: string;
  text?: string;
}): Promise<FallbackResult> {
  const { fileContent, fileName, fileType, text } = body;
  let prompt = text || '이 매입 문서를 분석해주세요.';

  if ((fileType === 'csv' || fileType === 'excel') && fileContent) {
    prompt += `\n\n--- CSV 데이터: ${fileName} ---\n${fileContent}\n---`;
    return generateTextWithFallback({
      system: SYSTEM_INSTRUCTION,
      prompt,
      json: true,
      useCase: 'ocr',
    });
  }

  if (fileType === 'image' && fileContent) {
    const mimeType = fileContent.substring(fileContent.indexOf(':') + 1, fileContent.indexOf(';'));
    const base64Data = fileContent.split(',')[1];
    return generateVisionWithFallback({
      system: SYSTEM_INSTRUCTION,
      prompt,
      images: [{ base64: base64Data, mimeType }],
      json: true,
      useCase: 'ocr',
    });
  }

  return generateTextWithFallback({
    system: SYSTEM_INSTRUCTION,
    prompt,
    json: true,
    useCase: 'ocr',
  });
}

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId   = searchParams.get('storeId');
  const startDate = searchParams.get('startDate');
  const endDate   = searchParams.get('endDate');
  const id        = searchParams.get('id');

  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  try {
    if (id) {
      const doc = await adminDb.collection('purchase_records').doc(id).get();
      if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      return NextResponse.json({ record: { id: doc.id, ...doc.data() } });
    }

    let q = adminDb.collection('purchase_records').where('storeId', '==', storeId);
    if (startDate) q = q.where('purchaseDate', '>=', startDate) as any;
    if (endDate)   q = q.where('purchaseDate', '<=', endDate) as any;

    const snap = await (q as any).orderBy('purchaseDate', 'desc').limit(100).get();
    const records = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ records });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();

    // ── Save action ──
    if (body.action === 'save') {
      const { extractedData, uid, storeId, images } = body;
      // images: [{ name: string, content: string /* base64 dataURL */, mimeType?: string }]
      if (!extractedData || !uid || !storeId) {
        return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 });
      }

      // Firebase Storage에 원본 문서(이미지·PDF) 업로드 — 장기 보관
      const purchaseAttachments: PurchaseAttachment[] = [];
      if (Array.isArray(images) && images.length > 0) {
        try {
          const bucket = adminStorage.bucket();
          for (const img of images) {
            if (!img.content) continue;
            const base64 = img.content.includes(',') ? img.content.split(',')[1] : img.content;
            if (!base64) continue;
            const buffer = Buffer.from(base64, 'base64');
            const mimeType = img.mimeType
              || (img.content.includes('data:')
                ? img.content.slice(5, img.content.indexOf(';'))
                : mimeFromFileType(
                  String(img.name || '').toLowerCase().endsWith('.pdf') ? 'pdf' : 'image',
                ));
            const ext = extFromMime(mimeType, img.name);
            const token = uuidv4();
            const filePath = `purchase_images/${storeId}/${uid}/${Date.now()}_${token.slice(0, 8)}.${ext}`;
            const storageFile = bucket.file(filePath);
            await storageFile.save(buffer, {
              metadata: {
                contentType: mimeType,
                metadata: { firebaseStorageDownloadTokens: token },
              },
            });
            const bucketName = bucket.name;
            const url = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(filePath)}?alt=media&token=${token}`;
            purchaseAttachments.push({
              url,
              name: String(img.name || `원본.${ext}`).slice(0, 120),
              mimeType,
            });
          }
        } catch (uploadErr: unknown) {
          const msg = uploadErr instanceof Error ? uploadErr.message : String(uploadErr);
          console.error('원본 문서 업로드 실패:', msg);
        }
      }

      const imageUrls = purchaseAttachments.map(a => a.url);

      const docRef = await adminDb.collection('purchase_records').add({
        ...extractedData,
        uid,
        storeId,
        imageUrls,
        purchaseAttachments,
        createdAt: FieldValue.serverTimestamp(),
      });

      sendKakaoNotifyToStore(storeId, {
        title: '📦 매입 등록',
        message: `${extractedData.supplierName || '거래처'} ${Number(extractedData.totalAmount || 0).toLocaleString()}원`,
        link: `${process.env.NEXT_PUBLIC_APP_URL || 'https://pitaya-osv1.vercel.app'}/dashboard/report/purchases/ledger`,
      }).catch(() => {});
      sendKakaoNotifySafe({
        userId: uid,
        title: '📦 매입 등록',
        message: `${extractedData.supplierName || '거래처'} ${Number(extractedData.totalAmount || 0).toLocaleString()}원`,
        link: `${process.env.NEXT_PUBLIC_APP_URL || 'https://pitaya-osv1.vercel.app'}/dashboard/report/purchases/ledger`,
      });

      let expiryReminders: Awaited<ReturnType<typeof registerExpiryRemindersFromPurchase>> | undefined;
      try {
        const items = Array.isArray(extractedData.items) ? extractedData.items : [];
        expiryReminders = await registerExpiryRemindersFromPurchase({
          storeId,
          createdBy: uid,
          purchaseRecordId: docRef.id,
          items,
        });
        syncItemPricesForPurchase(
          storeId,
          docRef.id,
          String(extractedData.purchaseDate || ''),
          String(extractedData.supplierName || ''),
          extractedData.invoiceNumber,
          items,
        ).catch(err => console.error('[purchases/save] item_prices sync:', err));
      } catch (expErr) {
        console.error('[purchases/save] expiry reminders:', expErr);
      }

      return NextResponse.json({
        success: true,
        id: docRef.id,
        imageUrls,
        purchaseAttachments,
        expiryReminders,
      });
    }

    // ── Delete action ──
    if (body.action === 'delete') {
      const { id } = body;
      if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
      await adminDb.collection('purchase_records').doc(id).delete();
      return NextResponse.json({ success: true });
    }

    // ── AI analysis ──
    if (!hasAnyAiProvider()) {
      return NextResponse.json({ error: 'AI API 키 미설정', text: '⚠️ AI API 키가 설정되지 않았습니다.', parsedData: null }, { status: 503 });
    }

    const aiResult = await analyzePurchaseDocument(body);
    const responseText = stripJsonMarkdown(aiResult.text);

    let parsed;
    try {
      parsed = JSON.parse(responseText);
    } catch {
      const match = responseText.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('JSON 파싱 실패');
      parsed = JSON.parse(match[0]);
    }

    return NextResponse.json({ text: parsed.reply, parsedData: parsed.data, ...aiMetaJson(aiResult) });
  } catch (error: any) {
    const msg = error.message || '';
    let userMessage = '⚠️ 오류가 발생했습니다. 다시 시도해주세요.';
    if (msg.includes('503')) userMessage = '⚠️ AI 서버가 혼잡합니다. 잠시 후 재시도해주세요.';
    else if (isQuotaOrRateLimitError(error)) userMessage = '⚠️ 모든 AI API 한도가 초과되었습니다. 잠시 후 다시 시도해주세요.';
    else if (msg.includes('400')) userMessage = '⚠️ 이미지 처리 오류입니다. 다른 파일을 시도해주세요.';
    return NextResponse.json({ error: msg, text: userMessage, parsedData: null }, { status: 200 });
  }
}

export async function DELETE(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  try {
    await adminDb.collection('purchase_records').doc(id).delete();
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
