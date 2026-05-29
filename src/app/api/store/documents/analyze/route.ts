import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, adminStorage } from '@/lib/firebase/admin';
import { verifyToken } from '@/lib/authVerify';
import { trackTokens } from '@/lib/trackUsage';

const DOC_PROMPTS: Record<string, string> = {
  business_registration: `한국 사업자등록증 이미지를 분석하여 아래 JSON만 반환하세요 (마크다운·설명 없이):
{"businessNumber":"사업자등록번호(예:123-45-67890)","ownerName":"대표자명","storeName":"상호(법인명)","address":"사업장주소","businessType":"업태","businessItem":"종목","openDate":"개업연월일 YYYY-MM-DD 또는 null"}`,

  sanitation_permit: `한국 위생허가증/영업허가증 이미지를 분석하여 아래 JSON만 반환하세요 (마크다운·설명 없이):
{"permitNumber":"허가번호","businessName":"업소명","ownerName":"대표자","address":"소재지","businessType":"업종","issueDate":"허가일 YYYY-MM-DD 또는 null","expiryDate":"만료일 YYYY-MM-DD 또는 null"}`,

  online_sales_permit: `한국 통신판매업 신고증 이미지를 분석하여 아래 JSON만 반환하세요 (마크다운·설명 없이):
{"reportNumber":"신고번호","businessName":"상호","ownerName":"대표자","address":"사업장주소","reportDate":"신고일 YYYY-MM-DD 또는 null","expiryDate":"갱신일 YYYY-MM-DD 또는 null"}`,

  business_account: `통장 사본 이미지를 분석하여 아래 JSON만 반환하세요 (마크다운·설명 없이):
{"bankName":"은행명","accountNumber":"계좌번호","accountHolder":"예금주"}`,

  other: `이 문서 이미지를 분석하여 아래 JSON만 반환하세요 (마크다운·설명 없이):
{"title":"문서명","issuingOrg":"발급기관","issueDate":"발급일 YYYY-MM-DD 또는 null","expiryDate":"만료일 YYYY-MM-DD 또는 null","summary":"주요내용 한 줄 요약"}`,
};

export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY 미설정' }, { status: 503 });
  }

  const body = await req.json();
  const { docId, fileContent: directContent, mimeType: directMime, docType: directType } = body;

  let base64: string;
  let mimeType: string;
  let docType: string;

  if (docId) {
    const snap = await adminDb.collection('store_documents').doc(docId).get();
    if (!snap.exists) return NextResponse.json({ error: '문서 없음' }, { status: 404 });

    const data = snap.data() as any;
    docType = data.docType;
    mimeType = data.mimeType || 'image/jpeg';

    const [fileBuffer] = await adminStorage.bucket().file(data.filePath).download();
    base64 = fileBuffer.toString('base64');
  } else if (directContent) {
    base64 = directContent.includes(',') ? directContent.split(',')[1] : directContent;
    mimeType = directMime || 'image/jpeg';
    docType = directType || 'other';
  } else {
    return NextResponse.json({ error: 'docId 또는 fileContent 필요' }, { status: 400 });
  }

  const isImage = mimeType.startsWith('image/');
  const isPdf = mimeType === 'application/pdf';
  if (!isImage && !isPdf) {
    return NextResponse.json({ error: '이미지(JPG/PNG) 또는 PDF만 분석 가능합니다.' }, { status: 400 });
  }

  const prompt = DOC_PROMPTS[docType] ?? DOC_PROMPTS.other;

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const contentBlock = isPdf
      ? {
          type: 'document' as const,
          source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: base64 },
        }
      : {
          type: 'image' as const,
          source: { type: 'base64' as const, media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: base64 },
        };

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [contentBlock, { type: 'text' as const, text: prompt }],
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    trackTokens('claude', response.usage.input_tokens, response.usage.output_tokens).catch(() => {});

    const cleaned = text.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim();

    let extracted: Record<string, any>;
    try {
      extracted = JSON.parse(cleaned);
    } catch {
      return NextResponse.json({ error: 'AI 응답 파싱 실패', raw: text }, { status: 500 });
    }

    if (docId) {
      await adminDb.collection('store_documents').doc(docId).update({
        extractedData: extracted,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    return NextResponse.json({ success: true, extracted, docType });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
