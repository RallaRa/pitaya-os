import { buildMarketingRecommendations } from '@/lib/marketing/couponRecommendation.server';
import {
  detectMarketingRecommendIntent,
  summarizeRecommendations,
  type MarketingRecommendation,
} from '@/lib/marketing/couponRecommendation';

export interface MarketingRecommendFromChatResult {
  triggered: boolean;
  generated: boolean;
  summary?: string;
  data?: {
    generatedAt: string;
    recommendationCount: number;
    segmentCounts: Record<string, number>;
    items: MarketingRecommendation[];
  };
  error?: string;
}

export async function tryBuildMarketingRecommendFromAiChat(opts: {
  storeId: string;
  message: string;
  includePii?: boolean;
}): Promise<MarketingRecommendFromChatResult> {
  const { storeId, message, includePii = false } = opts;
  if (!storeId || !detectMarketingRecommendIntent(message)) {
    return { triggered: false, generated: false };
  }

  try {
    const result = await buildMarketingRecommendations(storeId, {
      includePii,
      limit: includePii ? undefined : 500,
    });
    return {
      triggered: true,
      generated: true,
      summary: summarizeRecommendations(result.items),
      data: {
        generatedAt: result.generatedAt,
        recommendationCount: result.recommendationCount,
        segmentCounts: result.segmentCounts,
        items: result.items,
      },
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { triggered: true, generated: false, error: msg };
  }
}

export function buildMarketingChatAppendix(
  chatResult: MarketingRecommendFromChatResult,
): string {
  if (!chatResult.triggered || !chatResult.generated || !chatResult.summary) return '';
  return `\n\n---\n📋 **마케팅 추천 리스트**\n${chatResult.summary}`;
}
