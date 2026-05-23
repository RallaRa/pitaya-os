import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import Groq from 'groq-sdk';
import { NextResponse } from 'next/server';
import { trackUsage, trackTokens } from '@/lib/trackUsage';

type GroqModel = 'groq-mixtral' | 'groq-llama';
type ModelChoice = 'auto' | 'gemini' | 'claude' | 'gpt' | GroqModel;

const SYSTEM_INSTRUCTIONS: Record<string, string> = {
  default: '당신은 Pitaya OS의 AI 경영 비서입니다. 소상공인 매장(정육점·식품점 등) 운영을 전문적으로 돕습니다. 매출 분석, 재고 관리, 가격 전략, 직원 관리, 경영 상담, 시장 트렌드 등을 안내합니다. 친절하고 실용적인 답변을 제공하며 필요 시 마크다운을 활용합니다.',
  analyst: '당신은 Pitaya OS의 AI 데이터 분석가입니다. 매출, 재고 등 수치와 팩트 기반으로 명확하게 요약 답변합니다.',
};

const MODEL_NAMES: Record<string, string> = {
  gemini:         'Gemini',
  claude:         'Claude',
  gpt:            'GPT-4o',
  'groq-mixtral': 'Groq Mixtral',
  'groq-llama':   'Groq Llama',
};

const GROQ_MODEL_IDS: Record<GroqModel, string> = {
  'groq-mixtral': 'mixtral-8x7b-32768',
  'groq-llama':   'llama3-70b-8192',
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
      { id: 'gemini',       name: 'Gemini 2.5 Flash',  provider: 'Google',    emoji: '⚡', active: hasKey.gemini() },
      { id: 'claude',       name: 'Claude Sonnet 4.6',  provider: 'Anthropic', emoji: '🧠', active: hasKey.claude() },
      { id: 'gpt',          name: 'GPT-4o',             provider: 'OpenAI',    emoji: '👔', active: hasKey.gpt()    },
      { id: 'groq-mixtral', name: 'Groq Mixtral 8x7B', provider: 'Groq',      emoji: '🚀', active: hasKey.groq()   },
      { id: 'groq-llama',   name: 'Groq Llama3 70B',   provider: 'Groq',      emoji: '🦙', active: hasKey.groq()   },
    ],
  });
}

export async function POST(req: Request) {
  try {
    const { message, persona, history, model: modelChoice = 'auto' } =
      await req.json() as { message: string; persona?: string; history?: any[]; model?: ModelChoice };

    if (!message?.trim()) {
      return NextResponse.json({ error: '메시지 없음' }, { status: 400 });
    }

    const system = SYSTEM_INSTRUCTIONS[persona || 'default'] ?? SYSTEM_INSTRUCTIONS.default;
    const msgs   = history || [];

    // ── 모델 결정 ──
    let resolved: ModelChoice;

    if (modelChoice === 'auto') {
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
      resolved = modelChoice;
    }

    // ── Fail-Safe ──
    if (resolved === 'claude'       && !hasKey.claude()) resolved = hasKey.groq() ? 'groq-llama' : 'gemini';
    if (resolved === 'gpt'          && !hasKey.gpt())    resolved = hasKey.groq() ? 'groq-llama' : 'gemini';
    if ((resolved === 'groq-mixtral' || resolved === 'groq-llama') && !hasKey.groq()) resolved = 'gemini';
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
      if (resolved !== 'gemini') {
        console.warn(`[AI] ${resolved} 호출 실패 → Gemini 우회:`, callErr.message);
        result = await callGemini(message, msgs, system);
        finalModel = 'gemini';
      } else {
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
