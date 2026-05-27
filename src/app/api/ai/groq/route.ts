import Groq from 'groq-sdk';
import { NextResponse } from 'next/server';
import { SYSTEM_PROMPT } from '@/lib/aiSystemPrompt';
import { trackTokens } from '@/lib/trackUsage';

const MODEL_ID = 'llama-3.3-70b-versatile';

export async function POST(req: Request) {
  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json(
      { error: 'GROQ_API_KEY 미설정 (Vercel 환경변수 확인)' },
      { status: 503 },
    );
  }

  let body: { message: string; history?: any[] };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { message, history = [] } = body;
  if (!message?.trim()) {
    return NextResponse.json({ error: '메시지 없음' }, { status: 400 });
  }

  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const groqHistory: { role: 'user' | 'assistant'; content: string }[] = history.map((m: any) => ({
      role:    m.role === 'model' ? 'assistant' : 'user',
      content: m.content || '',
    }));

    const completion = await groq.chat.completions.create({
      model:       MODEL_ID,
      temperature: 0.2,
      max_tokens:  2048,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...groqHistory,
        { role: 'user', content: message },
      ],
    });

    const text = completion.choices[0]?.message?.content || '';
    trackTokens('groq',
      completion.usage?.prompt_tokens     ?? 0,
      completion.usage?.completion_tokens ?? 0,
    ).catch(() => {});

    return NextResponse.json({ text, usedModel: 'Groq Llama3 70B' });
  } catch (e: any) {
    console.error('[/api/ai/groq]', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
