import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';
import Groq from 'groq-sdk';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { requireSuperuser } from '@/lib/devAuth';
import {
  buildDevSystemPrompt,
  DEFAULT_DEV_CONTEXT,
  DEV_CONTEXT_DOC_ID,
  type DevContext,
} from '@/lib/devContext';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

async function loadContext(): Promise<DevContext> {
  const snap = await adminDb.collection('dev_context').doc(DEV_CONTEXT_DOC_ID).get();
  return snap.exists ? (snap.data() as DevContext) : DEFAULT_DEV_CONTEXT;
}

async function saveConversation(userMsg: string, aiMsg: string) {
  const ref = adminDb.collection('dev_context').doc(DEV_CONTEXT_DOC_ID);
  const snap = await ref.get();
  const data = snap.exists ? snap.data() as DevContext : DEFAULT_DEV_CONTEXT;
  const recent = [
    { role: 'user', content: userMsg.slice(0, 500), at: new Date().toISOString() },
    { role: 'assistant', content: aiMsg.slice(0, 800), at: new Date().toISOString() },
    ...(data.recentConversations || []),
  ].slice(0, 20);
  await ref.set({
    recentConversations: recent,
    lastUpdated: FieldValue.serverTimestamp(),
  }, { merge: true });
}

async function callModel(
  model: string,
  system: string,
  message: string,
  history: { role: string; content: string }[],
): Promise<string> {
  if (model === 'claude') {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msgs = history.map(h => ({
      role: (h.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: h.content,
    }));
    const res = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system,
      messages: [...msgs, { role: 'user', content: message }],
    });
    const block = res.content[0];
    return block.type === 'text' ? block.text : '';
  }

  if (model === 'gemini') {
    const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_CLOUD_API_KEY;
    const genAI = new GoogleGenerativeAI(key!);
    const m = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const chat = m.startChat({
      history: history.map(h => ({
        role: h.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: h.content }],
      })),
      systemInstruction: { role: 'system', parts: [{ text: system }] },
    });
    const res = await chat.sendMessage(message);
    return res.response.text();
  }

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const completion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    max_tokens: 4096,
    messages: [
      { role: 'system', content: system },
      ...history.map(h => ({
        role: (h.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
        content: h.content,
      })),
      { role: 'user', content: message },
    ],
  });
  return completion.choices[0]?.message?.content || '';
}

export async function POST(req: Request) {
  const auth = await requireSuperuser(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { message, model = 'groq', history = [], imageBase64 } = await req.json();
    if (!message?.trim()) {
      return NextResponse.json({ error: '메시지 없음' }, { status: 400 });
    }

    const ctx = await loadContext();
    const system = buildDevSystemPrompt(ctx);

    let fullMessage = message;
    if (imageBase64 && model === 'gemini') {
      fullMessage = `[이미지 첨부됨]\n${message}`;
    }

    const keyMissing =
      (model === 'claude' && !process.env.ANTHROPIC_API_KEY) ||
      (model === 'gemini' && !(process.env.GEMINI_API_KEY || process.env.GOOGLE_CLOUD_API_KEY)) ||
      (model === 'groq' && !process.env.GROQ_API_KEY);

    if (keyMissing) {
      return NextResponse.json({ error: `${model} API 키 미설정` }, { status: 503 });
    }

    const text = await callModel(model, system, fullMessage, history);
    const usedModel =
      model === 'claude' ? 'Claude Sonnet 4.6'
      : model === 'gemini' ? 'Gemini 2.5 Flash'
      : 'Groq Llama3 70B';

    await saveConversation(message, text);

    return NextResponse.json({ text, usedModel });
  } catch (e: any) {
    console.error('[dev/chat]', e);
    return NextResponse.json({ error: e.message || 'AI 오류' }, { status: 500 });
  }
}
