import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import Groq from 'groq-sdk';
import { NextResponse } from 'next/server';
import { trackUsage, trackTokens } from '@/lib/trackUsage';
import { SYSTEM_PROMPT } from '@/lib/aiSystemPrompt';
import { verifyToken } from '@/lib/authVerify';
import {
  buildStoreContextPrompt,
  loadSystemContext,
} from '@/lib/aiStoreContext';
import {
  runCollaborativeDebate,
  friendlyAiError,
  type DebateEntry,
  type DebateRoundResult,
  type DebateProvider,
} from '@/lib/aiCollaborativeDebate';
import {
  getTextFallbackOrder,
  hasProviderKey,
  isOverloadError,
  isQuotaOrRateLimitError,
  type AiProviderId,
} from '@/lib/aiProviderFallback';
import {
  CHAT_ROUTE_LABELS,
  chatFallbackOrder,
  chatRouteToModelChoice,
  chatRouteToProvider,
  classifyAiExclusion,
  routeChatModel,
  buildFullFallbackOrder,
  providerIdToModelKeyForExclusion,
  type ChatRouteModel,
} from '@/lib/aiRouter';
import {
  buildExpiryChatAppendix,
  tryCreateExpiryFromAiChat,
} from '@/lib/expiryReminder/fromAiChat';
import {
  buildWikiAiAppendix,
  listWikiDocs,
  wikiIndexFromDocs,
} from '@/lib/wiki/wikiStore';

export type { DebateEntry, DebateRoundResult };

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

type GroqModel = 'groq-mixtral' | 'groq-llama';
type ModelChoice = 'auto' | 'gemini' | 'claude' | 'gpt' | 'groq' | GroqModel | 'debate';
type ChatMode = 'chat' | 'debate' | 'analysis';

const SYSTEM_INSTRUCTIONS: Record<string, string> = {
  default: SYSTEM_PROMPT,
  analyst: `당신은 Pitaya OS의 AI 데이터 분석가입니다.
강서정육점 Pitaya OS AI 어시스턴트로, 매출·매입·고객·직원 데이터를 수치와 팩트 기반으로 분석합니다.
조회만 가능하고 데이터 수정은 절대 불가합니다.
전월·전년 대비, 이상 수치, 품목·고객 패턴을 명확하게 요약하고 실용적 조언을 제공합니다.`,
};

/* ── 축산물 이력번호 감지 및 조회 ── */
const TRACE_NO_RE = /\b(\d{12,15})\b/g;

async function fetchMeatHistory(traceNo: string): Promise<string | null> {
  try {
    const { fetchMeatTraceByNo } = await import('@/lib/meatTrace/fetchMeatTrace');
    const d = await fetchMeatTraceByNo(traceNo);
    if (!d.found) return null;
    const parts = [
      d.cattleType && `축종: ${d.cattleType}`,
      d.origin && `원산지: ${d.origin}`,
      d.farmName && `농장: ${d.farmName}`,
      d.slaughterDate && `도축일: ${d.slaughterDate}`,
      d.slaughterPlace && `도축장: ${d.slaughterPlace}`,
      (d.qgrade || d.ygrade) && `등급: 육질 ${d.qgrade || '-'} / 육량 ${d.ygrade || '-'}`,
      d.weight && `도체중: ${d.weight}kg`,
      d.expiryDate && `유통기한: ${d.expiryDate}`,
    ].filter(Boolean);
    return `[이력번호 ${traceNo} 조회결과]\n${parts.join('\n')}`;
  } catch {
    return null;
  }
}

const MODEL_NAMES: Record<string, string> = {
  gemini:         'Gemini 2.5 Flash',
  claude:         'Claude Sonnet 4.6',
  gpt:            'GPT-4o',
  'groq-mixtral': 'Groq Llama3 8B',
  'groq-llama':   'Groq Llama3 70B',
};

const GROQ_MODEL_IDS: Record<GroqModel, string> = {
  'groq-mixtral': 'llama-3.1-8b-instant',
  'groq-llama':   'llama-3.3-70b-versatile',
};

const MODEL_TO_ROUTE_KEY: Partial<Record<ModelChoice, ChatRouteModel>> = {
  'groq-llama': 'groq',
  'groq-mixtral': 'groq',
  claude: 'claude',
  gpt: 'gpt4o',
  gemini: 'gemini',
};

