import type { AiProviderId } from '@/lib/aiProviderFallback';

export type AiModelKey = 'claude' | 'gpt4o' | 'gemini' | 'groq';

export type AiUseCase =
  | 'ocr'
  | 'chat'
  | 'insight'
  | 'prediction'
  | 'fast'
  | 'report';

const TEXT_POOL: AiProviderId[] = ['gemini', 'claude', 'gpt'];
const VISION_POOL: AiProviderId[] = ['claude', 'gpt', 'gemini'];

/** 용도별 1순위 AI (Groq는 항상 마지막 fallback) */
function primaryProvidersForUseCase(useCase: AiUseCase): AiProviderId[] {
  switch (useCase) {
    case 'ocr':
      return ['claude', 'gpt', 'gemini'];
    case 'report':
      return ['claude'];
    case 'insight':
    case 'fast':
      return ['gemini'];
    case 'prediction':
      return ['claude'];
    case 'chat':
      return ['gemini'];
    default:
      return ['gemini'];
  }
}

/**
 * 전체 AI 순차 fallback: [용도별 우선] + [나머지] + [Groq 마지막]
 * vision=true면 Groq 제외 (비전 미지원)
 */
export function buildFullFallbackOrder(
  primary: AiProviderId | AiProviderId[],
  opts?: { vision?: boolean },
): AiProviderId[] {
  const primaries = (Array.isArray(primary) ? primary : [primary]).filter(Boolean);
  const pool = opts?.vision ? VISION_POOL : TEXT_POOL;
  const ordered: AiProviderId[] = [];

  for (const p of primaries) {
    if (!ordered.includes(p)) ordered.push(p);
  }
  for (const p of pool) {
    if (!ordered.includes(p)) ordered.push(p);
  }
  if (!opts?.vision && !ordered.includes('groq')) {
    ordered.push('groq');
  }
  return ordered;
}

export function providerOrderForUseCase(useCase: AiUseCase, vision = false): AiProviderId[] {
  return buildFullFallbackOrder(primaryProvidersForUseCase(useCase), { vision })
    .filter(p => AI_MODELS[providerIdToModelKey(p)]?.available() ?? false);
}

function providerIdToModelKey(id: AiProviderId): AiModelKey {
  if (id === 'gpt') return 'gpt4o';
  if (id === 'groq') return 'groq';
  return id as AiModelKey;
}

export function chatRouteToProvider(route: ChatRouteModel): AiProviderId {
  switch (route) {
    case 'groq': return 'groq';
    case 'claude': return 'claude';
    case 'gpt4o': return 'gpt';
    case 'gemini': return 'gemini';
    default: return 'gemini';
  }
}

/** 대화 auto 모드 — 라우팅 1순위 + 전체 fallback (Groq 마지막) */
export function chatFallbackOrder(message: string): AiProviderId[] {
  const route = routeChatModel(message);
  return buildFullFallbackOrder(chatRouteToProvider(route))
    .filter(p => AI_MODELS[providerIdToModelKey(p)]?.available() ?? false);
}

export function providerIdToModelKeyForExclusion(id: AiProviderId): AiModelKey {
  return providerIdToModelKey(id);
}

export const AI_MODELS: Record<AiModelKey, { name: string; providerId: AiProviderId; available: () => boolean }> = {
  claude: {
    name: 'Claude Sonnet',
    providerId: 'claude',
    available: () => !!process.env.ANTHROPIC_API_KEY,
  },
  gpt4o: {
    name: 'GPT-4o',
    providerId: 'gpt',
    available: () => !!process.env.OPENAI_API_KEY,
  },
  gemini: {
    name: 'Gemini 2.0 Flash',
    providerId: 'gemini',
    available: () => !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
  },
  groq: {
    name: 'Groq Llama',
    providerId: 'groq',
    available: () => !!process.env.GROQ_API_KEY,
  },
};

export function modelKeyToProvider(key: AiModelKey): AiProviderId {
  return AI_MODELS[key].providerId;
}

