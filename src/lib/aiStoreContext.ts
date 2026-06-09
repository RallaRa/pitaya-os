import { adminDb } from '@/lib/firebase/admin';
import { getKSTTodayYMD, getKSTYesterdayYMD } from '@/lib/dateUtils';
import { dailyReportDocId } from '@/lib/reportCompare';
import { getDisplayNetSales, posDailySalesDocId, type SalesDocData } from '@/lib/posDailySales';
import {
  appendStoreBusinessContext,
  formatStaffingLine,
  getCurrentStaffingContext,
} from '@/lib/storeBusinessContext';

export interface AiCustomerRow {
  name?: string;
  point?: number;
  visitCount?: number;
  totalPurchase?: number;
}

export interface AiPurchaseRow {
  purchaseDate?: string;
  vendor?: string;
  totalAmount?: number;
  itemName?: string;
}

export interface AiEmployeeRow {
  name?: string;
  jobPosition?: string;
  paymentType?: string;
}

/** @deprecated AI 대화에서는 사원 정보 미제공 — loadSystemContext는 사원을 조회하지 않음 */

export interface AiStoreContext {
  today: string;
  yesterday: string;
  todaySales: SalesDocData | null;
  yesterdaySales: SalesDocData | null;
  topCustomers: AiCustomerRow[];
  recentPurchases: AiPurchaseRow[];
}

async function loadSalesDoc(storeId: string, dateYmd: string): Promise<SalesDocData | null> {
  const posSnap = await adminDb.collection('pos_daily_sales')
    .doc(posDailySalesDocId(storeId, dateYmd))
    .get();
  if (posSnap.exists) return posSnap.data() as SalesDocData;

  const reportSnap = await adminDb.collection('daily_reports')
    .doc(dailyReportDocId(storeId, dateYmd))
    .get();
  if (reportSnap.exists) return reportSnap.data() as SalesDocData;

  return null;
}

async function fetchTopCustomers(storeId: string) {
  try {
    return await adminDb.collection('pos_customers')
      .where('storeId', '==', storeId)
      .orderBy('point', 'desc')
      .limit(100)
      .get();
  } catch {
    const snap = await adminDb.collection('pos_customers')
      .where('storeId', '==', storeId)
      .limit(200)
      .get();
    const docs = [...snap.docs]
      .sort((a, b) => Number(b.data().point || 0) - Number(a.data().point || 0))
      .slice(0, 100);
    return { docs, empty: docs.length === 0, size: docs.length };
  }
}

async function fetchRecentPurchases(storeId: string) {
  try {
    return await adminDb.collection('purchase_records')
      .where('storeId', '==', storeId)
      .orderBy('purchaseDate', 'desc')
      .limit(10)
      .get();
  } catch {
    try {
      return await adminDb.collection('purchases')
        .where('storeId', '==', storeId)
        .orderBy('purchaseDate', 'desc')
        .limit(10)
        .get();
    } catch {
      const snap = await adminDb.collection('purchase_records')
        .where('storeId', '==', storeId)
        .limit(50)
        .get();
      const docs = [...snap.docs]
        .sort((a, b) => String(b.data().purchaseDate || '').localeCompare(String(a.data().purchaseDate || '')))
        .slice(0, 10);
      return { docs, empty: docs.length === 0, size: docs.length };
    }
  }
}

export async function loadSystemContext(storeId: string): Promise<AiStoreContext> {
  const today = getKSTTodayYMD();
  const yesterday = getKSTYesterdayYMD();

  const [
    todaySales,
    yesterdaySales,
    customersSnap,
    purchasesSnap,
  ] = await Promise.all([
    loadSalesDoc(storeId, today),
    loadSalesDoc(storeId, yesterday),
    fetchTopCustomers(storeId),
    fetchRecentPurchases(storeId),
  ]);

  return {
    today,
    yesterday,
    todaySales,
    yesterdaySales,
    topCustomers: customersSnap.docs.map(d => d.data() as AiCustomerRow),
    recentPurchases: purchasesSnap.docs.map(d => d.data() as AiPurchaseRow),
  };
}