function modelChoiceToRouteKey(model: ModelChoice): ChatRouteModel | undefined {
  return MODEL_TO_ROUTE_KEY[model];
}

const hasKey = {
  gemini: () => !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
  claude: () => !!process.env.ANTHROPIC_API_KEY,
  gpt:    () => !!process.env.OPENAI_API_KEY,
  groq:   () => !!process.env.GROQ_API_KEY,
};

interface CallResult { text: string; inputTokens: number; outputTokens: number; }

async function callGemini(message: string, history: any[], system: string): Promise<CallResult> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const genAI  = new GoogleGenerativeAI(apiKey!);
  const model  = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const geminiHistory = history.map((m: any) => ({
    role:  m.role as 'user' | 'model',
    parts: [{ text: m.content }],
  }));

  const chat = model.startChat({
    history:           geminiHistory,
    systemInstruction: { role: 'system', parts: [{ text: system }] },
    generationConfig:  { temperature: 0.2 },
  });

  const sendWithRetry = async (retry = 0): Promise<CallResult> => {
    try {
      const res = await chat.sendMessage(message);
      const text = res.response.text();
      const usage = res.response.usageMetadata;
      return {
        text,
        inputTokens:  usage?.promptTokenCount     ?? Math.ceil(message.length / 4),
        outputTokens: usage?.candidatesTokenCount  ?? Math.ceil(text.length / 4),
      };
    } catch (err: any) {
      if (err.message?.includes('503') && retry < 3) {
        await new Promise(r => setTimeout(r, 2000));
        return sendWithRetry(retry + 1);
      }
      throw err;
    }
  };

  return sendWithRetry();
}

async function callClaude(message: string, history: any[], system: string): Promise<CallResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const claudeHistory = history.map((m: any) => ({
    role:    (m.role === 'model' ? 'assistant' : 'user') as 'user' | 'assistant',
    content: m.content || '',
  }));

  const response = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 2048,
    system,
    messages:   [...claudeHistory, { role: 'user', content: message }],
  });

  const block = response.content[0];
  const text = block.type === 'text' ? block.text : '';
  return {
    text,
    inputTokens:  response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

async function callGPT(message: string, history: any[], system: string): Promise<CallResult> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const gptHistory = history.map((m: any) => ({
    role:    (m.role === 'model' ? 'assistant' : 'user') as 'user' | 'assistant',
    content: m.content || '',
  }));

  const completion = await openai.chat.completions.create({
    model:       'gpt-4o',
    temperature: 0.2,
    messages: [
      { role: 'system', content: system },
      ...gptHistory,
      { role: 'user', content: message },
    ],
  });

  const text = completion.choices[0]?.message?.content || '';
  return {
    text,
    inputTokens:  completion.usage?.prompt_tokens     ?? 0,
    outputTokens: completion.usage?.completion_tokens ?? 0,
  };
}

async function callGroq(message: string, history: any[], system: string, groqModelId: string): Promise<CallResult> {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  const groqHistory = history.map((m: any) => ({
    role:    (m.role === 'model' ? 'assistant' : 'user') as 'user' | 'assistant',
    content: m.content || '',
  }));

  const completion = await groq.chat.completions.create({
    model:       groqModelId,
    temperature: 0.2,
    max_tokens:  2048,
    messages: [
      { role: 'system', content: system },
      ...groqHistory,
      { role: 'user', content: message },
    ],
  });

  const text = completion.choices[0]?.message?.content || '';
  return {
    text,
    inputTokens:  completion.usage?.prompt_tokens     ?? 0,
    outputTokens: completion.usage?.completion_tokens ?? 0,
  };
}

/* ── Groq 기반 최적 AI 자동 선택 ── */
async function groqAutoSelect(message: string): Promise<string> {
  if (!hasKey.groq()) return 'fallback';
  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const available = [
      hasKey.gemini() && 'gemini',
      hasKey.claude() && 'claude',
      hasKey.gpt()    && 'gpt',
      'groq',
    ].filter(Boolean) as string[];

    const completion = await groq.chat.completions.create({
      model:       'llama-3.1-8b-instant',
      max_tokens:  5,
      temperature: 0,
      messages: [{
        role:    'user',
        content: `질문에 맞는 AI 선택. 가능: ${available.join(',')}
claude=깊은분석/추론/문서, gpt=코드/기술/수학, gemini=이미지/멀티모달, groq=빠른답변/일상
질문: "${message.slice(0, 200)}"
한 단어만:`,
      }],
    });

    const pick = (completion.choices[0]?.message?.content || '')
      .trim().toLowerCase().replace(/[^a-z]/g, '');
    return available.includes(pick) ? pick : 'fallback';
  } catch {
    return 'fallback';
  }
}

