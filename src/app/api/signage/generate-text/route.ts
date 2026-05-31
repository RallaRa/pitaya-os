import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { verifyToken } from '@/lib/authVerify';
import { generateTextWithFallback } from '@/lib/aiProviderFallback';

export async function POST(req: NextRequest) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { prompt, type, bgColor, textColor } = await req.json();
    if (!prompt?.trim()) {
      return NextResponse.json({ error: 'prompt required' }, { status: 400 });
    }

    const systemPrompt = type === 'slide'
      ? `정육점 사이니지용 HTML 슬라이드를 만들어줘.
반드시 아래 형식의 완전한 HTML만 반환해. 다른 텍스트 없이.
배경색: ${bgColor || '#1a1a2e'}, 텍스트색: ${textColor || '#ffffff'}
전체화면(100vw, 100vh)에 맞게 만들고, 큰 글씨, 임팩트 있게.
폰트는 'Noto Sans KR' 구글폰트 사용.
애니메이션 CSS 추가해서 시선을 끌게.`
      : `정육점 사이니지용 텍스트 슬라이드 JSON을 만들어줘.
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

    if (type === 'slide') {
      const html = content.replace(/```html|```/g, '').trim();
      return NextResponse.json({ content: html, success: true });
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
