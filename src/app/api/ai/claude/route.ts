import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { SYSTEM_PROMPT } from '@/lib/aiSystemPrompt';
import { trackTokens } from '@/lib/trackUsage';
import { verifyToken } from '@/lib/authVerify';

export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY 미설정 (Vercel 환경변수 확인)' },
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
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const claudeHistory: { role: 'user' | 'assistant'; content: string }[] = history.map((m: any) => ({
      role:    m.role === 'model' ? 'assistant' : 'user',
      content: m.content || '',
    }));

    const response = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 2048,
      system:     SYSTEM_PROMPT,
      messages:   [...claudeHistory, { role: 'user', content: message }],
    });

    const block = response.content[0];
    const text  = block.type === 'text' ? block.text : '';
    trackTokens('claude', response.usage.input_tokens, response.usage.output_tokens).catch(() => {});

    return NextResponse.json({ text, usedModel: 'Claude Sonnet 4.6' });
  } catch (e: any) {
    console.error('[/api/ai/claude]', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
