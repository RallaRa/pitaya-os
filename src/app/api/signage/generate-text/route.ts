import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { verifyToken } from '@/lib/authVerify';
import { generateTextWithFallback } from '@/lib/aiProviderFallback';

export async function POST(req: NextRequest) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { prompt, type } = await req.json();
    if (!prompt?.trim()) {
      return NextResponse.json({ error: 'prompt required' }, { status: 400 });
    }

    if (type === 'slide') {
      return NextResponse.json(
        { error: '슬라이드는 Imagen+Canvas 생성을 사용합니다. signage 페이지에서 다시 생성해 주세요.' },
        { status: 400 },
      );
    }

    const systemPrompt = `정육점 사이니지용 텍스트 슬라이드 JSON을 만들어줘.
반드시 아래 JSON 형식만 반환해:
{"title": "메인 제목", "body": "부제목 또는 설명", "footer": "하단 문구(매장명 등)"}
임팩트 있고 식욕을 자극하는 문구로.`;

    let content = '';

    if (process.env.GROQ_API_KEY) {
      const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
      const completion = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        max_tokens: 2000,
        temperature: 0.8,
      });
      content = completion.choices[0]?.message?.content || '';
    } else {
      const result = await generateTextWithFallback({
        prompt,
        system: systemPrompt,
        useCase: 'fast',
      });
      content = result.text;
    }

    try {
      const parsed = JSON.parse(content.replace(/```json|```/g, '').trim());
      return NextResponse.json({ content: JSON.stringify(parsed), success: true });
    } catch {
      return NextResponse.json({ content, success: true });
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
