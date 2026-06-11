import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { verifyToken, isActiveStoreMember, canManageStore } from '@/lib/authVerify';
import { generateTextWithFallback } from '@/lib/aiProviderFallback';
import { loadSignageShowContext, formatSignageRotationSummary } from '@/lib/signage/signageShowContext';
import {
  buildSignageShowSystemPrompt,
  buildSignageShowUserPrompt,
  buildFallbackShowPlan,
  balanceSlideDurations,
  parseShowPlanFromAi,
  sanitizeSlidesForCustomer,
  type SignageSlidePlan,
} from '@/lib/signage/signageShowPlanner';

function ensureRotationSlides(ctx: Awaited<ReturnType<typeof loadSignageShowContext>>, slides: SignageSlidePlan[]): SignageSlidePlan[] {
  const hasHot = slides.some(s => s.topic === 'hot_item' || s.topic === 'popular_item');
  const hasPick = slides.some(s => s.topic === 'pick_item');
  if (hasHot && hasPick) return slides;

  const fb = buildFallbackShowPlan(ctx).slides;
  const hotSlide = fb.find(s => s.topic === 'hot_item');
  const pickSlide = fb.find(s => s.topic === 'pick_item');
  const out = [...slides];

  if (!hasHot && hotSlide) {
    out.splice(Math.min(1, out.length), 0, hotSlide);
  }
  if (!hasPick && pickSlide) {
    const idx = Math.min(2, out.length);
    out.splice(idx, 0, pickSlide);
  }

  return balanceSlideDurations(sanitizeSlidesForCustomer(out).slice(0, 5));
}

export async function POST(req: NextRequest) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const storeId = String(body.storeId || '');
    const message = String(body.message || '');
    const existingSlides = (body.existingSlides || []) as SignageSlidePlan[];

    if (!storeId) {
      return NextResponse.json({ error: 'storeId 필요' }, { status: 400 });
    }

    const member = await isActiveStoreMember(authUser.uid, storeId);
    if (!member && !await canManageStore(authUser.uid, storeId, authUser.email)) {
      return NextResponse.json({ error: '매장 접근 권한 없음' }, { status: 403 });
    }

    const ctx = await loadSignageShowContext(storeId);
    const systemPrompt = buildSignageShowSystemPrompt(ctx);
    const userPrompt = buildSignageShowUserPrompt(message, existingSlides);

    let content = '';

    if (process.env.GROQ_API_KEY) {
      const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
      const completion = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 2500,
        temperature: 0.75,
        response_format: { type: 'json_object' },
      });
      content = completion.choices[0]?.message?.content || '';
    } else {
      const result = await generateTextWithFallback({
        prompt: userPrompt,
        system: systemPrompt,
        json: true,
        useCase: 'fast',
      });
      content = result.text;
    }

    let { reply, slides } = parseShowPlanFromAi(content);
    let totalDuration = slides.reduce((sum, s) => sum + s.duration, 0);

    if (slides.length < 4) {
      const fallback = buildFallbackShowPlan(ctx);
      slides = fallback.slides;
      reply = fallback.reply;
      totalDuration = fallback.totalDuration;
    } else {
      slides = ensureRotationSlides(ctx, slides);
      totalDuration = slides.reduce((sum, s) => sum + s.duration, 0);
    }

    return NextResponse.json({
      success: true,
      reply,
      slides,
      totalDuration,
      contextSummary: {
        storeName: ctx.storeName,
        weather: ctx.weather,
        rotation: formatSignageRotationSummary(ctx),
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
