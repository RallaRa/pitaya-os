import { GoogleGenerativeAI } from '@google/generative-ai';
import { fetchKisPortfolio } from '@/lib/stock/kisPortfolio.server';
import { computeFactorScores, saveFactorScores, getLatestScores } from '@/lib/stock/factorScoring.server';
import { runUniverseFilter } from '@/lib/stock/universe.server';
import { getEngineState, saveEngineState, getStockSettings, type StockSettings } from '@/lib/stock/settings.server';

export interface ScanStep {
  ok: boolean;
  error?: string;
  [key: string]: unknown;
}

export interface ScanResult {
  ok: boolean;
  steps: {
    universe: ScanStep;
    scores: ScanStep;
    ai: ScanStep;
  };
  analysis?: Record<string, unknown>;
  topPick?: { symbol: string; name: string; price: number; buyProbability: number };
  errors: string[];
}

function heuristicAnalysis(params: {
  portfolio: Awaited<ReturnType<typeof fetchKisPortfolio>>;
  top20: ReturnType<typeof computeFactorScores>;
  strategyMode: string;
}): Record<string, unknown> {
  const top = params.top20[0];
  const avgPnl = params.portfolio.holdings.length
    ? params.portfolio.holdings.reduce((s, h) => s + h.pnlPct, 0) / params.portfolio.holdings.length
    : 0;
  const regime = avgPnl > 2 ? '상승장' : avgPnl < -2 ? '하락장' : '횡보장';
  return {
    marketRegime: regime,
    strategyMode: params.strategyMode,
    summary: top
      ? `Top ${top.name}(${top.symbol}) 복합 ${top.composite.toFixed(1)} · 매수확률 ${(top.buyProbability * 100).toFixed(0)}%`
      : '유니버스 후보 없음 — 필터 완화 필요',
    confidence: top?.buyProbability ?? 0.5,
    nextAction: top && top.buyProbability >= 0.6 ? `매수 검토: ${top.symbol}` : '관망',
    reason: 'KIS 시세·팩터 스코어 기반 휴리스틱 (Gemini 미사용)',
    layer1: `시장 ${regime}`,
    layer2: top ? `${top.rank}위 ${top.name}` : '—',
    layer3: top ? `가격 ${top.price.toLocaleString()}원` : '—',
    layer4: `보유 ${params.portfolio.holdings.length}종 · 현금 ${params.portfolio.cash.toLocaleString()}원`,
    source: 'heuristic',
  };
}

async function runGeminiAnalysis(
  portfolio: Awaited<ReturnType<typeof fetchKisPortfolio>>,
  top20: ReturnType<typeof computeFactorScores>,
): Promise<Record<string, unknown>> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey?.trim()) {
    throw new Error('GEMINI_API_KEY 미설정');
  }

  const prompt = `당신은 한국 주식 AI 자동매매 엔진입니다. JSON만 반환:
{"marketRegime":"상승장|하락장|횡보장|급변동","strategyMode":"aggressive|balanced|conservative","summary":"한줄","confidence":0.0-1.0,"nextAction":"다음","reason":"근거","layer1":"","layer2":"","layer3":"","layer4":""}
포트폴리오: ${JSON.stringify({ cash: portfolio.cash, totalEval: portfolio.totalEval, holdings: portfolio.holdings.slice(0, 8) })}
Top5: ${JSON.stringify(top20.slice(0, 5))}`;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  const result = await model.generateContent(prompt);
  const text = result.response.text();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return { ...JSON.parse(jsonMatch[0]), source: 'gemini' };
  }
  return { summary: text.slice(0, 500), source: 'gemini_raw' };
}

export async function runMarketScan(uid: string, settings: StockSettings): Promise<ScanResult> {
  const errors: string[] = [];
  const engine = await getEngineState(uid);
  const strategyMode = String(engine?.strategyMode || engine?.marketRegime || 'balanced');

  let portfolio: Awaited<ReturnType<typeof fetchKisPortfolio>>;
  try {
    portfolio = await fetchKisPortfolio();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'KIS 조회 실패';
    portfolio = { cash: 0, totalEval: 0, holdings: [], paper: false, live: true };
    errors.push(`KIS: ${msg} — 시드 데이터로 스캔 계속`);
  }

  let universeStep: ScanStep = { ok: false };
  let scoresStep: ScanStep = { ok: false };
  let aiStep: ScanStep = { ok: false };
  let top20: ReturnType<typeof computeFactorScores> = [];
  let universeResult: Awaited<ReturnType<typeof runUniverseFilter>> | null = null;

  try {
    universeResult = await runUniverseFilter(settings, strategyMode);
    universeStep = {
      ok: true,
      passed: universeResult.passed.length,
      total: universeResult.candidates.length,
      date: universeResult.date,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    universeStep = { ok: false, error: msg };
    errors.push(`유니버스: ${msg}`);
  }

  try {
    const passed = universeResult?.passed ?? [];
    top20 = computeFactorScores(passed, settings, strategyMode);
    const date = await saveFactorScores(uid, top20, settings.factorWeights, strategyMode);
    scoresStep = {
      ok: true,
      date,
      count: top20.length,
      top: top20.slice(0, 3).map(r => ({ symbol: r.symbol, name: r.name, score: r.composite })),
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    scoresStep = { ok: false, error: msg };
    errors.push(`스코어: ${msg}`);
    const cached = await getLatestScores();
    top20 = (cached?.top20 as typeof top20) || [];
  }

  let analysis: Record<string, unknown> = {};
  try {
    analysis = await runGeminiAnalysis(portfolio, top20);
    aiStep = { ok: true, source: analysis.source };
  } catch (e: unknown) {
    analysis = heuristicAnalysis({ portfolio, top20, strategyMode });
    aiStep = {
      ok: true,
      source: 'heuristic',
      warning: e instanceof Error ? e.message : String(e),
    };
    if (String(aiStep.warning).includes('GEMINI')) {
      errors.push('Gemini 미설정 — 휴리스틱 분석 사용');
    }
  }

  await saveEngineState(uid, {
    ...analysis,
    lastScanAt: new Date().toISOString(),
    aiConfidence: analysis.confidence ?? 0.5,
    strategyMode: analysis.strategyMode ?? strategyMode,
    aiReason: analysis.reason ?? analysis.summary,
    nextAction: analysis.nextAction ?? '관망',
  });

  const topPick = top20[0]
    ? { symbol: top20[0].symbol, name: top20[0].name, price: top20[0].price, buyProbability: top20[0].buyProbability }
    : undefined;

  return {
    ok: universeStep.ok && scoresStep.ok,
    steps: { universe: universeStep, scores: scoresStep, ai: aiStep },
    analysis,
    topPick,
    errors,
  };
}
