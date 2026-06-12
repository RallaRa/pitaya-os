import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { requireStockSuperuser, stockAccessDeniedResponse } from '@/lib/stock/superuserAuth';
import { fetchKisPortfolio } from '@/lib/stock/kisPortfolio.server';
import { getLatestScores } from '@/lib/stock/factorScoring.server';
import { getEngineState, saveEngineState, getStockSettings } from '@/lib/stock/settings.server';
import { runMarketScan } from '@/lib/stock/scan.server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  const auth = await requireStockSuperuser(req);
  if (auth.error || !auth.user) return stockAccessDeniedResponse(auth.code as 401 | 403);

  const url = new URL(req.url);
  const fullScan = url.searchParams.get('full') === '1';

  if (fullScan) {
    const settings = await getStockSettings(auth.user.uid);
    const result = await runMarketScan(auth.user.uid, settings);
    return NextResponse.json({ ok: result.ok, analysis: result.analysis, scan: result });
  }

  const settings = await getStockSettings(auth.user.uid);
  let portfolio;
  try {
    portfolio = await fetchKisPortfolio();
  } catch (e: unknown) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : 'KIS 조회 실패',
    }, { status: 502 });
  }

  const scores = await getLatestScores();
  const top20 = (scores?.top20 as Array<{ symbol: string; name: string; price: number; composite: number; buyProbability: number; rank: number }>) || [];

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  let parsed: Record<string, unknown>;

  if (apiKey?.trim()) {
    const prompt = `한국 주식 AI 엔진. JSON만: {"marketRegime":"","strategyMode":"","summary":"","confidence":0.5,"nextAction":"","reason":"","layer1":"","layer2":"","layer3":"","layer4":""}
portfolio=${JSON.stringify({ cash: portfolio.cash, holdings: portfolio.holdings.slice(0, 8) })}
top5=${JSON.stringify(top20.slice(0, 5))}`;

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    parsed = { summary: text.slice(0, 500), source: 'gemini' };
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = { ...JSON.parse(jsonMatch[0]), source: 'gemini' };
    } catch { /* keep fallback */ }
  } else {
    const avgPnl = portfolio.holdings.length
      ? portfolio.holdings.reduce((s, h) => s + h.pnlPct, 0) / portfolio.holdings.length
      : 0;
    const top = top20[0];
    parsed = {
      marketRegime: avgPnl > 2 ? '상승장' : avgPnl < -2 ? '하락장' : '횡보장',
      strategyMode: 'balanced',
      summary: top ? `Top ${top.name} 스코어 ${top.composite.toFixed(1)}` : '스코어 없음 — 전체 스캔 실행 권장',
      confidence: top?.buyProbability ?? 0.5,
      nextAction: top ? `검토 ${top.symbol}` : '전체 스캔',
      reason: 'Gemini 미설정 — KIS·스코어 휴리스틱',
      source: 'heuristic',
    };
  }

  await saveEngineState(auth.user.uid, {
    ...parsed,
    lastScanAt: new Date().toISOString(),
    aiConfidence: parsed.confidence ?? 0.75,
    strategyMode: parsed.strategyMode ?? 'balanced',
    aiReason: parsed.reason ?? parsed.summary,
    nextAction: parsed.nextAction ?? 'hold',
  });

  return NextResponse.json({
    ok: true,
    analysis: parsed,
    masterEnabled: settings.masterEnabled,
    hint: !settings.masterEnabled ? '자동매매는 마스터 ON 필요' : undefined,
  });
}

export async function GET(req: Request) {
  const auth = await requireStockSuperuser(req);
  if (auth.error || !auth.user) return stockAccessDeniedResponse(auth.code as 401 | 403);
  const state = await getEngineState(auth.user.uid);
  return NextResponse.json({ ok: true, state });
}
