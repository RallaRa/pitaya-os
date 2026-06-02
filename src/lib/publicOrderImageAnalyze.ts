import {
  generateVisionWithFallback,
  stripJsonMarkdown,
  hasAnyAiProvider,
} from '@/lib/aiProviderFallback';
import type { PublicOrderLineInput } from '@/lib/publicOrderChatExecutor';
import type { ChatImageInput } from '@/lib/publicOrderImageUpload';

export interface VisionLineResult extends PublicOrderLineInput {
  imageIndex?: number;
}

export interface PublicOrderVisionResult {
  reply: string;
  sessionTitle?: string;
  lines: VisionLineResult[];
}

const VISION_SYSTEM = `정육점 공개주문 품목 사진을 분석합니다.
각 사진에서 품목명·설명·원산지·가격(보이면)·단위·수량(추정)을 추출해 JSON만 반환하세요.

반환 형식:
{
  "reply": "사용자에게 보여줄 한국어 요약 (인식한 품목·가격 등)",
  "sessionTitle": "회차 제목 제안 (없으면 null)",
  "lines": [
    {
      "imageIndex": 0,
      "name": "품목명(필수)",
      "description": "설명",
      "origin": "원산지",
      "normalPrice": 0,
      "discountPrice": 0,
      "unit": "kg",
      "totalQty": 10
    }
  ]
}

규칙:
- 사진 1장당 lines 1개 (imageIndex는 0부터)
- 가격이 사진에 없으면 0
- 품목명은 한국어로 구체적으로 (예: 한우 등심, 한돈 삼겹살)
- JSON만, 마크다운 금지`;

export async function analyzePublicOrderImages(
  images: ChatImageInput[],
  userMessage: string,
): Promise<PublicOrderVisionResult> {
  if (!hasAnyAiProvider() || images.length === 0) {
    return { reply: '', lines: [] };
  }

  const visionParts = images.map(img => {
    const base64 = img.fileContent.includes(',')
      ? img.fileContent.split(',')[1]
      : img.fileContent;
    return {
      base64,
      mimeType: img.mimeType || 'image/jpeg',
    };
  });

  const prompt = userMessage.trim()
    ? `사용자 요청: ${userMessage}\n\n첨부 사진 ${images.length}장을 분석해 품목 정보를 JSON으로 반환하세요.`
    : `첨부 사진 ${images.length}장을 분석해 공개주문 품목 JSON을 반환하세요.`;

  try {
    const result = await generateVisionWithFallback({
      system: VISION_SYSTEM,
      prompt,
      images: visionParts,
      json: true,
      useCase: 'ocr',
    });

    const cleaned = stripJsonMarkdown(result.text);
    const parsed = JSON.parse(cleaned) as PublicOrderVisionResult;
    return {
      reply: String(parsed.reply || '사진에서 품목을 인식했습니다'),
      sessionTitle: parsed.sessionTitle || undefined,
      lines: Array.isArray(parsed.lines)
        ? parsed.lines.map((l, i) => ({
            ...l,
            imageIndex: l.imageIndex ?? i,
            name: String(l.name || `품목 ${i + 1}`).trim(),
          }))
        : [],
    };
  } catch {
    return {
      reply: '사진 분석에 실패했습니다. 품목명을 텍스트로 함께 적어 주세요.',
      lines: images.map((_, i) => ({
        imageIndex: i,
        name: userMessage.trim() || `사진 품목 ${i + 1}`,
        totalQty: 10,
        unit: 'kg',
      })),
    };
  }
}
