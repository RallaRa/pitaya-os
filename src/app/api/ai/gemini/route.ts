import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';
import { SYSTEM_PROMPT } from '@/lib/aiSystemPrompt';
import { trackUsage } from '@/lib/trackUsage';

export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'GEMINI_API_KEY 미설정 (Vercel 환경변수 확인)' },
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
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const geminiHistory = history.map((m: any) => ({
      role:  (m.role === 'model' ? 'model' : 'user') as 'user' | 'model',
      parts: [{ text: m.content || '' }],
    }));

    const chat = model.startChat({
      history:           geminiHistory,
      systemInstruction: { role: 'system', parts: [{ text: SYSTEM_PROMPT }] },
      generationConfig:  { temperature: 0.2 },
    });

    const res   = await chat.sendMessage(message);
    const text  = res.response.text();
    const usage = res.response.usageMetadata;
    const total = (usage?.promptTokenCount ?? 0) + (usage?.candidatesTokenCount ?? 0);

    trackUsage('gemini', total).catch(() => {});

    return NextResponse.json({ text, usedModel: 'Gemini 2.5 Flash' });
  } catch (e: any) {
    console.error('[/api/ai/gemini]', e.message);
    return NextResponse.json(
      { error: e.message?.includes('503') ? 'Gemini 서버 혼잡 — 잠시 후 재시도' : e.message },
      { status: 500 },
    );
  }
}