export function buildStoreContextPrompt(basePrompt: string, context: AiStoreContext | null): string {
  if (!context) {
    return `${basePrompt}

(매장 데이터를 불러오지 못했습니다. 일반적인 조언만 제공합니다.)
데이터 수정·삭제·추가 요청은 정중히 거절하세요.`;
  }

  const todaySale = getDisplayNetSales(context.todaySales);
  const yesterdaySale = getDisplayNetSales(context.yesterdaySales);
  const pctChange = yesterdaySale > 0
    ? Math.round(((todaySale - yesterdaySale) / yesterdaySale) * 100)
    : null;

  const finish = context.todaySales?.finish;
  const staffing = getCurrentStaffingContext();
  const bizStatus = context.todaySales?.isClosed
    ? '마감완료'
    : `영업중 · ${staffing.modeLabel} · 365일 무휴 24h`;

  const todaySaleStr = todaySale > 0 ? `${todaySale.toLocaleString()}원` : '데이터없음';
  const pctStr = pctChange !== null ? ` (어제 대비 ${pctChange > 0 ? '+' : ''}${pctChange}%)` : '';
  const yesterdaySaleStr = yesterdaySale > 0 ? `${yesterdaySale.toLocaleString()}원` : '데이터없음';

  let prompt = appendStoreBusinessContext(`${basePrompt}

=== 현재 매장 데이터 (조회 전용 — 수정 불가) ===
오늘(${context.today}) 순매출: ${todaySaleStr}${pctStr}
어제(${context.yesterday}) 순매출: ${yesterdaySaleStr}
영업상태: ${bizStatus}
운영: ${formatStaffingLine()}`);

  if (finish) {
    const f = finish as { cardSale?: number; cashSale?: number; netSale?: number };
    prompt += `\n일마감: 카드 ${Number(f.cardSale || 0).toLocaleString()}원, 현금 ${Number(f.cashSale || 0).toLocaleString()}원, 순매출 ${Number(f.netSale || 0).toLocaleString()}원`;
  }

  const top5 = context.topCustomers.slice(0, 5);
  prompt += '\n\n상위 고객 TOP5:\n';
  if (top5.length === 0) {
    prompt += '(고객 데이터 없음)';
  } else {
    prompt += top5.map((c, i) =>
      `${i + 1}. ${c.name || '이름없음'} | 포인트:${c.point ?? 0} | 방문:${c.visitCount ?? 0}회 | 구매:${Number(c.totalPurchase || 0).toLocaleString()}원`,
    ).join('\n');
  }

  if (context.recentPurchases.length > 0) {
    prompt += `\n\n최근 매입 (${context.recentPurchases.length}건):\n`;
    prompt += context.recentPurchases.slice(0, 5).map(p =>
      `- ${p.purchaseDate || '?'} | ${p.vendor || p.itemName || '거래처'} | ${Number(p.totalAmount || 0).toLocaleString()}원`,
    ).join('\n');
  }

  prompt += '\n\n위 데이터를 바탕으로 질문에 답해줘. Pitaya OS 매출·고객·매입·쿠폰·주문·위키·사이니지 등 시스템 데이터(사원·HR 제외)와 API 카탈로그·모듈 스냅샷을 함께 참고해. 데이터 수정·삭제·추가 요청은 정중히 거절해.';

  return prompt;
}

export const DEBATE_SYSTEM_PROMPT = appendStoreBusinessContext(`너는 토론 진행자야. 사용자가 제시한 주제에 대해
찬성/반대 양측 입장을 균형있게 제시하고
논리적인 토론을 이끌어가.

정육점 사업 맥락에서 실용적인 관점으로 토론해줘.
각 주장은 3줄 이내로 핵심만.
마지막엔 종합 의견 제시.

응답 형식:
- 찬성 측: "✅ [찬성]"으로 시작
- 반대 측: "❌ [반대]"으로 시작
- 종합: "📋 [종합]"으로 시작`);

export type DebatePhase = 'pro' | 'con' | 'summary';

export function resolveDebatePhase(history: Array<{ role: string; debate?: unknown }>, message: string): DebatePhase {
  const aiTurns = history.filter(m => m.role === 'model' && !m.debate).length;
  const wantsSummary = /종합|마무리|정리|결론/.test(message);
  if (wantsSummary && aiTurns >= 2) return 'summary';
  return aiTurns % 2 === 0 ? 'pro' : 'con';
}

export function buildDebateUserMessage(topic: string, phase: DebatePhase, userMessage: string): string {
  if (phase === 'pro') {
    return `[토론 주제: "${topic}"]\n찬성 측 입장을 3줄 이내로 제시하세요.\n사용자 입력: ${userMessage}`;
  }
  if (phase === 'con') {
    return `[토론 주제: "${topic}"]\n반대 측 입장을 3줄 이내로 제시하세요.\n사용자 입력: ${userMessage}`;
  }
  return `[토론 주제: "${topic}"]\n지금까지 토론을 종합하여 실용적인 최종 의견을 제시하세요.\n사용자 입력: ${userMessage}`;
}