/* ── 토론용 AI 프로바이더 목록 ── */
function getDebateProviders(): DebateProvider[] {
  const providers: DebateProvider[] = [];
  if (hasKey.gemini()) {
    providers.push({
      id: 'gemini', name: 'Gemini 2.5 Flash', emoji: '⚡',
      call: (msg, hist, sys) => callGemini(msg, hist, sys),
    });
  }
  if (hasKey.claude()) {
    providers.push({
      id: 'claude', name: 'Claude Sonnet 4.6', emoji: '🧠',
      call: (msg, hist, sys) => callClaude(msg, hist, sys),
    });
  }
  if (hasKey.gpt()) {
    providers.push({
      id: 'gpt', name: 'GPT-4o', emoji: '👔',
      call: (msg, hist, sys) => callGPT(msg, hist, sys),
    });
  }
  if (hasKey.groq()) {
    providers.push({
      id: 'groq', name: 'Groq Llama3 70B', emoji: '🟠',
      call: (msg, hist, sys) => callGroq(msg, hist, sys, GROQ_MODEL_IDS['groq-llama']),
    });
  }
  return providers;
}

async function runDebate(message: string, _history: any[], system: string) {
  const topic = message.trim();
  return runCollaborativeDebate(topic, getDebateProviders(), undefined, system);
}

export async function GET() {
  return NextResponse.json({
    models: [
      { id: 'gemini', name: 'Gemini 2.5 Flash',  provider: 'Google',    emoji: '⚡', active: hasKey.gemini() },
      { id: 'claude', name: 'Claude Sonnet 4.6', provider: 'Anthropic', emoji: '🧠', active: hasKey.claude() },
      { id: 'gpt',    name: 'GPT-4o',             provider: 'OpenAI',    emoji: '👔', active: hasKey.gpt()    },
      { id: 'groq',   name: 'Groq Llama3 70B',   provider: 'Groq',      emoji: '🟠', active: hasKey.groq()   },
    ],
  });
}

