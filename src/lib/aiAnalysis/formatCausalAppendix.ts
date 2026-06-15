import { addDaysYMD, getKSTTodayYMD } from '@/lib/dateUtils';
import { getDisplayNetSales, posDailySalesDocId, type SalesDocData } from '@/lib/posDailySales';
import { dailyReportDocId } from '@/lib/reportCompare';
import { adminDb } from '@/lib/firebase/admin';
import { estimateFootTrafficWithComparisons } from '@/lib/areaContext';
import { analyzeHolidayDemand } from '@/lib/holidayDemandContext';
import { resolvePredictionHolidaySet } from '@/lib/predictionCalendarContext';
import type { SalesOperationsAnalysis } from './types';

const DOW_KO = ['일', '월', '화', '수', '목', '금', '토'];

function fmtWon(n: number): string {
  return `${Math.round(n).toLocaleString('ko-KR')}원`;
}

function fmtPct(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—';
  return `${v > 0 ? '+' : ''}${v}%`;
}

function dowLabel(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00+09:00`);
  return DOW_KO[d.getDay()];
}

async function loadSalesDay(storeId: string, date: string) {
  const posSnap = await adminDb.collection('pos_daily_sales')
    .doc(posDailySalesDocId(storeId, date))
    .get();
  if (posSnap.exists) return posSnap.data() as SalesDocData;

  const reportSnap = await adminDb.collection('daily_reports')
    .doc(dailyReportDocId(storeId, date))
    .get();
  if (reportSnap.exists) return reportSnap.data() as SalesDocData;

  return null;
}

async function loadRecentDailySales(storeId: string, days = 14) {
  const asOf = getKSTTodayYMD();
  const start = addDaysYMD(asOf, -(days - 1));
  const rows: Array<{ date: string; dow: string; net: number; cust: number; ticket: number }> = [];

  for (let d = start; d <= asOf; d = addDaysYMD(d, 1)) {
    const raw = await loadSalesDay(storeId, d);
    const net = getDisplayNetSales(raw);
    const row = raw as (SalesDocData & { customerCount?: number; transCount?: number }) | null;
    const cust = Number(row?.customerCount ?? row?.transCount ?? 0);
    if (net <= 0 && cust <= 0) continue;
    rows.push({
      date: d,
      dow: dowLabel(d),
      net,
      cust,
      ticket: cust > 0 ? net / cust : 0,
    });
  }
  return rows;
}

/** 매출 변동을 객수·객단가 기여도로 분해 */
function decomposeRevenueChange(
  prev: { net: number; cust: number; ticket: number },
  cur: { net: number; cust: number; ticket: number },
) {
  const deltaNet = cur.net - prev.net;
  if (prev.net <= 0) {
    return { deltaNet, custEffect: 0, ticketEffect: 0, custSharePct: null, ticketSharePct: null };
  }
  const custEffect = (cur.cust - prev.cust) * prev.ticket;
  const ticketEffect = cur.cust * (cur.ticket - prev.ticket);
  const total = Math.abs(custEffect) + Math.abs(ticketEffect) || 1;
  return {
    deltaNet,
    custEffect: Math.round(custEffect),
    ticketEffect: Math.round(ticketEffect),
    custSharePct: Math.round((Math.abs(custEffect) / total) * 100),
    ticketSharePct: Math.round((Math.abs(ticketEffect) / total) * 100),
  };
}

function buildCauseCandidates(data: SalesOperationsAnalysis): string[] {
  const h = data.headline;
  const mf = data.memberFlow;
  const ch = data.customerHealth;
  const causes: string[] = [];

  const decomp = decomposeRevenueChange(
    { net: h.prev7.net, cust: h.prev7.cust, ticket: h.prev7.ticket },
    { net: h.last7.net, cust: h.last7.cust, ticket: h.last7.ticket },
  );

  if (h.last7.netWoW != null && h.last7.netWoW < -5) {
    if (decomp.custSharePct != null && decomp.custSharePct >= 55) {
      causes.push(
        `[유입↓] POS객 WoW ${fmtPct(h.last7.custWoW)} (${h.prev7.cust}→${h.last7.cust}명) — 객수 감소가 매출 하락의 약 ${decomp.custSharePct}% 기여 (추정 ${fmtWon(decomp.custEffect)})`,
      );
    } else if (decomp.ticketSharePct != null && decomp.ticketSharePct >= 55) {
      causes.push(
        `[객단가↓] 객단가 WoW ${fmtPct(h.last7.ticketWoW)} (${fmtWon(h.prev7.ticket)}→${fmtWon(h.last7.ticket)}) — 단가 하락이 매출 변동의 약 ${decomp.ticketSharePct}% 기여`,
      );
    }
  }

  if (mf.lostBuyersCount >= 5) {
    const items = mf.lostTopItems.slice(0, 3).map(i => i.name).join('·') || '—';
    causes.push(
      `[회원이탈] 직전7일 구매 후 미재방문 ${mf.lostBuyersCount}명 — 이들이 많이 산 품목: ${items}`,
    );
  }

  if ((ch.trends.decreasing ?? 0) >= 10) {
    causes.push(
      `[방문감소] 방문패턴 감소 고객 ${ch.trends.decreasing}명 (누적매출 ${fmtWon(ch.trendLifetimeSpend.decreasing ?? 0)})`,
    );
  }

  if ((ch.trends.churned ?? 0) >= 5) {
    causes.push(`[방문끊김] 60일+ 미방문·주기 초과 고객 ${ch.trends.churned}명`);
  }

  const topDecline = data.itemDeclines[0];
  if (topDecline && (topDecline.pct ?? 0) <= -20) {
    causes.push(
      `[품목mix↓] ${topDecline.name} WoW ${fmtPct(topDecline.pct)} (${fmtWon(topDecline.prev)}→${fmtWon(topDecline.cur)}, 구매고객 ${topDecline.buyersPrev}→${topDecline.buyersCur}명)`,
    );
  }

  const topGain = data.itemGains[0];
  if (topGain && (topGain.pct ?? 0) >= 20) {
    causes.push(
      `[품목mix↑] ${topGain.name} WoW ${fmtPct(topGain.pct)} (구매고객 ${topGain.buyersPrev}→${topGain.buyersCur}명) — 상쇄·성장 요인`,
    );
  }

  const weakDay = [...data.weakDays].sort((a, b) => a.avgNet - b.avgNet)[0];
  const strongDay = [...data.weakDays].sort((a, b) => b.avgNet - a.avgNet)[0];
  if (weakDay && strongDay && weakDay.dow !== strongDay.dow && weakDay.avgNet > 0) {
    causes.push(
      `[요일패턴] 최근28일 약한 요일 ${weakDay.dow} (일평균 ${fmtWon(weakDay.avgNet)}) vs 강한 ${strongDay.dow} (${fmtWon(strongDay.avgNet)})`,
    );
  }

  if (mf.visitorWoW != null && mf.visitorWoW < -10) {
    causes.push(
      `[회원유입↓] 회원 방문자 WoW ${fmtPct(mf.visitorWoW)} (${mf.prev7.visitors}→${mf.last7.visitors}명), 1회 구매액 ${fmtWon(mf.last7.ticket)}`,
    );
  }

  return causes.slice(0, 6);
}

export async function formatCausalAnalysisAppendix(
  storeId: string,
  data: SalesOperationsAnalysis,
  opts: { regionSido?: string; regionSigungu?: string } = {},
): Promise<string> {
  const h = data.headline;
  const decomp = decomposeRevenueChange(
    { net: h.prev7.net, cust: h.prev7.cust, ticket: h.prev7.ticket },
    { net: h.last7.net, cust: h.last7.cust, ticket: h.last7.ticket },
  );

  const [daily, footTraffic, holidaySet] = await Promise.all([
    loadRecentDailySales(storeId, 14),
    Promise.resolve(estimateFootTrafficWithComparisons(
      opts.regionSido || '서울',
      opts.regionSigungu || '',
    )),
    resolvePredictionHolidaySet(process.env.PUBLIC_DATA_API_KEY || '', getKSTTodayYMD()).catch(() => new Set<string>()),
  ]);

  const today = getKSTTodayYMD();
  const holiday = analyzeHolidayDemand(today, holidaySet);

  let block = `
=== 원인 분해·현장 맥락 (자동 계산, ${data.asOf}) ===

[매출 WoW 분해 — 최근7일 vs 직전7일]
순매출: ${fmtWon(h.prev7.net)} → ${fmtWon(h.last7.net)} (${fmtPct(h.last7.netWoW)})
POS객: ${h.prev7.cust} → ${h.last7.cust}명 (${fmtPct(h.last7.custWoW)}) | 객단가: ${fmtWon(h.prev7.ticket)} → ${fmtWon(h.last7.ticket)} (${fmtPct(h.last7.ticketWoW)})
▶ 객수 기여 추정: ${fmtWon(decomp.custEffect)}${decomp.custSharePct != null ? ` (약 ${decomp.custSharePct}%)` : ''}
▶ 객단가 기여 추정: ${fmtWon(decomp.ticketEffect)}${decomp.ticketSharePct != null ? ` (약 ${decomp.ticketSharePct}%)` : ''}
※ 원인 분석 시 반드시 「유입(객수/회원수) → 객단가 → 품목 mix → 외부(시장·날씨·뉴스)」 순으로 분리하고, 위 기여도와 아래 후보를 연결해 설명하세요.`;

  const candidates = buildCauseCandidates(data);
  if (candidates.length > 0) {
    block += `\n\n[데이터 기반 원인 후보 — 우선순위대로 인용]\n`;
    block += candidates.map((c, i) => `${i + 1}. ${c}`).join('\n');
  }

  if (daily.length >= 3) {
    block += `\n\n[일별 매출 (최근 ${daily.length}일)]\n`;
    block += daily.map(r =>
      `${r.date}(${r.dow}): ${fmtWon(r.net)}, 객 ${r.cust}명, 객단가 ${fmtWon(r.ticket)}`,
    ).join('\n');
    const last3 = daily.slice(-3);
    const prev3 = daily.slice(-6, -3);
    if (prev3.length === 3 && last3.length === 3) {
      const sum = (arr: typeof daily) => arr.reduce((a, r) => ({ net: a.net + r.net, cust: a.cust + r.cust }), { net: 0, cust: 0 });
      const p = sum(prev3);
      const c = sum(last3);
      block += `\n최근3일 vs 직전3일: 매출 ${fmtWon(p.net)}→${fmtWon(c.net)}, 객 ${p.cust}→${c.cust}명`;
    }
  }

  block += `\n\n[상권·유동] 지수 ${footTraffic.index} (어제 대비 ${footTraffic.comparisons.vsYesterday.changePct ?? '—'}%, 전주동요일 ${footTraffic.comparisons.vsLastWeek.changePct ?? '—'}%)`;
  if (holiday.label || holiday.promptLines.length > 0) {
    block += `\n[오늘 일정] ${holiday.demandSummary || holiday.label || '평일'}`;
    if (holiday.promptLines.length > 0) {
      block += ` — ${holiday.promptLines[0]}`;
    }
  }

  block += `\n\n※ 원인 서술 규칙: (1) 위 후보 중 **2~4개를 골라 수치 인용** (2) 「아마」「것 같다」만 쓰지 말고 **어떤 고객·품목·요일·시장 요인이 매출에 어떻게 연결됐는지** 한 문장으로 (3) 유인(11–21시)/무인(21–11시) 중 어디서 발생했을 가능성 언급 (4) 데이터 없는 원인은 제외`;

  return block;
}
