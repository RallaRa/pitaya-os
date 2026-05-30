import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { compressBase64Image, estimateBase64Bytes } from '@/lib/compressImageServer';
import {
  formatAiError,
  generateTextWithFallback,
  hasAnyAiProvider,
  isQuotaOrRateLimitError,
  stripJsonMarkdown,
} from '@/lib/aiProviderFallback';
import {
  ensembleOcr,
} from '@/lib/ensembleOcr';
import { applyAliasesToInvoices, loadStoreAliases } from '@/lib/applyItemAliases';
import {
  formatAiTag,
  formatEnsembleReplyBlock,
  formatFileResultLine,
  type FileAnalysisMeta,
} from '@/lib/purchaseAiLabels';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const VERCEL_BODY_LIMIT = 4.2 * 1024 * 1024;

function stripBase64Data(content: string): string {
  const trimmed = content.trim();
  if (trimmed.startsWith('data:')) {
    const comma = trimmed.indexOf(',');
    return comma >= 0 ? trimmed.slice(comma + 1) : trimmed;
  }
  return trimmed;
}

function extractMimeType(content: string, fallback = 'image/jpeg'): string {
  const match = content.match(/^data:([^;]+);base64,/);
  return match?.[1] || fallback;
}

const SYSTEM_INSTRUCTION = `당신은 한국 정육점·식자재 매입 문서(거래명세서, 세금계산서, 매입전표, 영수증) 전문 OCR·분석 AI입니다.

작업:
1. 이미지/PDF에서 **모든 글자**를 읽는다 (작은 글씨, 표, 손글씨 포함).
2. 공급업체·날짜·품목·수량·단가·공급가·세액·합계를 추출한다.
3. 아래 JSON **배열**만 반환한다 (마크다운·설명 금지).

[
  {
    "purchaseDate": "YYYY-MM-DD",
    "supplierName": "공급업체명",
    "invoiceNumber": "전표번호 (없으면 빈 문자열)",
    "items": [
      {
        "name": "품명",
        "qty": 수량(숫자),
        "unit": "kg|개|박스 등",
        "unitPrice": 단가(숫자),
        "supplyAmount": 공급가액(숫자),
        "taxAmount": 세액(숫자),
        "traceNo": "이력번호 (없으면 빈 문자열)",
        "origin": "원산지",
        "cut": "부위",
        "grade": "등급"
      }
    ],
    "supplyAmount": 공급가액합계,
    "taxAmount": 세액합계,
    "totalAmount": 합계금액,
    "paymentMethod": "현금|카드|외상|이체",
    "memo": "특이사항"
  }
]

규칙:
- 글자가 흐려도 **추정 가능한 숫자·품목명은 반드시 포함**. 빈 배열 [] 반환 금지 (최소 1건 객체).
- supplierName을 못 읽으면 "미확인" + items 또는 totalAmount라도 채운다.
- 금액 콤마 제거 (1,250,000 → 1250000).
- 여러 장/여러 업체 → 각각 별도 객체.
- 정육: 이력번호·원산지·부위·등급 있으면 추출.`;

function normalizeInvoice(raw: Record<string, unknown>) {
  const items = Array.isArray(raw.items) ? raw.items : [];
  const supplierName = String(raw.supplierName || '').trim() || (items.length ? '미확인' : '');
  const { _conflicts, ...rest } = raw;
  return {
    ...rest,
    supplierName,
    items,
    totalAmount: Number(raw.totalAmount || 0),
    supplyAmount: Number(raw.supplyAmount || 0),
    taxAmount: Number(raw.taxAmount || 0),
    _conflicts,
  };
}

function isValidInvoice(inv: Record<string, unknown>): boolean {
  if (!inv) return false;
  const name = String(inv.supplierName || '').trim();
  const items = Array.isArray(inv.items) ? inv.items : [];
  const hasItems = items.some((it: { name?: string; qty?: number }) =>
    String(it?.name || '').trim() || Number(it?.qty || 0) > 0,
  );
  const hasTotal = Number(inv.totalAmount || 0) > 0 || Number(inv.supplyAmount || 0) > 0;
  return !!(name && name !== '미확인' ? true : hasItems || hasTotal);
}

