import { GoogleGenerativeAI } from '@google/generative-ai';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import {
  DEFAULT_STOCK_SETTINGS,
  getStockPortfolioDoc,
  getStockSettings,
  saveStockSettings,
  type StockSettings,
} from '@/lib/stock/settings.server';
import { fetchKisPortfolio, isKisConfigured } from '@/lib/stock/kisPortfolio.server';

export type ChatIntent =
  | 'QUERY'
  | 'STRATEGY_CHANGE'
  | 'TRADE_COMMAND'
  | 'RISK_CHANGE'
  | 'EMERGENCY';

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  responseType?: 'answer' | 'confirm' | 'warning';
  cards?: Array<{ label: string; value: string }>;
  pendingAction?: PendingChatAction | null;
}

export interface PendingChatAction {
  type: ChatIntent;
  patch: Partial<StockSettings> & Record<string, unknown>;
  summary: string;
  impact: string;
  dangerous?: boolean;
}

const CHAT_COLLECTION = 'stock_chat';

function classifyIntent(text: string): ChatIntent {
  const t = text.trim();
  if (/전량|현금화|긴급.*중단|매매.*중단|오늘.*중단/.test(t)) return 'EMERGENCY';
  if (/손절|MDD|리스크|비중.*줄|보수|공격|현금.*비중|섹터/.test(t)) return 'RISK_CHANGE';
  if (/리밸런싱|전략|모드|매수.*금지|매도.*금지/.test(t)) return 'STRATEGY_CHANGE';
  if (/매수|매도|사도|팔/.test(t)) return 'TRADE_COMMAND';
  return 'QUERY';
}

function parseActionFromMessage(message: string, intent: ChatIntent): PendingChatAction | null {
  const t = message.trim();
  if (intent === 'EMERGENCY' && /전량|현금화/.test(t)) {
    return {
      type: intent,
      patch: { masterEnabled: false, chatEmergencyLiquidate: true },
      summary: '전량 매도 후 현금화 + 자동매매 OFF',
      impact: '모든 보유 종목 청산 주문이 POS 엔진에 전달됩니다.',
      dangerous: true,
    };
  }
  if (/매매.*중단|오늘.*중단|전체.*중단/.test(t)) {
    return {
      type: 'EMERGENCY',
      patch: { masterEnabled: false },
      summary: '오늘 자동매매 중단',
      impact: '신규 주문이 즉시 중단됩니다.',
      dangerous: false,
    };
  }
  if (/보수/.test(t)) {
    return {
      type: 'STRATEGY_CHANGE',
      patch: { strategyMode: 'conservative', factorWeights: { momentum: 0.15, value: 0.25, quality: 0.35, lowVol: 0.15, flow: 0.10 } },
      summary: '보수적 모드 전환',
      impact: '퀄리티·저변동성 비중 증가, 신규 매수 보수적',
    };
  }
  if (/공격/.test(t)) {
    return {
      type: 'STRATEGY_CHANGE',
      patch: { strategyMode: 'aggressive', factorWeights: { momentum: 0.40, value: 0.15, quality: 0.20, lowVol: 0.10, flow: 0.15 } },
      summary: '공격적 모드 전환',
      impact: '모멘텀 비중 증가, 진입 적극화',
    };
  }
  const cashMatch = t.match(/현금\s*비중\s*(\d+)\s*%/);
  if (cashMatch) {
    const pct = Number(cashMatch[1]) / 100;
    return {
      type: 'RISK_CHANGE',
      patch: { chatCashTarget: pct },
      summary: `현금 비중 ${cashMatch[1]}% 목표`,
      impact: 'POS 엔진이 리밸런싱 방향을 조정합니다.',
    };
  }
  const stopMatch = t.match(/손절\s*(-?\d+)\s*%/);
  if (stopMatch) {
    return {
      type: 'RISK_CHANGE',
      patch: { stopLossPct: Math.abs(Number(stopMatch[1])) },
      summary: `손절 기준 ${stopMatch[1]}%`,
      impact: '개별 종목 손절 라인이 변경됩니다.',
    };
  }
  return null;
}

async function callGemini(prompt: string) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) return { vote: 'approve' as const, reason: 'Gemini 미설정 — 규칙 기반 처리' };
  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const result = await model.generateContent(prompt);
  const text = result.response.text();
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]) as { vote?: string; reason?: string; answer?: string };
      return {
        vote: parsed.vote === 'reject' ? 'reject' as const : 'approve' as const,
        reason: parsed.reason || parsed.answer || text.slice(0, 200),
      };
    } catch { /* fallthrough */ }
  }
  return { vote: 'approve' as const, reason: text.slice(0, 200) };
}

async function callClaude(prompt: string) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { vote: 'approve' as const, reason: 'Claude 미설정 — 규칙 기반 처리' };
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = await res.json();
  const text = data.content?.[0]?.text || '';
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]) as { vote?: string; reason?: string; answer?: string };
      return {
        vote: parsed.vote === 'reject' ? 'reject' as const : 'approve' as const,
        reason: parsed.reason || parsed.answer || text.slice(0, 200),
      };
    } catch { /* fallthrough */ }
  }
  return { vote: 'approve' as const, reason: text.slice(0, 200) };
}

