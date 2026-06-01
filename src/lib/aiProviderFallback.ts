import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import Groq from 'groq-sdk';
import { trackTokens, trackUsage } from '@/lib/trackUsage';
import {
  buildFullFallbackOrder,
  classifyAiExclusion,
  providerIdToModelKeyForExclusion,
  providerOrderForUseCase,
  type AiUseCase,
} from '@/lib/aiRouter';

export type AiProviderId = 'gemini' | 'claude' | 'gpt' | 'groq';

export interface FallbackResult {
  text: string;
  provider: AiProviderId;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  /** fallback 중 제외된 AI와 사유 */
  exclusions?: string[];
}

export interface VisionPart {
  base64: string;
  mimeType: string;
}

export interface TextGenerateOptions {
  prompt: string;
  system?: string;
  json?: boolean;
  temperature?: number;
  order?: AiProviderId[];
  /** order 미지정 시 용도별 전체 fallback (Groq 마지막) */
  useCase?: AiUseCase;
}

export interface VisionGenerateOptions {
  prompt?: string;
  system?: string;
  images: VisionPart[];
  json?: boolean;
  order?: AiProviderId[];
  useCase?: AiUseCase;
}

const GEMINI_MODEL = 'gemini-2.0-flash';
const CLAUDE_MODEL = 'claude-sonnet-4-6';
const GPT_MODEL = 'gpt-4o';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

const DEFAULT_TEXT_ORDER: AiProviderId[] = buildFullFallbackOrder(['gemini']);
const DEFAULT_VISION_ORDER: AiProviderId[] = buildFullFallbackOrder(['claude'], { vision: true });

function formatError(err: unknown): string {
  if (!err || typeof err !== 'object') return String(err);
  const e = err as { message?: string; status?: number; statusText?: string; errorDetails?: unknown };
  const parts = [e.message, e.status ? `HTTP ${e.status}` : '', e.statusText].filter(Boolean);
  if (e.errorDetails) {
    try { parts.push(JSON.stringify(e.errorDetails)); } catch { /* ignore */ }
  }
  return parts.join(' | ') || 'Unknown AI error';
}

export function isQuotaOrRateLimitError(err: unknown): boolean {
  const msg = formatError(err);
  return /429|rate limit|quota exceeded|exceeded your current quota|resource_exhausted|free_tier/i.test(msg);
}

export function isOverloadError(err: unknown): boolean {
  const msg = formatError(err);
  return /503|overloaded|capacity/i.test(msg);
}

function parseOrder(raw: string | undefined, fallback: AiProviderId[]): AiProviderId[] {
  if (!raw?.trim()) return fallback;
  const valid = new Set<AiProviderId>(['gemini', 'claude', 'gpt', 'groq']);
  const parsed = raw.split(',').map(s => s.trim().toLowerCase() as AiProviderId).filter(p => valid.has(p));
  return parsed.length > 0 ? parsed : fallback;
}

export function getTextFallbackOrder(useCase?: AiUseCase): AiProviderId[] {
  if (useCase) return providerOrderForUseCase(useCase);
  return parseOrder(process.env.AI_PROVIDER_FALLBACK_ORDER, DEFAULT_TEXT_ORDER);
}

export function getVisionFallbackOrder(useCase?: AiUseCase): AiProviderId[] {
  if (useCase) return providerOrderForUseCase(useCase, true);
  return parseOrder(
    process.env.AI_VISION_FALLBACK_ORDER || process.env.AI_PROVIDER_FALLBACK_ORDER,
    DEFAULT_VISION_ORDER,
  );
}

export function hasProviderKey(provider: AiProviderId): boolean {
  switch (provider) {
    case 'gemini': return !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_CLOUD_API_KEY);
    case 'claude': return !!process.env.ANTHROPIC_API_KEY;
    case 'gpt':    return !!process.env.OPENAI_API_KEY;
    case 'groq':   return !!process.env.GROQ_API_KEY;
    default:       return false;
  }
}

export function hasAnyAiProvider(order?: AiProviderId[]): boolean {
  const list = order ?? getTextFallbackOrder();
  return list.some(hasProviderKey);
}

function geminiKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_CLOUD_API_KEY || '';
}

function jsonPromptSuffix(json: boolean) {
  return json
    ? '\n\n반드시 유효한 JSON만 반환하세요. 마크다운 코드블록(```)이나 설명 텍스트는 포함하지 마세요.'
    : '';
}