/** 용도별 AI 우선순위 (키 있는 것만) */
export function selectModels(useCase: AiUseCase): AiModelKey[] {
  let keys: AiModelKey[];
  switch (useCase) {
    case 'ocr':
      keys = ['claude', 'gpt4o', 'gemini'];
      break;
    case 'chat':
      keys = ['groq', 'gemini', 'claude'];
      break;
    case 'insight':
    case 'fast':
      keys = ['groq', 'gemini'];
      break;
    case 'prediction':
      keys = ['claude', 'gpt4o', 'gemini'];
      break;
    case 'report':
      keys = ['claude', 'gpt4o', 'gemini'];
      break;
    default:
      keys = ['groq'];
  }
  return keys.filter(k => AI_MODELS[k].available());
}

export function classifyAiExclusion(err: unknown, modelKey?: AiModelKey): string {
  const name = modelKey ? AI_MODELS[modelKey].name : 'AI';
  const msg = err instanceof Error ? err.message : String(err ?? '');

  if (/no key|미설정|API_KEY/i.test(msg)) return `${name}: API 키 미설정 — 분석에서 제외`;
  if (/429|rate limit|quota exceeded|exceeded your current quota|resource_exhausted|free_tier/i.test(msg)) {
    return `${name}: 무료티어/요청 한도 초과 — 분석에서 제외`;
  }
  if (/503|overloaded|capacity/i.test(msg)) return `${name}: 서버 혼잡 — 분석에서 제외`;
  if (/401|403|authentication|unauthorized|invalid.*api.*key/i.test(msg)) {
    return `${name}: API 키 오류 — 분석에서 제외`;
  }
  if (/JSON|parse|파싱/i.test(msg)) return `${name}: 응답 파싱 실패 — 분석에서 제외`;
  if (/timeout|timed out|deadline/i.test(msg)) return `${name}: 응답 시간 초과 — 분석에서 제외`;
  if (/model.*not found|does not exist/i.test(msg)) return `${name}: 모델명 오류 — 분석에서 제외`;
  if (/billing|credit balance|insufficient/i.test(msg)) return `${name}: 결제/크레딧 한도 — 분석에서 제외`;

  const short = msg.length > 80 ? msg.slice(0, 80) + '…' : msg;
  return `${name}: ${short || '알 수 없는 오류'} — 분석에서 제외`;
}

/** 대화모드 — 질문 성격별 라우팅 */
export type ChatRouteModel = 'groq' | 'claude' | 'gemini' | 'gpt4o';

export function routeChatModel(message: string): ChatRouteModel {
  const text = message.trim();
  const isCalculation = /계산|합계|금액|매출|비교|몇\s*원|퍼센트|%|증감|평균/.test(text);
  const isDocument = /분석|요약|정리|설명|검토|리포트|전략|운영|제안/.test(text);
  const isComplex = text.length > 120 || /왜|어떻게|원인|대안|시나리오/.test(text);
  const isSimple = text.length < 50 && !isDocument;

  if (isSimple || isCalculation) {
    if (AI_MODELS.groq.available()) return 'groq';
  }
  if (isComplex && AI_MODELS.gpt4o.available()) return 'gpt4o';
  if (isDocument) {
    if (AI_MODELS.claude.available()) return 'claude';
  }
  if (AI_MODELS.gemini.available()) return 'gemini';
  if (AI_MODELS.groq.available()) return 'groq';
  if (AI_MODELS.claude.available()) return 'claude';
  if (AI_MODELS.gpt4o.available()) return 'gpt4o';
  return 'gemini';
}

export function chatRouteToModelChoice(route: ChatRouteModel): 'gemini' | 'claude' | 'gpt' | 'groq-llama' {
  switch (route) {
    case 'groq': return 'groq-llama';
    case 'claude': return 'claude';
    case 'gpt4o': return 'gpt';
    case 'gemini': return 'gemini';
    default: return 'gemini';
  }
}

export const CHAT_ROUTE_LABELS: Record<ChatRouteModel, string> = {
  groq: 'Groq (빠른 계산/단답)',
  claude: 'Claude (문서/한국어)',
  gemini: 'Gemini (일반 대화)',
  gpt4o: 'GPT-4o (복잡 분석)',
};
