import OpenAI from 'openai';
import { NextResponse } from 'next/server';
import { SYSTEM_PROMPT } from '@/lib/aiSystemPrompt';
import { trackTokens } from '@/lib/trackUsage';
import { verifyToken } from '@/lib/authVerify';

export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: 'OPENAI_API_KEY 미설정 (Vercel 환경변수 확인)' },
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
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const gptHistory: { role: 'user' | 'assistant'; content: string }[] = history.map((m: any) => ({
      role:    m.role === 'model' ? 'assistant' : 'user',
      content: m.content || '',
    }));

    const completion = await openai.chat.completions.create({
      model:       'gpt-4o',
      temperature: 0.2,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...gptHistory,
        { role: 'user', content: message },
      ],
    });

    const text = completion.choices[0]?.message?.content || '';
    trackTokens('gpt',
      completion.usage?.prompt_tokens     ?? 0,
      completion.usage?.completion_tokens ?? 0,
    ).catch(() => {});

    return NextResponse.json({ text, usedModel: 'GPT-4o' });
  } catch (e: any) {
    console.error('[/api/ai/gpt]', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
