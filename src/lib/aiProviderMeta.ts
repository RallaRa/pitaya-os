import type { AiProviderId, FallbackResult } from '@/lib/aiProviderFallback';
import { providerDisplayName, formatAiTag } from '@/lib/purchaseAiLabels';

export interface AiResponseMeta {
  provider: AiProviderId;
  model: string;
  label: string;
  tag: string;
  exclusions?: string[];
}

export function fallbackResultToMeta(result: FallbackResult): AiResponseMeta {
  return {
    provider: result.provider,
    model: result.model,
    label: providerDisplayName(result.provider),
    tag: formatAiTag(result.provider, result.model),
    exclusions: result.exclusions?.length ? result.exclusions : undefined,
  };
}

export function aiMetaJson(result: FallbackResult) {
  return { ai: fallbackResultToMeta(result) };
}