function parseInvoices(text: string) {
  const cleaned = stripJsonMarkdown(text);
  const candidates: unknown[] = [];

  const tryParse = (raw: string) => {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  let parsed = tryParse(cleaned);
  if (!parsed) {
    const arrMatch = cleaned.match(/\[[\s\S]*\]/);
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    parsed = arrMatch ? tryParse(arrMatch[0]) : objMatch ? tryParse(objMatch[0]) : null;
  }

  if (!parsed) return [];

  if (Array.isArray(parsed)) {
    candidates.push(...parsed);
  } else if (parsed && typeof parsed === 'object') {
    const p = parsed as Record<string, unknown>;
    if (Array.isArray(p.invoices)) candidates.push(...p.invoices);
    else if (Array.isArray(p.data)) candidates.push(...p.data);
    else candidates.push(parsed);
  }

  return candidates
    .map(c => normalizeInvoice(c as Record<string, unknown>))
    .filter(isValidInvoice);
}

async function prepareImageContent(content: string, fileName: string) {
  const normalized = content.startsWith('data:')
    ? content
    : `data:image/jpeg;base64,${stripBase64Data(content)}`;

  const { data, mimeType } = await compressBase64Image(normalized);
  const base64Data = stripBase64Data(data);
  if (estimateBase64Bytes(base64Data) > MAX_IMAGE_BYTES) {
    console.warn(`[analyze-multi] 이미지 용량 초과: ${fileName}`);
    return null;
  }
  return { base64Data, mimeType };
}

export async function POST(req: Request) {
  try {
    const authUser = await verifyToken(req);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasAnyAiProvider()) {
      return NextResponse.json({ error: 'AI API 키가 설정되지 않았습니다.' }, { status: 500 });
    }

    let body: any;
    try {
      const rawText = await req.text();
      if (!rawText) return NextResponse.json({ error: '요청 본문이 비어 있습니다.' }, { status: 400 });
      if (rawText.length > VERCEL_BODY_LIMIT) {
        return NextResponse.json({ error: '이미지 용량이 너무 큽니다.' }, { status: 413 });
      }
      body = JSON.parse(rawText);
    } catch {
      return NextResponse.json({ error: '요청 파싱 실패. 파일 크기를 줄여주세요.' }, { status: 400 });
    }

    const { files, message, storeId } = body;
    if (!Array.isArray(files) || files.length === 0) {
      return NextResponse.json({ error: '분석할 파일이 없습니다.' }, { status: 400 });
    }

    console.log(`[analyze-multi] start user=${authUser.uid} files=${files.length} ensemble=1`);

    const imageFiles = files.filter((f: any) => f.type === 'image' || f.type === 'pdf');
    const textFiles  = files.filter((f: any) => f.type !== 'image' && f.type !== 'pdf');
    const storeAliases = storeId ? await loadStoreAliases(storeId) : [];

    const fileNotes: string[] = [];
    const fileResults: FileAnalysisMeta[] = [];
    const allInvoices: any[] = [];
    const allEnsemble: unknown[] = [];
    const allConflicts: unknown[] = [];

    for (const file of imageFiles) {
      if (!file.content) continue;

      const prepared = file.type === 'image'
        ? await prepareImageContent(file.content, file.name || 'image')
        : {
            base64Data: stripBase64Data(file.content),
            mimeType: extractMimeType(file.content, 'application/pdf'),
          };

      if (!prepared?.base64Data) {
        fileNotes.push(`${file.name}: 용량 초과 — 더 작은 파일로 시도`);
        continue;
      }

      const { base64Data, mimeType } = prepared;
      const userPrompt = [
        message?.trim(),
        '거래명세서/세금계산서의 품목·수량·단가·합계를 모두 추출하세요.',
      ].filter(Boolean).join('\n');

      const ensembleResult = await ensembleOcr(base64Data, mimeType, {
        storeId: storeId || '',
        userPrompt,
      });

      allEnsemble.push({
        fileName: file.name,
        individual: ensembleResult.individual,
        confidence: ensembleResult.confidence,
        exclusions: ensembleResult.exclusions,
      });
      allConflicts.push(...ensembleResult.conflicts);

      const normalized = ensembleResult.merged
        .map(inv => normalizeInvoice(inv))
        .filter(isValidInvoice);

      console.log(`[analyze-multi] file=${file.name} confidence=${ensembleResult.confidence}% invoices=${normalized.length}`);

      fileResults.push({
        fileName: file.name || 'image',
        provider: 'ensemble',
        model: 'claude+gpt4o+gemini',
        attempt: 1,
        invoiceCount: normalized.length,
        success: normalized.length > 0,
        ensemble: ensembleResult.individual.map(ind => ({
          ai: ind.ai,
          modelKey: ind.modelKey,
          success: ind.success,
          invoiceCount: ind.invoiceCount,
          exclusionReason: ind.exclusionReason,
        })),
        confidence: ensembleResult.confidence,
        exclusions: ensembleResult.exclusions,
        conflicts: ensembleResult.conflicts,
      });

      if (normalized.length === 0) {
        const failedAis = ensembleResult.exclusions.length
          ? ensembleResult.exclusions.join(' / ')
          : '모든 AI 추출 실패';
        fileNotes.push(`${file.name}: ${failedAis}`);
      } else {
        allInvoices.push(...normalized.map((inv: Record<string, unknown>) => ({
          ...inv,
          aiTag: ensembleResult.aiTag,
          _originalAiResult: { ...inv },
          _conflicts: inv._conflicts || (ensembleResult.conflicts.length ? ensembleResult.conflicts : undefined),
        })));
      }

      await new Promise(r => setTimeout(r, 200));
    }

    if (textFiles.length > 0) {
      const textPrompt = [
        message?.trim(),
        ...textFiles.map((file: any) => file.content ? `[파일: ${file.name}]\n${file.content}` : ''),
      ].filter(Boolean).join('\n\n');

    const { text, provider, model } = await generateTextWithFallback({
        system: SYSTEM_INSTRUCTION,
        prompt: textPrompt,
        json: true,
        useCase: 'ocr',
      });
      const aiTag = formatAiTag(provider, model);
      const parsed = parseInvoices(text);
      const names = textFiles.map((f: { name?: string }) => f.name || 'text').join(', ');
      fileResults.push({
        fileName: names,
        provider,
        model,
        attempt: 1,
        invoiceCount: parsed.length,
        success: parsed.length > 0,
      });
      if (parsed.length) {
        allInvoices.push(...parsed.map(inv => ({
          ...inv,
          aiTag,
          _originalAiResult: { ...inv },
        })));
      } else {
        fileNotes.push('텍스트 파일: 매입 항목 추출 실패');
      }
    }

    const invoices = allInvoices;
    const aliasResult = storeAliases.length
      ? applyAliasesToInvoices(invoices, storeAliases)
      : { invoices, applied: [] as Array<{ from: string; to: string; supplierName?: string }> };
    const finalInvoices = aliasResult.invoices;
    const avgConfidence = fileResults.length
      ? Math.round(fileResults.reduce((s, f) => s + (f.confidence ?? 100), 0) / fileResults.length)
      : 0;

    let reply = finalInvoices.length > 0
      ? `${finalInvoices.length}건의 매입 내역을 추출했습니다 (앙상블 신뢰도 ${avgConfidence}%). 시트에서 내용을 확인·수정 후 저장하세요.`
      : '문서에서 매입 내역을 추출하지 못했습니다.';

    if (aliasResult.applied.length > 0) {
      const preview = aliasResult.applied.slice(0, 5).map(a => `${a.from}→${a.to}`).join(', ');
      reply += `\n\n📚 **알리아스 자동 적용** ${aliasResult.applied.length}건 (${preview}${aliasResult.applied.length > 5 ? '…' : ''})`;
    }

    if (finalInvoices.length === 0) {
      reply += '\n\n💡 **개선 방법**\n• 밝은 곳에서 그림자 없이 전체 촬영\n• PDF 원본 업로드 (스크린샷보다 정확)\n• "품목명과 금액이 보이게 다시 분석"이라고 함께 입력';
    }

    const ensembleBlock = formatEnsembleReplyBlock(fileResults);
    if (ensembleBlock) {
      reply += ensembleBlock;
    } else if (fileResults.length > 0) {
      reply += `\n\n🏷️ **AI 분석 이력**\n${fileResults.map(formatFileResultLine).join('\n')}`;
    }

    if (fileNotes.length > 0) {
      reply += `\n\n⚠️ ${fileNotes.join('\n')}`;
    }

    const conflictNote = allConflicts.length > 0
      ? `\n\n⚠️ AI 간 불일치 ${allConflicts.length}건 — 다수결·중앙값으로 합산했습니다. 시트에서 확인하세요.`
      : '';
    reply += conflictNote;

    console.log(`[analyze-multi] done invoices=${finalInvoices.length}`);
    return NextResponse.json({
      invoices: finalInvoices,
      reply,
      qualities: [],
      fileResults,
      fileNotes,
      ensemble: allEnsemble,
      conflicts: allConflicts,
      confidence: avgConfidence,
    });
  } catch (e: any) {
    const msg = formatAiError(e);
    console.error('[analyze-multi]', msg, e?.stack);
    let userError = e?.message || 'AI 분석 실패';
    let status = 500;
    if (msg.includes('503') || msg.includes('overloaded')) userError = 'AI 서버가 혼잡합니다. 잠시 후 재시도해주세요.';
    else if (isQuotaOrRateLimitError(e)) userError = '모든 AI API 한도가 초과되었습니다. 잠시 후 다시 시도해주세요.';
    else if (msg.toLowerCase().includes('too large') || msg.includes('413')) {
      userError = '이미지 용량이 너무 큽니다.';
      status = 413;
    }
    return NextResponse.json({ error: userError, detail: msg.slice(0, 300) }, { status });
  }
}