export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const {
      message,
      persona,
      history,
      model: modelChoice = 'auto',
      storeId,
      chatMode = 'chat',
      wikiMode = false,
    } = await req.json() as {
      message: string;
      persona?: string;
      history?: any[];
      model?: ModelChoice;
      storeId?: string;
      chatMode?: ChatMode;
      wikiMode?: boolean;
    };

    if (!message?.trim()) {
      return NextResponse.json({ error: '메시지 없음' }, { status: 400 });
    }

    const msgs = history || [];
    let storeContext = null;
    if (storeId) {
      try {
        storeContext = await loadSystemContext(storeId);
      } catch (err) {
        console.error('[AI] loadSystemContext failed:', err);
      }
    }

    const basePersona =
      chatMode === 'analysis' ? 'analyst'
      : (persona || 'default');
    const baseSystem = SYSTEM_INSTRUCTIONS[basePersona] ?? SYSTEM_INSTRUCTIONS.default;
    let system = buildStoreContextPrompt(baseSystem, storeContext);

    if (wikiMode && storeId) {
      try {
        const wikiDocs = await listWikiDocs(storeId);
        system += buildWikiAiAppendix(wikiIndexFromDocs(wikiDocs));
      } catch (err) {
        console.error('[AI] wiki appendix:', err);
      }
    }

    // ── 이력번호 자동 감지 → 정보 주입 ──
    const traceMatches = [...new Set(Array.from(message.matchAll(TRACE_NO_RE), m => m[1]))];
    if (traceMatches.length > 0) {
      const results = await Promise.all(traceMatches.map(fetchMeatHistory));
      const valid   = results.filter(Boolean);
      if (valid.length > 0) {
        system += `\n\n아래는 사용자가 언급한 이력번호의 실시간 조회 결과입니다. 이 정보를 바탕으로 답변하세요:\n${valid.join('\n\n')}`;
      }
    }

    // ── 유통기한 등록 (독립 모듈, AI 대화 채널) ──
    let expiryReminder: Awaited<ReturnType<typeof tryCreateExpiryFromAiChat>> | undefined;
    if (
      chatMode !== 'debate'
      && (modelChoice as string) !== 'debate'
      && storeId
      && authUser.uid
    ) {
      try {
        expiryReminder = await tryCreateExpiryFromAiChat({
          storeId,
          createdBy: authUser.uid,
          message: message.trim(),
        });
      } catch (err) {
        console.error('[AI] expiry reminder:', err);
      }
    }

    // ── 4AI 협업 토론 (model=debate 또는 chatMode=debate) ──
    if ((modelChoice as string) === 'debate' || chatMode === 'debate') {
      const topic = msgs.find(m => m.role === 'user')?.content || message;
      const debateResult = await runDebate(topic, msgs, system);
      const failed = debateResult.debate.filter(e => e.error);
      return NextResponse.json({
        debate:        debateResult.debate,
        debateRounds:  debateResult.rounds,
        debateSummary: debateResult.summary,
        summaryModel:  debateResult.summaryModel,
        usedModel:     '4AI 토론',
        text:          debateResult.summary,
        chatMode:      'debate',
        failedModels:  failed.map(f => ({ model: f.name, error: f.error })),
      });
    }

    // ── 모델 결정 ──
    let effectiveMessage = message;
    let resolved: ModelChoice;
    let autoSelectedBy: string | undefined;
    let chatRouteLabel: string | undefined;
    const aiExclusions: string[] = [];

    const effectiveChoice: ModelChoice =
      (modelChoice as string) === 'groq' ? 'groq-llama' : modelChoice;

    if (effectiveChoice === 'auto') {
      const hasImage = /data:image\/[a-z]+;base64,/.test(message);

      if (hasImage) {
        resolved = 'gemini';
      } else {
        const route = routeChatModel(message);
        resolved = chatRouteToModelChoice(route);
        autoSelectedBy = 'router';
        chatRouteLabel = CHAT_ROUTE_LABELS[route];
      }
    } else {
      resolved = effectiveChoice;
    }

    // ── Fail-Safe / Key 검증 (auto: Gemini silent fallback 금지) ──
    if (effectiveChoice === 'auto') {
      const pickAvailable = (preferred: ModelChoice): ModelChoice | null => {
        if (preferred === 'claude' && hasKey.claude()) return 'claude';
        if (preferred === 'gpt'    && hasKey.gpt())    return 'gpt';
        if (preferred === 'groq-llama' && hasKey.groq()) return 'groq-llama';
        if (preferred === 'gemini' && hasKey.gemini()) return 'gemini';
        if (hasKey.groq())   return 'groq-llama';
        if (hasKey.claude()) return 'claude';
        if (hasKey.gpt())    return 'gpt';
        if (hasKey.gemini()) return 'gemini';
        return null;
      };
      const fixed = pickAvailable(resolved);
      if (!fixed) {
        return NextResponse.json({ error: '사용 가능한 AI API 키가 없습니다.', errorCode: 'api_key_missing' }, { status: 503 });
      }
      resolved = fixed;
    } else {
      const keyMissing =
        (resolved === 'gemini'        && !hasKey.gemini()) ||
        (resolved === 'claude'       && !hasKey.claude()) ||
        (resolved === 'gpt'          && !hasKey.gpt())    ||
        ((resolved === 'groq-mixtral' || resolved === 'groq-llama') && !hasKey.groq());
      if (keyMissing) {
        const envKey =
          resolved === 'gemini' ? 'GEMINI_API_KEY'
          : resolved === 'claude' ? 'ANTHROPIC_API_KEY'
          : resolved === 'gpt' ? 'OPENAI_API_KEY'
          : 'GROQ_API_KEY';
        return NextResponse.json({
          text:      `⚠️ ${MODEL_NAMES[resolved]} API 키가 설정되지 않았습니다. (${envKey} 미설정)`,
          usedModel: '',
          error:     'api_key_missing',
        }, { status: 503 });
      }
    }
    // gemini key check (explicit select path covered above; auto path uses pickAvailable)

    // ── 호출 ──
    let result: CallResult | undefined;
    let finalModel = resolved;

    const invokeProvider = async (provider: ModelChoice): Promise<CallResult> => {
      if (provider === 'claude') return callClaude(effectiveMessage, msgs, system);
      if (provider === 'gpt') return callGPT(effectiveMessage, msgs, system);
      if (provider === 'groq-mixtral' || provider === 'groq-llama') {
        return callGroq(effectiveMessage, msgs, system, GROQ_MODEL_IDS[provider as GroqModel]);
      }
      return callGemini(effectiveMessage, msgs, system);
    };

    try {
      result = await invokeProvider(resolved);
    } catch (callErr: any) {
      const routeKey = modelChoiceToRouteKey(resolved);
      if (routeKey) {
        aiExclusions.push(classifyAiExclusion(callErr, routeKey));
      }
      const shouldFallback = isQuotaOrRateLimitError(callErr) || isOverloadError(callErr) || true;
      if (shouldFallback) {
        const order = effectiveChoice === 'auto' && !/data:image/.test(message)
          ? chatFallbackOrder(message)
          : buildFullFallbackOrder(
              resolved.startsWith('groq') ? 'groq' : (resolved as AiProviderId),
            ).filter(hasProviderKey);
        const start = order.indexOf(
          resolved.startsWith('groq') ? 'groq' : (resolved as AiProviderId),
        );
        const rest = start >= 0 ? order.slice(start + 1) : order.slice(1);
        for (const provider of rest) {
          let mapped: ModelChoice =
            provider === 'groq' ? 'groq-llama'
            : provider === 'gemini' ? 'gemini'
            : provider;
          if (mapped === resolved) continue;
          try {
            result = await invokeProvider(mapped);
            finalModel = mapped;
            console.warn(`[ai/route] ${resolved} 실패 → ${provider} fallback`);
            break;
          } catch (fallbackErr) {
            const fbKey = modelChoiceToRouteKey(mapped);
            if (fbKey) aiExclusions.push(classifyAiExclusion(fallbackErr, fbKey));
          }
        }
      }
      if (!result) {
        const errMsg = friendlyAiError(callErr.message || '알 수 없는 오류');
        return NextResponse.json({
          text:      `⚠️ ${MODEL_NAMES[resolved] || resolved} 오류: ${errMsg}`,
          usedModel: MODEL_NAMES[resolved] || resolved,
          error:     errMsg,
        }, { status: 502 });
      }
    }

    // ── 사용량 추적 ──
    const trackProvider = (finalModel.startsWith('groq') ? 'groq' : finalModel) as any;
    if (trackProvider === 'gemini') {
      trackUsage('gemini', result.inputTokens + result.outputTokens).catch(() => {});
    } else {
      trackTokens(trackProvider, result.inputTokens, result.outputTokens).catch(() => {});
    }

    let responseText = result.text;
    const expiryAppendix = expiryReminder ? buildExpiryChatAppendix(expiryReminder) : '';
    if (expiryAppendix) {
      responseText = `${responseText.trim()}${expiryAppendix}`;
    }
    if (aiExclusions.length > 0) {
      responseText += `\n\n---\n⛔ **제외된 AI**\n${aiExclusions.map(e => `• ${e}`).join('\n')}\n✅ **응답 AI:** ${MODEL_NAMES[finalModel] || finalModel}`;
    }

    return NextResponse.json({
      text:            responseText,
      usedModel:       MODEL_NAMES[finalModel] || finalModel,
      isAuto:          modelChoice === 'auto',
      autoSelectedBy,
      chatRoute:       chatRouteLabel,
      aiExclusions:    aiExclusions.length ? aiExclusions : undefined,
      chatMode,
      expiryReminder: expiryReminder?.created ? expiryReminder.result : undefined,
    });

  } catch (error: any) {
    console.error('AI API Error:', error);
    return NextResponse.json({
      text:      error.message?.includes('503')
        ? '⚠️ AI 서버가 혼잡합니다. 잠시 후 다시 시도해주세요.'
        : `⚠️ AI 응답 오류: ${error.message || '다시 시도해주세요.'}`,
      usedModel: '',
      error:     error.message,
    }, { status: 200 });
  }
}
