import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import Groq from 'groq-sdk';
import { NextResponse } from 'next/server';
import { trackUsage, trackTokens } from '@/lib/trackUsage';
import { SYSTEM_PROMPT } from '@/lib/aiSystemPrompt';
import { verifyToken } from '@/lib/authVerify';

type GroqModel = 'groq-mixtral' | 'groq-llama';
type ModelChoice = 'auto' | 'gemini' | 'claude' | 'gpt' | 'groq' | GroqModel;

const SYSTEM_INSTRUCTIONS: Record<string, string> = {
  default:  SYSTEM_PROMPT,
  analyst:  '당신은 Pitaya OS의 AI 데이터 분석가입니다. 매출, 재고 등 수치와 팩트 기반으로 명확하게 요약 답변합니다.',
};

/* ── 축산물 이력번호 감지 및 조회 ── */
const TRACE_NO_RE = /\b(\d{12,15})\b/g;

async function fetchMeatHistory(traceNo: string): Promise<string | null> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:9000';
    const res = await fetch(`${baseUrl}/api/external/meat-history?traceNo=${traceNo}`, {
      signal: AbortSignal.timeout(6000),
    });
    const d = await res.json();
    if (!d.found) return null;
    const parts = [
      d.cattleType && `축종: ${d.cattleType}`,
      d.origin     && `원산지: ${d.origin}`,
      d.farmName   && `농장: ${d.farmName}`,
      d.slaughterDate && `도축일: ${d.slaughterDate}`,
      d.slaughterPlace && `도축장: ${d.slaughterPlace}`,
      (d.qgrade || d.ygrade) && `등급: 육질 ${d.qgrade || '-'} / 육량 ${d.ygrade || '-'}`,
      d.weight && `도체중: ${d.weight}kg`,
    ].filter(Boolean);
    return `[이력번호 ${traceNo} 조회결과]\n${parts.join('\n')}`;
  } catch {
    return null;
  }
}

const MODEL_NAMES: Record<string, string> = {
  gemini:         'Gemini',
  claude:         'Claude',
  gpt:            'GPT-4o',
  'groq-mixtral': 'Groq Llama3 8B',
  'groq-llama':   'Groq Llama3 70B',
};

const GROQ_MODEL_IDS: Record<GroqModel, string> = {
  'groq-mixtral': 'llama-3.1-8b-instant',
  'groq-llama':   'llama-3.3-70b-versatile',
};

const hasKey = {
  gemini: () => !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
  claude: () => !!process.env.ANTHROPIC_API_KEY,
  gpt:    () => !!process.env.OPENAI_API_KEY,
  groq:   () => !!process.env.GROQ_API_KEY,
};

/* ── 반환 타입: text + 실제 토큰 수 ── */
interface CallResult { text: string; inputTokens: number; outputTokens: number; }