async function callGeminiText(opts: TextGenerateOptions): Promise<FallbackResult> {
  const genAI = new GoogleGenerativeAI(geminiKey());
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: {
      temperature: opts.temperature ?? 0.2,
      ...(opts.json ? { responseMimeType: 'application/json' as const } : {}),
    },
    ...(opts.system ? { systemInstruction: { role: 'system' as const, parts: [{ text: opts.system }] } } : {}),
  });

  const result = await model.generateContent(opts.prompt + jsonPromptSuffix(!!opts.json));
  const text = result.response.text();
  const usage = result.response.usageMetadata;
  return {
    text,
    provider: 'gemini',
    model: GEMINI_MODEL,
    inputTokens: usage?.promptTokenCount,
    outputTokens: usage?.candidatesTokenCount,
  };
}

async function callClaudeText(opts: TextGenerateOptions): Promise<FallbackResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4096,
    temperature: opts.temperature ?? 0.2,
    ...(opts.system ? { system: opts.system } : {}),
    messages: [{ role: 'user', content: opts.prompt + jsonPromptSuffix(!!opts.json) }],
  });
  const block = response.content[0];
  const text = block.type === 'text' ? block.text : '';
  return {
    text,
    provider: 'claude',
    model: CLAUDE_MODEL,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

async function callGptText(opts: TextGenerateOptions): Promise<FallbackResult> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const completion = await openai.chat.completions.create({
    model: GPT_MODEL,
    temperature: opts.temperature ?? 0.2,
    ...(opts.json ? { response_format: { type: 'json_object' as const } } : {}),
    messages: [
      ...(opts.system ? [{ role: 'system' as const, content: opts.system }] : []),
      { role: 'user' as const, content: opts.prompt + jsonPromptSuffix(!!opts.json) },
    ],
  });
  const text = completion.choices[0]?.message?.content || '';
  return {
    text,
    provider: 'gpt',
    model: GPT_MODEL,
    inputTokens: completion.usage?.prompt_tokens,
    outputTokens: completion.usage?.completion_tokens,
  };
}

async function callGroqText(opts: TextGenerateOptions): Promise<FallbackResult> {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const completion = await groq.chat.completions.create({
    model: GROQ_MODEL,
    temperature: opts.temperature ?? 0.2,
    max_tokens: 4096,
    messages: [
      ...(opts.system ? [{ role: 'system' as const, content: opts.system }] : []),
      { role: 'user' as const, content: opts.prompt + jsonPromptSuffix(!!opts.json) },
    ],
  });
  const text = completion.choices[0]?.message?.content || '';
  return {
    text,
    provider: 'groq',
    model: GROQ_MODEL,
    inputTokens: completion.usage?.prompt_tokens,
    outputTokens: completion.usage?.completion_tokens,
  };
}

async function callGeminiVision(opts: VisionGenerateOptions): Promise<FallbackResult> {
  const genAI = new GoogleGenerativeAI(geminiKey());
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: opts.json ? { responseMimeType: 'application/json' as const } : undefined,
    ...(opts.system ? { systemInstruction: { role: 'system' as const, parts: [{ text: opts.system }] } } : {}),
  });

  const parts = [
    ...(opts.prompt ? [{ text: opts.prompt + jsonPromptSuffix(!!opts.json) }] : []),
    ...opts.images.map(img => ({
      inlineData: { mimeType: img.mimeType || 'image/jpeg', data: img.base64 },
    })),
  ];

  const result = await model.generateContent({ contents: [{ role: 'user', parts }] });
  const text = result.response.text();
  const usage = result.response.usageMetadata;
  return {
    text,
    provider: 'gemini',
    model: GEMINI_MODEL,
    inputTokens: usage?.promptTokenCount,
    outputTokens: usage?.candidatesTokenCount,
  };
}

