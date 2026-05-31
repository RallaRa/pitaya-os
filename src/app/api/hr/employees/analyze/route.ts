import { NextResponse } from 'next/server';
import { adminStorage } from '@/lib/firebase/admin';
import { verifyToken } from '@/lib/authVerify';
import { isAdminOrAbove } from '@/lib/auth/permissions';
import { adminDb } from '@/lib/firebase/admin';
import { generateVisionWithFallback, hasAnyAiProvider, stripJsonMarkdown } from '@/lib/aiProviderFallback';
import { aiMetaJson } from '@/lib/aiProviderMeta';
import type { HrDocTypeId } from '@/lib/hrEmployeeDocs';

const DOC_PROMPTS: Record<HrDocTypeId, string> = {
  employment_contract: `한국 근로계약서(고용계약서) 이미지/PDF를 분석하여 아래 JSON만 반환하세요 (마크다운·설명 없이):
{"name":"근로자 성명","nameEn":"영문명 또는 null","birthDate":"생년월일 YYYY-MM-DD 또는 null","gender":"남/여 또는 null","phone":"연락처","personalEmail":"이메일 또는 null","address":"주소","hireDate":"입사일 YYYY-MM-DD 또는 null","probationEndDate":"수습종료일 YYYY-MM-DD 또는 null","department":"부서","position":"직급","jobTitle":"직책 또는 null","employmentType":"정규직/계약직/파트타임 등","duties":"담당업무","baseSalary":기본급 숫자 또는 null,"mealAllowance":식대 숫자 또는 null,"transportAllowance":교통비 숫자 또는 null,"payDay":급여지급일 숫자 또는 null,"workStart":"09:00 형식","workEnd":"18:00 형식"}`,

  health_certificate: `한국 보건증·식품위생교육 이수증 이미지/PDF를 분석하여 아래 JSON만 반환하세요 (마크다운·설명 없이):
{"name":"성명","certName":"교육/자격명","issueDate":"이수일 YYYY-MM-DD 또는 null","expiryDate":"만료일 YYYY-MM-DD 또는 null","hygieneCertDate":"이수일 YYYY-MM-DD 또는 null","hygieneCertExpiry":"만료일 YYYY-MM-DD 또는 null","issuingOrg":"발급기관 또는 null"}`,

  bank_account: `통장 사본·급여계좌 확인서 이미지/PDF를 분석하여 아래 JSON만 반환하세요 (마크다운·설명 없이):
{"bankName":"은행명","accountNumber":"계좌번호(하이픈 포함 가능)","accountHolder":"예금주"}`,
};

async function checkAdmin(req: Request) {
  const user = await verifyToken(req);
  if (!user) return null;
  const userDoc = await adminDb.collection('users').doc(user.uid).get();
  const data = userDoc.data();
  if (!isAdminOrAbove(data?.groupId || 'staff', data?.email)) return null;
  return user;
}

export async function POST(req: Request) {
  const admin = await checkAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  if (!hasAnyAiProvider()) {
    return NextResponse.json({ error: 'AI API 키 미설정' }, { status: 503 });
  }

  try {
    const body = await req.json();
    const { docType, fileContent: directContent, mimeType: directMime, filePath } = body as {
      docType: HrDocTypeId;
      fileContent?: string;
      mimeType?: string;
      filePath?: string;
    };

    if (!docType || !DOC_PROMPTS[docType]) {
      return NextResponse.json({ error: 'docType 필수' }, { status: 400 });
    }

    let base64: string;
    let mimeType: string;

    if (filePath) {
      const [fileBuffer] = await adminStorage.bucket().file(filePath).download();
      base64 = fileBuffer.toString('base64');
      mimeType = directMime || 'image/jpeg';
    } else if (directContent) {
      base64 = directContent.includes(',') ? directContent.split(',')[1] : directContent;
      mimeType = directMime || 'image/jpeg';
    } else {
      return NextResponse.json({ error: 'fileContent 또는 filePath 필요' }, { status: 400 });
    }

    const isImage = mimeType.startsWith('image/');
    const isPdf = mimeType === 'application/pdf';
    if (!isImage && !isPdf) {
      return NextResponse.json({ error: '이미지(JPG/PNG) 또는 PDF만 분석 가능합니다.' }, { status: 400 });
    }

    const result = await generateVisionWithFallback({
      prompt: DOC_PROMPTS[docType],
      images: [{ base64, mimeType }],
      json: true,
      useCase: 'ocr',
    });

    const cleaned = stripJsonMarkdown(result.text);
    let extracted: Record<string, unknown>;
    try {
      extracted = JSON.parse(cleaned);
    } catch {
      return NextResponse.json({ error: 'AI 응답 파싱 실패', raw: result.text }, { status: 500 });
    }

    return NextResponse.json({ success: true, extracted, docType, ...aiMetaJson(result) });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