async function callGemini(message: string, history: any[], system: string): Promise<CallResult> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const genAI  = new GoogleGenerativeAI(apiKey!);
  const model  = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

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
    content: m.content,
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
    content: m.content,
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
    content: m.content,
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
    const { message, persona, history, model: modelChoice = 'auto' } =
      await req.json() as { message: string; persona?: string; history?: any[]; model?: ModelChoice };

    if (!message?.trim()) {
      return NextResponse.json({ error: '메시지 없음' }, { status: 400 });
    }

    let system = SYSTEM_INSTRUCTIONS[persona || 'default'] ?? SYSTEM_INSTRUCTIONS.default;
    const msgs = history || [];

    // ── 이력번호 자동 감지 → 정보 주입 ──
    const traceMatches = [...new Set(Array.from(message.matchAll(TRACE_NO_RE), m => m[1]))];
    if (traceMatches.length > 0) {
      const results = await Promise.all(traceMatches.map(fetchMeatHistory));
      const valid   = results.filter(Boolean);
      if (valid.length > 0) {
        system += `\n\n아래는 사용자가 언급한 이력번호의 실시간 조회 결과입니다. 이 정보를 바탕으로 답변하세요:\n${valid.join('\n\n')}`;
      }
    }

    // ── 모델 결정 ──
    let resolved: ModelChoice;

    // `groq` 단일 ID → groq-llama 로 매핑
    const effectiveChoice: ModelChoice =
      (modelChoice as string) === 'groq' ? 'groq-llama' : modelChoice;

    if (effectiveChoice === 'auto') {
      const hasImage     = /data:image\/[a-z]+;base64,/.test(message);
      const hasAnalytics = /표|분석|JSON|코드|데이터/.test(message);

      if (hasImage) {
        resolved = 'gemini';
      } else if (hasKey.groq()) {
        resolved = 'groq-llama';
      } else if (hasAnalytics && hasKey.claude()) {
        resolved = 'claude';
      } else if (hasKey.gpt()) {
        resolved = 'gpt';
      } else {
        resolved = 'gemini';
      }
    } else {
      resolved = effectiveChoice;
    }

    // ── Fail-Safe / Key 검증 ──
    if (effectiveChoice === 'auto') {
      // auto 모드: 키 없으면 조용히 다른 모델로 fallback
      if (resolved === 'claude'       && !hasKey.claude()) resolved = hasKey.groq() ? 'groq-llama' : 'gemini';
      if (resolved === 'gpt'          && !hasKey.gpt())    resolved = hasKey.groq() ? 'groq-llama' : 'gemini';
      if ((resolved === 'groq-mixtral' || resolved === 'groq-llama') && !hasKey.groq()) resolved = 'gemini';
    } else {
      // 명시적 모델 선택: 키 없으면 에러 반환 (조용한 Gemini fallback 금지)
      const keyMissing =
        (resolved === 'claude'       && !hasKey.claude()) ||
        (resolved === 'gpt'          && !hasKey.gpt())    ||
        ((resolved === 'groq-mixtral' || resolved === 'groq-llama') && !hasKey.groq());
      if (keyMissing) {
        const envKey = resolved === 'claude' ? 'ANTHROPIC_API_KEY' : resolved === 'gpt' ? 'OPENAI_API_KEY' : 'GROQ_API_KEY';
        return NextResponse.json({
          text: `⚠️ ${MODEL_NAMES[resolved]} API 키가 설정되지 않았습니다. (${envKey} 미설정)`,
          usedModel: '',
          error: 'api_key_missing',
        }, { status: 503 });
      }
    }
    if (!hasKey.gemini() && resolved === 'gemini') {
      return NextResponse.json({ error: '사용 가능한 AI API 키가 없습니다.' }, { status: 500 });
    }

    // ── 호출 ──
    let result: CallResult;
    let finalModel = resolved;

    try {
      if (resolved === 'claude') {
        result = await callClaude(message, msgs, system);
      } else if (resolved === 'gpt') {
        result = await callGPT(message, msgs, system);
      } else if (resolved === 'groq-mixtral' || resolved === 'groq-llama') {
        result = await callGroq(message, msgs, system, GROQ_MODEL_IDS[resolved as GroqModel]);
      } else {
        result = await callGemini(message, msgs, system);
      }
    } catch (callErr: any) {
      if (resolved !== 'gemini' && modelChoice === 'auto') {
        // auto 모드 호출 실패 시 Gemini로 fallback
        console.warn(`[AI] ${resolved} 호출 실패 → Gemini 우회:`, callErr.message);
        result = await callGemini(message, msgs, system);
        finalModel = 'gemini';
      } else {
        // 명시적 선택 실패 시 에러 반환
        throw callErr;
      }
    }

    // ── 사용량 추적 ──
    const trackProvider = (finalModel.startsWith('groq') ? 'groq' : finalModel) as any;
    if (trackProvider === 'gemini') {
      trackUsage('gemini', result.inputTokens + result.outputTokens).catch(() => {});
    } else {
      trackTokens(trackProvider, result.inputTokens, result.outputTokens).catch(() => {});
    }

    return NextResponse.json({
      text:      result.text,
      usedModel: MODEL_NAMES[finalModel] || finalModel,
      isAuto:    modelChoice === 'auto',
    });

  } catch (error: any) {
    console.error('AI API Error:', error);
    return NextResponse.json({
      text: error.message?.includes('503')
        ? '⚠️ AI 서버가 혼잡합니다. 잠시 후 다시 시도해주세요.'
        : '⚠️ AI 응답 중 오류가 발생했습니다. 다시 시도해주세요.',
      usedModel: '',
    }, { status: 200 });
  }
}