async function callClaudeVision(opts: VisionGenerateOptions): Promise<FallbackResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const contentBlocks: Anthropic.Messages.ContentBlockParam[] = [];

  for (const img of opts.images) {
    if (img.mimeType === 'application/pdf') {
      contentBlocks.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: img.base64 },
      });
    } else {
      contentBlocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: (img.mimeType || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
          data: img.base64,
        },
      });
    }
  }

  if (opts.prompt) {
    contentBlocks.push({ type: 'text', text: opts.prompt + jsonPromptSuffix(!!opts.json) });
  }

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4096,
    ...(opts.system ? { system: opts.system } : {}),
    messages: [{ role: 'user', content: contentBlocks }],
  });

  const block = response.content[0];
  const text = block.type === 'text' ? block.text : '';
  return {
    text,
    provider: 'claude',
    model: CLAUDE_MODEL,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

async function callGptVision(opts: VisionGenerateOptions): Promise<FallbackResult> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];

  if (opts.prompt) {
    content.push({ type: 'text', text: opts.prompt + jsonPromptSuffix(!!opts.json) });
  }
  for (const img of opts.images) {
    content.push({
      type: 'image_url',
      image_url: { url: `data:${img.mimeType || 'image/jpeg'};base64,${img.base64}` },
    });
  }

  const completion = await openai.chat.completions.create({
    model: GPT_MODEL,
    ...(opts.json ? { response_format: { type: 'json_object' as const } } : {}),
    messages: [
      ...(opts.system ? [{ role: 'system' as const, content: opts.system }] : []),
      { role: 'user' as const, content },
    ],
  });

  const text = completion.choices[0]?.message?.content || '';
  return {
    text,
    provider: 'gpt',
    model: GPT_MODEL,
    inputTokens: completion.usage?.prompt_tokens,
    outputTokens: completion.usage?.completion_tokens,
  };
}

async function invokeTextProvider(provider: AiProviderId, opts: TextGenerateOptions): Promise<FallbackResult> {
  switch (provider) {
    case 'gemini': return callGeminiText(opts);
    case 'claude': return callClaudeText(opts);
    case 'gpt':    return callGptText(opts);
    case 'groq':   return callGroqText(opts);
    default:       throw new Error(`Unknown provider: ${provider}`);
  }
}

async function invokeVisionProvider(provider: AiProviderId, opts: VisionGenerateOptions): Promise<FallbackResult> {
  switch (provider) {
    case 'gemini': return callGeminiVision(opts);
    case 'claude': return callClaudeVision(opts);
    case 'gpt':    return callGptVision(opts);
    default:       throw new Error(`Vision not supported for provider: ${provider}`);
  }
}

function trackResult(result: FallbackResult) {
  const inTok = result.inputTokens ?? 0;
  const outTok = result.outputTokens ?? 0;
  if (result.provider === 'gemini') {
    trackUsage('gemini', inTok + outTok).catch(() => {});
  } else {
    trackTokens(result.provider, inTok, outTok).catch(() => {});
  }
}