async function buildContext(uid: string) {
  const settings = await getStockSettings(uid);
  const saved = await getStockPortfolioDoc(uid);
  let portfolio = saved;
  if (isKisConfigured()) {
    try {
      const kis = await fetchKisPortfolio();
      portfolio = { totalEval: kis.totalEval, cash: kis.cash, holdings: kis.holdings };
    } catch { /* use saved */ }
  }
  const totalEval = Number(portfolio?.totalEval || 0);
  const cash = Number(portfolio?.cash || 0);
  const holdings = (portfolio?.holdings as Array<{ name?: string; pnlPct?: number }>) || [];
  return {
    settings,
    summary: {
      totalEval,
      cash,
      cashRatio: totalEval > 0 ? (cash / totalEval) * 100 : 100,
      holdingsCount: holdings.length,
      topHolding: holdings[0]?.name || '없음',
    },
  };
}

export async function processStockChat(uid: string, sessionId: string, message: string, history: ChatMessage[] = []) {
  const intent = classifyIntent(message);
  const ctx = await buildContext(uid);
  const pendingAction = parseActionFromMessage(message, intent);

  const prompt = `한국 주식 AI 트레이더 어시스턴트. JSON만: {"vote":"approve"|"reject","reason":"2줄","answer":"사용자 답변"}
intent: ${intent}
portfolio: ${JSON.stringify(ctx.summary)}
settings: ${JSON.stringify({ masterEnabled: ctx.settings.masterEnabled, strategyMode: ctx.settings.strategyMode || 'balanced' })}
message: ${message}
history: ${JSON.stringify(history.slice(-3).map(h => h.text))}`;

  const [gemini, claude] = await Promise.allSettled([callGemini(prompt), callClaude(prompt)]);
  const geminiResult = gemini.status === 'fulfilled' ? gemini.value : { vote: 'approve' as const, reason: 'Gemini 오류' };
  const claudeResult = claude.status === 'fulfilled' ? claude.value : { vote: 'approve' as const, reason: 'Claude 오류' };

  const bothApprove = geminiResult.vote === 'approve' && claudeResult.vote === 'approve';
  const anyReject = geminiResult.vote === 'reject' || claudeResult.vote === 'reject';

  let responseType: ChatMessage['responseType'] = 'answer';
  let text = `${geminiResult.reason}\n${claudeResult.reason}`;

  if (intent === 'QUERY') {
    text = [
      geminiResult.reason,
      '',
      `[포트폴리오] 평가 ${ctx.summary.totalEval.toLocaleString()}원 · 현금 ${ctx.summary.cashRatio.toFixed(1)}% · 보유 ${ctx.summary.holdingsCount}종목`,
    ].join('\n');
  } else if (pendingAction) {
    responseType = anyReject && !bothApprove ? 'warning' : 'confirm';
    text = [
      `변경: ${pendingAction.summary}`,
      `예상 영향: ${pendingAction.impact}`,
      '',
      `Gemini: ${geminiResult.reason}`,
      `Claude: ${claudeResult.reason}`,
      '',
      bothApprove ? '이렇게 변경할까요?' : 'AI가 위험 요소를 감지했습니다. 그래도 실행하시겠습니까?',
    ].join('\n');
  }

  const cards = [
    { label: '총 평가', value: `${ctx.summary.totalEval.toLocaleString()}원` },
    { label: '현금 비중', value: `${ctx.summary.cashRatio.toFixed(1)}%` },
    { label: '보유 종목', value: `${ctx.summary.holdingsCount}개` },
  ];

  const assistant: ChatMessage = {
    role: 'assistant',
    text,
    responseType,
    cards: intent === 'QUERY' ? cards : undefined,
    pendingAction: pendingAction && (responseType === 'confirm' || responseType === 'warning') ? pendingAction : null,
  };

  await adminDb.collection(CHAT_COLLECTION).doc(sessionId).set({
    uid,
    sessionId,
    messages: FieldValue.arrayUnion(
      { role: 'user', text: message, at: new Date().toISOString() },
      { ...assistant, at: new Date().toISOString() },
    ),
    lastMessage: message,
    lastIntent: intent,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return {
    intent,
    message: assistant,
    gemini: geminiResult,
    claude: claudeResult,
    bothApprove,
    anyReject,
  };
}

export async function confirmStockChatAction(uid: string, sessionId: string, action: PendingChatAction, force = false) {
  const settings = await getStockSettings(uid);
  if (action.dangerous && !force) {
    return { ok: false, error: 'FORCE_REQUIRED' };
  }

  const patch: Partial<StockSettings> & Record<string, unknown> = { ...action.patch };
  if (patch.factorWeights) {
    patch.factorWeights = { ...DEFAULT_STOCK_SETTINGS.factorWeights, ...(patch.factorWeights as StockSettings['factorWeights']) };
  }

  await saveStockSettings(uid, patch);

  await adminDb.collection(CHAT_COLLECTION).doc(sessionId).set({
    confirmedAt: new Date().toISOString(),
    appliedPatch: patch,
    messages: FieldValue.arrayUnion({
      role: 'assistant',
      text: `✅ 설정 적용 완료: ${action.summary}`,
      at: new Date().toISOString(),
    }),
  }, { merge: true });

  return { ok: true, patch, masterEnabled: patch.masterEnabled ?? settings.masterEnabled };
}

export async function getStockChatHistory(sessionId: string) {
  const snap = await adminDb.collection(CHAT_COLLECTION).doc(sessionId).get();
  if (!snap.exists) return { messages: [] as ChatMessage[] };
  const data = snap.data();
  return { messages: (data?.messages || []) as ChatMessage[] };
}
