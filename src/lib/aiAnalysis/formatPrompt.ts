import type { AnalysisPackId, AnalysisPackResult, SalesOperationsAnalysis } from './types';
import { getPackMeta } from './detectPack';
import { formatStaffingLine, STORE_BUSINESS_ANALYSIS_RULES } from '@/lib/storeBusinessContext';

function fmtPct(v: number | null | undefined): string {
  if (v == null) return '—';
  return `${v > 0 ? '+' : ''}${v}%`;
}

function fmtWon(n: number): string {
  return `${Math.round(n).toLocaleString('ko-KR')}원`;
}

export function formatAnalysisPromptAppendix(
  pack: AnalysisPackId,
  data: SalesOperationsAnalysis,
): string {
  const meta = getPackMeta(pack);
  const h = data.headline;
  const mf = data.memberFlow;
  const ch = data.customerHealth;

  let text = `
=== Pitaya AI 분석 팩: ${meta.label} (기준일 ${data.asOf}) ===
${meta.focusHint}

[분석 규칙]
- ${formatStaffingLine()}
${STORE_BUSINESS_ANALYSIS_RULES}
- 아래 수치는 Firestore POS·회원 품목 구매 이력(pos_customer_purchase_lines) 기반 사실입니다.
- 추측보다 수치 인용을 우선하세요. 원인은 "유입(객수/회원수) → 객단가 → 품목 mix" 순으로 분리하세요.
- 객단가 = 순매출÷POS객수, 회원 1회 구매액 = 회원매출÷방문횟수 (혼동 금지).
- 응답 형식: ①한줄 결론 ②원인(순위) ③근거 수치 ④실행 조치(3개 이내)

--- 매출 헤드라인 ---
최근7일 순매출: ${fmtWon(h.last7.net)} (POS객 ${h.last7.cust}명, 객단가 ${fmtWon(h.last7.ticket)}) | WoW ${fmtPct(h.last7.netWoW)}
직전7일 순매출: ${fmtWon(h.prev7.net)} (POS객 ${h.prev7.cust}명)
최근7일 객수 WoW: ${fmtPct(h.last7.custWoW)} | 객단가 WoW: ${fmtPct(h.last7.ticketWoW)}
최근28일 순매출: ${fmtWon(h.last28.net)} (MoM ${fmtPct(h.last28.netMoM)}) | 28일 객수 MoM: ${fmtPct(h.last28.custMoM)}

--- 회원 유입 (pos_customer_sales + 품목이력) ---
최근7일 회원 방문자: ${mf.last7.visitors}명 (직전 ${mf.prev7.visitors}명, ${fmtPct(mf.visitorWoW)})
최근7일 회원 방문 횟수: ${mf.last7.visits}회 (${fmtPct(mf.visitWoW)})
1회당 회원 구매액: ${fmtWon(mf.last7.ticket)} (${fmtPct(mf.spendPerVisitWoW)})
직전7일 대비 미재방문 회원(lost buyers): ${mf.lostBuyersCount}명`;

  if (mf.lostTopItems.length > 0) {
    text += `\n미재방문 회원이 직전7일에 많이 산 품목:\n`;
    text += mf.lostTopItems.map(i => `- ${i.name}: ${fmtWon(i.amtPrev7)}`).join('\n');
  }

  text += `

--- 고객 건강 ---
방문패턴: 끊김 ${ch.trends.churned ?? 0}명 | 감소 ${ch.trends.decreasing ?? 0}명 | 증가 ${ch.trends.increasing ?? 0}명 | 안정 ${ch.trends.stable ?? 0}명
휴면: 31~60일 ${ch.dormant.d31_60}명 | 61~180일 ${ch.dormant.d61_180}명 | 181일+ ${ch.dormant.d181plus}명 | 활성30일 ${ch.dormant.active30}명
방문감소 세그먼트 누적매출: ${fmtWon(ch.trendLifetimeSpend.decreasing ?? 0)}`;

  if (data.decreasingSegmentTopItems28d.length > 0) {
    text += `\n방문감소(${ch.trends.decreasing ?? 0}명) 최근28일 실구매 TOP:\n`;
    text += data.decreasingSegmentTopItems28d
      .slice(0, 6)
      .map(i => `- ${i.name}: ${fmtWon(i.amt28d)} (${i.buyers}명)`)
      .join('\n');
  }

  if (data.itemDeclines.length > 0) {
    text += `\n\n--- WoW 급감 품목 (회원 품목이력) ---\n`;
    text += data.itemDeclines.slice(0, 8).map(i =>
      `- ${i.name}: ${fmtWon(i.prev)}→${fmtWon(i.cur)} (${fmtPct(i.pct)}) | 구매고객 ${i.buyersPrev}→${i.buyersCur}명`,
    ).join('\n');
  }

  if (data.itemGains.length > 0) {
    text += `\n\n--- WoW 급증 품목 ---\n`;
    text += data.itemGains.slice(0, 6).map(i =>
      `- ${i.name}: ${fmtWon(i.prev)}→${fmtWon(i.cur)} (${fmtPct(i.pct)}) | 구매고객 ${i.buyersPrev}→${i.buyersCur}명`,
    ).join('\n');
  }

  if (data.categoryMix.length > 0) {
    text += `\n\n--- 카테고리 mix (최근7일 vs 직전7일) ---\n`;
    text += data.categoryMix.slice(0, 6).map(c =>
      `- ${c.cat}: ${fmtWon(c.last7)} vs ${fmtWon(c.prev7)} (${fmtPct(c.pct)})`,
    ).join('\n');
  }

  if (data.weakDays.length > 0) {
    text += `\n\n--- 요일별 일평균 (최근28일) ---\n`;
    text += data.weakDays.map(d =>
      `- ${d.dow}: 매출 ${fmtWon(d.avgNet)}, 객 ${d.avgCust}명 (${d.days}일)`,
    ).join('\n');
  }

  if (data.weeklyTrend.length >= 4) {
    const recent = data.weeklyTrend.slice(-4);
    text += `\n\n--- 주간 추이 (최근4주) ---\n`;
    text += recent.map(w =>
      `- ${w.week}: ${fmtWon(w.net)}, 객 ${w.cust}명, 객단가 ${fmtWon(w.ticket)}`,
    ).join('\n');
  }

  return text.trim();
}

export function buildAnalysisPackResult(
  pack: AnalysisPackId,
  data: SalesOperationsAnalysis,
): AnalysisPackResult {
  const meta = getPackMeta(pack);
  return {
    pack,
    packLabel: meta.label,
    focusHint: meta.focusHint,
    data,
    promptAppendix: formatAnalysisPromptAppendix(pack, data),
    summary: {
      netWoW: data.headline.last7.netWoW,
      custWoW: data.headline.last7.custWoW,
      lostBuyers: data.memberFlow.lostBuyersCount,
      decreasingCustomers: data.customerHealth.trends.decreasing ?? 0,
    },
  };
}