async function runWithFallback<T extends TextGenerateOptions | VisionGenerateOptions>(
  order: AiProviderId[],
  invoke: (provider: AiProviderId, opts: T) => Promise<FallbackResult>,
  opts: T,
  label: string,
): Promise<FallbackResult> {
  const available = order.filter(hasProviderKey);
  if (available.length === 0) {
    throw new Error('사용 가능한 AI API 키가 없습니다. (GEMINI / ANTHROPIC / OPENAI / GROQ)');
  }

  const exclusions: string[] = [];
  let lastError: unknown;
  for (let i = 0; i < available.length; i++) {
    const provider = available[i];
    try {
      const result = await invoke(provider, opts);
      if (i > 0) {
        console.warn(`[ai-fallback] ${label}: ${available[0]} 실패 → ${provider} 사용 (${result.model})`);
      }
      trackResult(result);
      return {
        ...result,
        exclusions: exclusions.length ? exclusions : undefined,
      };
    } catch (err) {
      lastError = err;
      exclusions.push(classifyAiExclusion(err, providerIdToModelKeyForExclusion(provider)));
      const msg = formatError(err);
      const canFallback = i < available.length - 1;

      if (isOverloadError(err)) {
        for (let retry = 0; retry < 2; retry++) {
          await new Promise(r => setTimeout(r, 2000));
          try {
            const result = await invoke(provider, opts);
            trackResult(result);
            return {
              ...result,
              exclusions: exclusions.length ? exclusions : undefined,
            };
          } catch (retryErr) {
            lastError = retryErr;
          }
        }
      }

      if (canFallback) {
        console.warn(`[ai-fallback] ${label}: ${provider} 실패 (${msg.slice(0, 100)}) → ${available[i + 1]} 시도`);
        continue;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(formatError(lastError));
}

function resolveTextOrder(opts: TextGenerateOptions): AiProviderId[] {
  if (opts.order?.length) return opts.order;
  if (opts.useCase) return providerOrderForUseCase(opts.useCase);
  return getTextFallbackOrder();
}

function resolveVisionOrder(opts: VisionGenerateOptions): AiProviderId[] {
  if (opts.order?.length) return opts.order;
  if (opts.useCase) return providerOrderForUseCase(opts.useCase, true);
  return getVisionFallbackOrder();
}

/** 용도별 1순위 → 전체 AI 순차 시도 → Groq 마지막 */
export async function generateTextWithFallback(opts: TextGenerateOptions): Promise<FallbackResult> {
  return runWithFallback(resolveTextOrder(opts), invokeTextProvider, opts, 'text');
}

export class AiAllProvidersFailedError extends Error {
  readonly exclusions: string[];

  constructor(exclusions: string[], detail?: string) {
    const body = exclusions.length
      ? exclusions.map((e, i) => `${i + 1}. ${e}`).join('\n')
      : (detail || '알 수 없는 오류');
    super(
      exclusions.length
        ? `연동된 AI ${exclusions.length}개를 순차 시도했으나 모두 실패했습니다.\n\n${body}`
        : (detail || '사용 가능한 AI가 없습니다'),
    );
    this.name = 'AiAllProvidersFailedError';
    this.exclusions = exclusions;
  }
}

export type JsonFallbackResult<T> = FallbackResult & { data: T };

/**
 * 텍스트 생성 → JSON 파싱 → validate 통과 시에만 성공.
 * 한 AI가 API/파싱/검증에 실패하면 다음 연동 AI로 1회씩 순차 시도.
 */
export async function generateJsonWithFallback<T>(
  opts: TextGenerateOptions & { validate: (parsed: unknown) => parsed is T },
): Promise<JsonFallbackResult<T>> {
  const order = resolveTextOrder(opts).filter(hasProviderKey);
  if (order.length === 0) {
    throw new AiAllProvidersFailedError(
      [],
      '사용 가능한 AI API 키가 없습니다. GEMINI / ANTHROPIC / OPENAI / GROQ 중 하나 이상을 환경변수에 설정하세요.',
    );
  }

  const exclusions: string[] = [];
  let lastError: unknown;

  for (let i = 0; i < order.length; i++) {
    const provider = order[i];
    try {
      const result = await invokeTextProvider(provider, opts);
      trackResult(result);

      let parsed: unknown;
      try {
        const stripped = stripJsonMarkdown(result.text);
        if (!stripped) throw new Error('AI 응답이 비어 있습니다');
        parsed = JSON.parse(stripped);
      } catch (parseErr) {
        throw new Error(`JSON 파싱 실패 — ${formatError(parseErr)}`);
      }

      if (!opts.validate(parsed)) {
        throw new Error('필수 필드(품목 예측·종합 분석)가 비어 있거나 JSON 형식이 올바르지 않습니다');
      }

      if (i > 0) {
        console.warn(`[ai-json-fallback] ${order[0]} 등 실패 → ${provider} 성공 (${result.model})`);
      }

      return {
        ...result,
        data: parsed,
        exclusions: exclusions.length ? exclusions : undefined,
      };
    } catch (err) {
      lastError = err;
      exclusions.push(classifyAiExclusion(err, providerIdToModelKeyForExclusion(provider)));

      if (isOverloadError(err)) {
        for (let retry = 0; retry < 2; retry++) {
          await new Promise(r => setTimeout(r, 2000));
          try {
            const result = await invokeTextProvider(provider, opts);
            trackResult(result);
            const stripped = stripJsonMarkdown(result.text);
            const parsed = JSON.parse(stripped);
            if (!opts.validate(parsed)) {
              throw new Error('필수 필드 검증 실패');
            }
            return {
              ...result,
              data: parsed,
              exclusions: exclusions.length ? exclusions : undefined,
            };
          } catch (retryErr) {
            lastError = retryErr;
          }
        }
      }

      if (i < order.length - 1) {
        console.warn(
          `[ai-json-fallback] ${provider} 실패 (${formatError(err).slice(0, 80)}) → ${order[i + 1]} 시도`,
        );
        continue;
      }
    }
  }

  throw new AiAllProvidersFailedError(exclusions, formatError(lastError));
}

/** Vision: Claude → GPT → Gemini 순차 (Groq 제외) */
export async function generateVisionWithFallback(opts: VisionGenerateOptions): Promise<FallbackResult> {
  if (!opts.images.length) throw new Error('Vision 요청에 이미지가 없습니다.');
  return runWithFallback(resolveVisionOrder(opts), invokeVisionProvider, opts, 'vision');
}

export function stripJsonMarkdown(text: string): string {
  return text.trim().replace(/```json|```/g, '').trim();
}

export function formatAiError(err: unknown): string {
  return formatError(err);
}

export { friendlyAiError } from '@/lib/aiCollaborativeDebate';
