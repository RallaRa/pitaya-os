/**
 * 위젯별 예측·제안 분석 — 경영성과(매출·목표·고객·예측 적중) 컨텍스트 기반
 */

export interface PerformanceContext {
  todayYmd: string;
  todayNetSales: number;
  yesterdayNetSales: number;
  salesChangePct: number | null;
  weekNetSales: number;
  weekSalesChangePct: number | null;
  monthNetSales: number;
  monthSalesChangePct: number | null;
  weekTargetPacePct: number | null;
  monthTargetPacePct: number | null;
  monthTargetSalesPct: number | null;
  predictionAccuracyPct: number | null;
  predictionTopItems: string[];
  predictionInsightSummary: string | null;
  weeklyTopItem: string | null;
  yesterdayTopItem: string | null;
  customerVisitorChangePct: number | null;
  bepProgressPct: number | null;
  bepAchieved: boolean;
  bepRemaining: number;
}

export interface WidgetAnalysisBlock {
  prediction?: string;
  suggestions: string[];
  basis?: string;
}

export type WidgetAnalysisId =
  | 'today_sales'
  | 'sales_compare'
  | 'sales_prediction'
  | 'ai_insight'
  | 'total_partner'
  | 'weekly_analysis'
  | 'yesterday_analysis'
  | 'weather'
  | 'news'
  | 'customer_visit'
  | 'churn_risk'
  | 'sales_heatmap'
  | 'cost_ratio'
  | 'margin_ranking'
  | 'dow_profitability'
  | 'sales_category'
  | 'time_slot_aov'
  | 'break_even'
  | 'repurchase_due';

function fmtWon(n: number): string {
  if (n <= 0) return '0원';
  if (n >= 10000) return `${Math.round(n / 10000).toLocaleString()}만원`;
  return `${n.toLocaleString()}원`;
}

function fmtPct(v: number | null | undefined, suffix = '%'): string {
  if (v == null) return '-';
  return `${v > 0 ? '+' : ''}${v}${suffix}`;
}

function paceHint(pace: number | null): string | null {
  if (pace == null) return null;
  if (pace >= 105) return `월 목표 진도 ${pace}% — 호조, 재고·인기품목 선제 확보`;
  if (pace >= 95) return `월 목표 진도 ${pace}% — 정상 궤도, 전주 패턴 유지`;
  if (pace >= 80) return `월 목표 진도 ${pace}% — 다소 부진, 피크 시간대 진열·프로모 검토`;
  return `월 목표 진도 ${pace}% — 목표 대비 지연, 베스트셀러 할인·단골 알림 권장`;
}

function predictionAccuracyHint(ctx: PerformanceContext): string | null {
  if (ctx.predictionAccuracyPct == null) return null;
  const p = ctx.predictionAccuracyPct;
  if (p >= 70) return `최근 예측 적중률 ${p}% — AI TOP 품목 진열 우선`;
  if (p >= 50) return `최근 예측 적중률 ${p}% — 통계+AI 혼합, 실매출 대조 후 조정`;
  return `최근 예측 적중률 ${p}% — 예측 참고용, 전일·주간 실적 위주 운영`;
}

function crossRefTopItems(ctx: PerformanceContext, itemName?: string | null): string[] {
  const out: string[] = [];
  if (ctx.predictionTopItems.length) {
    out.push(`오늘 AI 예측 TOP: ${ctx.predictionTopItems.slice(0, 3).join(', ')}`);
  }
  if (ctx.weeklyTopItem && itemName !== ctx.weeklyTopItem) {
    out.push(`주간 1위 ${ctx.weeklyTopItem} — 지속 진열 강화`);
  }
  if (ctx.yesterdayTopItem && itemName !== ctx.yesterdayTopItem) {
    out.push(`전일 1위 ${ctx.yesterdayTopItem} — 재진열·재고 확인`);
  }
  return out;
}

export function buildTodaySalesAnalysis(
  data: { todayNet?: number; yesterdayNet?: number; isClosed?: boolean },
  ctx: PerformanceContext,
): WidgetAnalysisBlock {
  const today = data.todayNet ?? ctx.todayNetSales;
  const yesterday = data.yesterdayNet ?? ctx.yesterdayNetSales;
  const change = ctx.salesChangePct;
  const suggestions: string[] = [];

  let prediction: string | undefined;
  if (change != null) {
    if (change >= 10) {
      prediction = `어제 대비 ${fmtPct(change)} 호조 — 오후 피크까지 ${fmtWon(today)} 유지 시 주간 목표 달성 가속`;
    } else if (change <= -10) {
      prediction = `어제 대비 ${fmtPct(change)} 부진 — 잔여 시간대 베스트셀러·세트 구성으로 회복 필요`;
    } else {
      prediction = `어제(${fmtWon(yesterday)}) 대비 ${fmtPct(change)} — 평시 수준, 피크 전후 진열 점검`;
    }
  } else {
    prediction = `오늘 순매출 ${fmtWon(today)} — 전일 비교 데이터 수집 중`;
  }

  const pace = paceHint(ctx.monthTargetPacePct);
  if (pace) suggestions.push(pace);

  const acc = predictionAccuracyHint(ctx);
  if (acc) suggestions.push(acc);

  if (ctx.bepProgressPct != null && !ctx.bepAchieved && ctx.bepRemaining > 0) {
    suggestions.push(`손익분기까지 ${fmtWon(ctx.bepRemaining)} — BEP 달성 품목·객단가 높은 시간대 집중`);
  }

  if (data.isClosed) {
    suggestions.push('마감 완료 — 내일 예측·발주 위젯에서 준비 품목 확인');
  } else if (ctx.predictionTopItems.length) {
    suggestions.push(`${ctx.predictionTopItems[0]} 등 예측 상위품목 전면 진열`);
  }

  return {
    prediction,
    suggestions: suggestions.slice(0, 3),
    basis: `POS 순매출·목표 진도·예측 적중(${ctx.predictionAccuracyPct ?? '-'}%)`,
  };
}

export function buildSalesCompareAnalysis(
  data: {
    week?: {
      pct?: number | null;
      target?: {
        progress?: {
          salesPacePct?: number | null;
          salesPct?: number | null;
          achievementLikelihoodPct?: number | null;
          dailySalesNeeded?: number;
          dailyCustomersNeeded?: number;
          daysRemaining?: number;
        };
      };
    };
    month?: {
      pct?: number | null;
      target?: {
        progress?: {
          salesPacePct?: number | null;
          salesPct?: number | null;
          achievementLikelihoodPct?: number | null;
          dailySalesNeeded?: number;
          dailyCustomersNeeded?: number;
          daysRemaining?: number;
        };
      };
    };
  },
  ctx: PerformanceContext,
): WidgetAnalysisBlock {
  const monthProg = data.month?.target?.progress;
  const monthPace = monthProg?.salesPacePct ?? ctx.monthTargetPacePct;
  const weekPct = data.week?.pct ?? ctx.weekSalesChangePct;
  const monthPct = data.month?.pct ?? ctx.monthSalesChangePct;

  let prediction: string | undefined;
  if (monthProg?.achievementLikelihoodPct != null) {
    const daily = monthProg.dailySalesNeeded
      ? `잔여 ${monthProg.daysRemaining ?? '-'}일 · 일 ${fmtWon(monthProg.dailySalesNeeded)}·객 ${monthProg.dailyCustomersNeeded ?? '-'}명 필요`
      : '목표 달성 궤도';
    prediction = `당월 달성 가능성 ${monthProg.achievementLikelihoodPct}% · ${daily}`;
  } else if (monthPace != null) {
    const remain = monthPace < 100
      ? `잔여 기간 일평균 ${fmtWon(Math.max(0, (100 - monthPace) * (ctx.monthNetSales / Math.max(monthPace, 1))))} 추가 필요(추정)`
      : '목표 초과 달성 궤도';
    prediction = `월간 진도 ${monthPace}% · 전월 대비 ${fmtPct(monthPct)} — ${remain}`;
  } else {
    prediction = `이번 달 매출 ${fmtWon(ctx.monthNetSales)} · 전월 ${fmtPct(monthPct)}`;
  }

  const suggestions: string[] = [];
  if (monthPace != null && monthPace < 90) {
    suggestions.push('목표 지연 — 주간 TOP 품목 프로모·단골 재방문 캠페인');
  }
  if (weekPct != null && weekPct < 0) {
    suggestions.push(`전주 대비 ${fmtPct(weekPct)} — 요일별 수익성·시간대 히트맵 위젯 참고`);
  }
  if (ctx.customerVisitorChangePct != null && ctx.customerVisitorChangePct < 0) {
    suggestions.push(`고객 방문 전월 ${fmtPct(ctx.customerVisitorChangePct)} — 재구매·이탈위험 위젯 연동`);
  }
  suggestions.push(...crossRefTopItems(ctx).slice(0, 1));

  return {
    prediction,
    suggestions: suggestions.filter(Boolean).slice(0, 3),
    basis: '주·월 POS 집계·매출 목표·전기간 대비',
  };
}

export function buildWeeklyAnalysisAnalysis(
  data: { top?: { name: string; pctChange?: number | null }[]; insight?: string },
  ctx: PerformanceContext,
): WidgetAnalysisBlock {
  const top1 = data.top?.[0];
  const rising = data.top?.filter(t => (t.pctChange ?? 0) > 15).slice(0, 2).map(t => t.name);

  const prediction = top1
    ? `주간 1위 ${top1.name}${top1.pctChange != null ? ` (전주 대비 ${fmtPct(top1.pctChange)})` : ''} — 다음 주 메인 진열 유지 예상`
    : '주간 판매 패턴 분석 중';

  const suggestions: string[] = [];
  if (data.insight) suggestions.push(data.insight.slice(0, 120));
  if (rising?.length) suggestions.push(`급상승 ${rising.join(', ')} — 재고·발주 선행`);
  suggestions.push(...crossRefTopItems(ctx, top1?.name));

  return {
    prediction,
    suggestions: [...new Set(suggestions)].slice(0, 3),
    basis: '7일 POS 품목·전주 대비·AI 주간 분석',
  };
}

export function buildYesterdayAnalysisAnalysis(
  data: { top?: { name: string }[]; bottom?: { name: string }[] },
  ctx: PerformanceContext,
): WidgetAnalysisBlock {
  const top1 = data.top?.[0]?.name ?? ctx.yesterdayTopItem;
  const bottom1 = data.bottom?.[0]?.name;

  const prediction = top1
    ? `전일 ${top1} 강세 — 오늘 AI 예측과 겹치면 이중 진열, 아니면 교차 검증`
    : '전일 실적 기반 오늘 진열 조정';

  const suggestions: string[] = [];
  if (top1 && ctx.predictionTopItems.some(p => p.includes(top1.slice(0, 2)) || top1.includes(p.slice(0, 2)))) {
    suggestions.push(`${top1} 전일·예측 동시 상위 — 재고 확보·POP 강화`);
  }
  if (bottom1) suggestions.push(`${bottom1} 전일 부진 — 진열 축소·원가율 점검`);
  suggestions.push(...crossRefTopItems(ctx, top1).slice(0, 1));

  return {
    prediction,
    suggestions: suggestions.filter(Boolean).slice(0, 3),
    basis: '전일 일마감·당일 예측 TOP',
  };
}

export function buildCustomerVisitAnalysis(
  data: { visitorChangePct?: number | null; direction?: string; thisMonthVisitRate?: number | null },
  ctx: PerformanceContext,
): WidgetAnalysisBlock {
  const ch = data.visitorChangePct ?? ctx.customerVisitorChangePct;
  const prediction = ch != null
    ? `방문고객 전월 ${fmtPct(ch)} — ${ch >= 0 ? '매출 성장 여지, 객단가·재방문율 관리' : '유입 회복 필요, 프로모·알림톡 검토'}`
    : '고객 방문 추세 분석';

  const suggestions: string[] = [];
  if (ch != null && ch < -5) {
    suggestions.push('이탈위험·재구매 임박 위젯에서 알림톡 큐 등록');
  }
  if (data.thisMonthVisitRate != null && data.thisMonthVisitRate < 30) {
    suggestions.push(`방문률 ${data.thisMonthVisitRate}% — 단골 재방문 캠페인·쿠폰 연동`);
  }
  const pace = paceHint(ctx.monthTargetPacePct);
  if (pace) suggestions.push(pace);

  return {
    prediction,
    suggestions: suggestions.slice(0, 3),
    basis: '월간 고객 방문·전월 대비·매출 목표',
  };
}

export function buildChurnRiskAnalysis(
  data: { totalAtRisk?: number; items?: { name: string; churnScore: number }[] },
  ctx: PerformanceContext,
): WidgetAnalysisBlock {
  const n = data.totalAtRisk ?? 0;
  const top = data.items?.[0];

  const prediction = n > 0
    ? `이탈위험 ${n}명 — ${top ? `${top.name}(${top.churnScore}점) 등` : ''} 2주 내 이탈 가능성`
    : '이탈위험 고객 없음 — 재구매 주기 관리 유지';

  const suggestions: string[] = [];
  if (n > 0) {
    suggestions.push('TOP 이탈위험 고객 알림톡·쿠폰 개인화');
    suggestions.push('전월 대비 방문 감소 시 세트·할인 재방문 유도');
  }
  if (ctx.monthTargetPacePct != null && ctx.monthTargetPacePct < 95) {
    suggestions.push('매출 목표 지연 — 이탈위험군 우선 CRM');
  }

  return {
    prediction,
    suggestions: suggestions.slice(0, 3),
    basis: '90일 방문·등급·전월 매출 목표',
  };
}

export function buildRepurchaseDueAnalysis(
  data: { count?: number; customers?: { name: string; overdueDays: number }[] },
  ctx: PerformanceContext,
): WidgetAnalysisBlock {
  const n = data.count ?? 0;
  const prediction = n > 0
    ? `재구매 주기 초과 ${n}명 — 평균 주기+2일 경과, 이번 주 매출 회복 기회`
    : '재구매 임박 고객 없음';

  const suggestions: string[] = [];
  if (n > 0) {
    suggestions.push('notification_queue 알림톡 일괄 등록 검토');
    suggestions.push('전일·주간 TOP 품목과 연계 세트 제안');
  }
  if (ctx.predictionTopItems[0]) {
    suggestions.push(`예측 1위 ${ctx.predictionTopItems[0]} 포함 재구매 유도 메시지`);
  }

  return {
    prediction,
    suggestions: suggestions.slice(0, 3),
    basis: '고객 구매주기·예측 TOP·월 목표',
  };
}

export function buildBreakEvenAnalysis(
  data: { progressPct?: number; achieved?: boolean; remainingAmount?: number; todayBepTarget?: number },
  ctx: PerformanceContext,
): WidgetAnalysisBlock {
  const pct = data.progressPct ?? ctx.bepProgressPct ?? 0;
  const achieved = data.achieved ?? ctx.bepAchieved;
  const remain = data.remainingAmount ?? ctx.bepRemaining;

  const prediction = achieved
    ? `오늘 BEP ${pct.toFixed(0)}% 달성 — 잔여 시간 고마진·객단가 품목으로 추가 이익`
    : `BEP ${pct.toFixed(0)}% — ${fmtWon(remain)} 추가 시 손익분기`;

  const suggestions: string[] = [];
  if (!achieved && remain > 0) {
    suggestions.push(`목표 ${fmtWon(data.todayBepTarget ?? 0)} 대비 ${fmtWon(remain)} — 피크 시간대 집중`);
    suggestions.push('마진율 TOP 품목·객단가 높은 시간대 위젯 참고');
  }
  const pace = paceHint(ctx.monthTargetPacePct);
  if (pace) suggestions.push(pace);

  return {
    prediction,
    suggestions: suggestions.slice(0, 3),
    basis: '월 고정비·변동원가·당일 POS',
  };
}

export function buildCostRatioAnalysis(
  data: { storeAvgRatio?: number | null; globalTargetRatio?: number; offenders?: { name: string }[] },
  ctx: PerformanceContext,
): WidgetAnalysisBlock {
  const avg = data.storeAvgRatio;
  const target = data.globalTargetRatio ?? 0.65;
  const offenders = data.offenders ?? [];

  const prediction = avg != null
    ? `매장 원가율 ${(avg * 100).toFixed(1)}% (목표 ${(target * 100).toFixed(0)}%) — ${avg > target ? '마진 압박 지속 예상' : '원가 관리 양호'}`
    : '원가율 집계 중';

  const suggestions: string[] = [];
  if (offenders.length) {
    suggestions.push(`초과 품목 ${offenders.slice(0, 2).map(o => o.name).join(', ')} — 단가·원가 재협상`);
  }
  if (ctx.monthTargetPacePct != null && ctx.monthTargetPacePct < 90 && avg != null && avg > target) {
    suggestions.push('매출·원가 동시 부담 — 고마진 품목 비중 확대');
  }
  suggestions.push('마진율 랭킹 위젯과 교차 점검');

  return {
    prediction,
    suggestions: suggestions.slice(0, 3),
    basis: '품목 원가·목표·월 매출 진도',
  };
}

export function buildMarginRankingAnalysis(
  data: { avgMargin?: number | null; globalTargetMargin?: number; top10?: { name: string }[] },
  ctx: PerformanceContext,
): WidgetAnalysisBlock {
  const avg = data.avgMargin;
  const target = data.globalTargetMargin ?? 0.35;
  const top1 = data.top10?.[0]?.name;

  const prediction = avg != null
    ? `평균 마진 ${(avg * 100).toFixed(1)}% — ${avg >= target ? '목표 달성, 고마진 품목 확대 여지' : '저마진 품목 비중 조정 필요'}`
    : '마진 분석';

  const suggestions: string[] = [];
  if (top1) suggestions.push(`${top1} 등 TOP 마진 — 진열·프로모 우선`);
  if (ctx.predictionTopItems[0]) {
    suggestions.push(`예측 상위 ${ctx.predictionTopItems[0]} vs 마진율 교차 확인`);
  }
  suggestions.push('원가율 모니터와 함께 손익 구조 점검');

  return {
    prediction,
    suggestions: suggestions.slice(0, 3),
    basis: '품목 마진·목표·예측 TOP',
  };
}

export function buildWeatherAnalysis(
  data: { days?: { date: string; condition: string; precipProb: number; tempMax: number }[] },
  ctx: PerformanceContext,
): WidgetAnalysisBlock {
  const today = data.days?.find((_, i) => i === 1) ?? data.days?.[0];
  const tomorrow = data.days?.[2] ?? data.days?.[1];

  let prediction = '날씨 영향 분석';
  if (today) {
    if (today.precipProb >= 50) {
      prediction = `강수 ${today.precipProb}% — 실내·배달 수요↑, BBQ·야외용 축소 진열 예상`;
    } else if (today.tempMax >= 28) {
      prediction = `고온 ${today.tempMax}° — 냉장·신선·얇은 육류 수요↑`;
    } else if (today.tempMax <= 5) {
      prediction = `한파 ${today.tempMax}° — 찌개·국거리·고지방 부위 수요↑`;
    } else {
      prediction = `${today.condition} — 평시 패턴, AI 예측 TOP과 연동 진열`;
    }
  }

  const suggestions: string[] = [];
  if (ctx.predictionTopItems.length) {
    suggestions.push(`예측 TOP ${ctx.predictionTopItems.slice(0, 2).join(', ')} + 날씨 변수 반영`);
  }
  if (tomorrow && tomorrow.precipProb >= 60) {
    suggestions.push(`내일 강수 ${tomorrow.precipProb}% — 발주·재고 선조정`);
  }
  suggestions.push('매출 예측 위젯의 날씨 변수·근거 참고');

  return {
    prediction,
    suggestions: suggestions.slice(0, 3),
    basis: '기상청·예측 모델 날씨 변수',
  };
}

export function buildNewsAnalysis(
  data: { news?: { title: string }[] },
  ctx: PerformanceContext,
): WidgetAnalysisBlock {
  const headlines = (data.news ?? []).slice(0, 2).map(n => n.title.slice(0, 40));
  const prediction = headlines.length
    ? `업계 이슈 ${headlines.length}건 — 수급·가격·수요 변동 모니터`
    : '정육 업계 뉴스 없음';

  const suggestions: string[] = [];
  if (headlines.length) suggestions.push(`"${headlines[0]}…" — AI 브리핑·예측 위젯과 교차 확인`);
  if (ctx.predictionTopItems[0]) {
    suggestions.push(`예측 1위 ${ctx.predictionTopItems[0]} — 뉴스·트렌드와 연계 홍보`);
  }
  suggestions.push('가축질병·축산가 변동 시 AI 브리핑 actions 확인');

  return {
    prediction,
    suggestions: suggestions.slice(0, 3),
    basis: 'RSS·네이버 트렌드·예측',
  };
}

export function buildHeatmapAnalysis(
  data: { insights?: { text?: string }[] },
  ctx: PerformanceContext,
): WidgetAnalysisBlock {
  const insight = data.insights?.[0]?.text;
  const prediction = insight
    ? insight.slice(0, 100)
    : '시간×요일 매출 패턴 — 피크 구간 집중 운영 권장';

  const suggestions: string[] = [];
  if (data.insights?.[1]?.text) suggestions.push(data.insights[1].text.slice(0, 80));
  suggestions.push('객단가·요일 수익성 위젯과 스태프 배치 연동');
  if (ctx.monthTargetPacePct != null && ctx.monthTargetPacePct < 90) {
    suggestions.push('목표 지연 — 피크 시간대 프로모·진열 강화');
  }

  return {
    prediction,
    suggestions: suggestions.slice(0, 3),
    basis: '1개월 POS 시간대·요일',
  };
}

export function buildDowProfitabilityAnalysis(
  data: { insights?: { text?: string }[]; rows?: { dowLabel: string; rank: number }[] },
  ctx: PerformanceContext,
): WidgetAnalysisBlock {
  const best = data.rows?.find(r => r.rank === 1);
  const prediction = data.insights?.[0]?.text?.slice(0, 100)
    ?? (best ? `${best.dowLabel} 최고 수익 — 해당 요일 메뉴·발주 집중` : '요일별 수익성 분석');

  const suggestions: string[] = [];
  if (best) suggestions.push(`${best.dowLabel} 패턴 — AI 운영 파트너·발주 탭 참고`);
  suggestions.push(...crossRefTopItems(ctx).slice(0, 1));

  return {
    prediction,
    suggestions: suggestions.filter(Boolean).slice(0, 3),
    basis: '요일별 매출·마진·전기간',
  };
}

export function buildTimeSlotAovAnalysis(
  data: { slots?: { label: string; avgTicket: number | null }[]; insight?: string | null },
  ctx: PerformanceContext,
): WidgetAnalysisBlock {
  const sorted = [...(data.slots ?? [])].sort((a, b) => (b.avgTicket ?? 0) - (a.avgTicket ?? 0));
  const peak = sorted[0];

  const prediction = peak?.avgTicket
    ? `${peak.label} 객단가 최고(${peak.avgTicket.toLocaleString()}원) — 해당 시간대 고마진·세트 추천`
    : data.insight ?? '시간대별 객단가 분석';

  const suggestions: string[] = [];
  if (data.insight) suggestions.push(data.insight);
  suggestions.push('히트맵 피크와 겹치는 시간대 스태프·진열 배치');
  if (ctx.bepProgressPct != null && !ctx.bepAchieved) {
    suggestions.push('BEP 미달 — 고객단가 높은 시간대 프로모');
  }

  return {
    prediction,
    suggestions: suggestions.slice(0, 3),
    basis: '당일 POS 시간대·BEP',
  };
}

export function buildSalesCategoryAnalysis(
  data: { chart?: { label: string; pct: number }[]; totalAmount?: number },
  ctx: PerformanceContext,
): WidgetAnalysisBlock {
  const top = data.chart?.[0];
  const prediction = top
    ? `당일 ${top.label} ${top.pct}% — 카테고리 편중, 재고·진열 비중 조정 검토`
    : `당일 매출 ${fmtWon(data.totalAmount ?? 0)}`;

  const suggestions: string[] = [];
  if (top && top.pct > 50) suggestions.push(`${top.label} 과편중 — 다른 카테고리 교차 진열`);
  suggestions.push(...crossRefTopItems(ctx).slice(0, 2));

  return {
    prediction,
    suggestions: suggestions.slice(0, 3),
    basis: '당일 POS 카테고리·예측 TOP',
  };
}

export function buildSalesPredictionAnalysis(
  data: {
    modelAccuracy?: number;
    keyFactors?: string[];
    accuracyLabel?: string;
    topItems?: { item: string }[];
  },
  ctx: PerformanceContext,
): WidgetAnalysisBlock {
  const acc = data.modelAccuracy ?? ctx.predictionAccuracyPct;
  const prediction = ctx.predictionInsightSummary
    ?? (acc != null
      ? `${data.accuracyLabel || '예측 적중률'} ${Math.round(acc)}% — TOP 품목 진열·실매출 대조`
      : '품목별 예측·실적 대조 운영');

  const suggestions: string[] = [];
  if (data.keyFactors?.length) {
    suggestions.push(`반영 변수: ${data.keyFactors.slice(0, 3).join(', ')}`);
  }
  const pace = paceHint(ctx.monthTargetPacePct);
  if (pace) suggestions.push(pace);
  if (ctx.bepProgressPct != null && !ctx.bepAchieved) {
    suggestions.push(`BEP ${ctx.bepProgressPct.toFixed(0)}% — 예측 TOP 중 고마진 우선`);
  }

  return {
    prediction,
    suggestions: suggestions.slice(0, 3),
    basis: '90일·날씨·휴일·백테스트·목표 진도',
  };
}

export function buildAiInsightAnalysis(
  data: {
    actions?: { text: string; basis?: string }[] | string[];
    highlights?: { tag: string; text: string }[];
    livestockDisease?: unknown[];
  },
  ctx: PerformanceContext,
): WidgetAnalysisBlock {
  const action = Array.isArray(data.actions)
    ? (typeof data.actions[0] === 'string' ? data.actions[0] : (data.actions[0] as { text: string })?.text)
    : undefined;

  const prediction = action
    ? action.slice(0, 100)
    : (ctx.salesChangePct != null
      ? `오늘 매출 ${fmtPct(ctx.salesChangePct)} — 브리핑 actions 실행 우선`
      : 'AI 브리핑 기반 오늘 운영');

  const suggestions: string[] = [];
  if (data.highlights?.length) {
    suggestions.push(data.highlights.slice(0, 2).map(h => `[${h.tag}] ${h.text.slice(0, 40)}`).join(' · '));
  }
  if (data.livestockDisease?.length) {
    suggestions.push(`가축질병 ${data.livestockDisease.length}건 — 안심·국내산 강조 진열`);
  }
  const pace = paceHint(ctx.monthTargetPacePct);
  if (pace) suggestions.push(pace);
  if (ctx.predictionTopItems[0]) {
    suggestions.push(`예측 TOP ${ctx.predictionTopItems.slice(0, 2).join(', ')}와 브리핑 교차 실행`);
  }

  return {
    prediction,
    suggestions: suggestions.filter(Boolean).slice(0, 3),
    basis: '유동·상권·매출·트렌드·예측·목표',
  };
}

export function buildTotalPartnerAnalysis(
  data: {
    today?: { opinion?: string; keyAlert?: string };
    orderAdvice?: { isOrderDay?: boolean; dDay?: string | null };
  },
  ctx: PerformanceContext,
): WidgetAnalysisBlock {
  const alert = data.today?.keyAlert;
  const prediction = alert?.slice(0, 100)
    ?? data.today?.opinion?.slice(0, 100)
    ?? '다기간 운영·발주 AI 분석';

  const suggestions: string[] = [];
  if (data.orderAdvice?.isOrderDay) {
    suggestions.push(`발주 ${data.orderAdvice.dDay ?? '당일'} — 예측 TOP·주간 실적 반영 발주`);
  }
  const pace = paceHint(ctx.monthTargetPacePct);
  if (pace) suggestions.push(pace);
  suggestions.push(...crossRefTopItems(ctx).slice(0, 1));

  return {
    prediction,
    suggestions: suggestions.filter(Boolean).slice(0, 3),
    basis: 'POS·날씨·발주·목표·예측',
  };
}

export function buildWidgetAnalysis(
  widgetId: WidgetAnalysisId,
  widgetData: unknown,
  ctx: PerformanceContext,
): WidgetAnalysisBlock | null {
  if (!widgetData) return null;
  const d = widgetData as Record<string, unknown>;

  switch (widgetId) {
    case 'today_sales':
      return buildTodaySalesAnalysis(d as Parameters<typeof buildTodaySalesAnalysis>[0], ctx);
    case 'sales_compare':
      return buildSalesCompareAnalysis(d, ctx);
    case 'weekly_analysis':
      return buildWeeklyAnalysisAnalysis(d, ctx);
    case 'yesterday_analysis':
      return buildYesterdayAnalysisAnalysis(d, ctx);
    case 'customer_visit':
      return buildCustomerVisitAnalysis(d, ctx);
    case 'churn_risk':
      return buildChurnRiskAnalysis(d, ctx);
    case 'repurchase_due':
      return buildRepurchaseDueAnalysis(d, ctx);
    case 'break_even':
      return buildBreakEvenAnalysis(d, ctx);
    case 'cost_ratio':
      return buildCostRatioAnalysis(d, ctx);
    case 'margin_ranking':
      return buildMarginRankingAnalysis(d, ctx);
    case 'weather':
      return buildWeatherAnalysis(d, ctx);
    case 'news':
      return buildNewsAnalysis(d, ctx);
    case 'sales_heatmap':
      return buildHeatmapAnalysis(d, ctx);
    case 'dow_profitability':
      return buildDowProfitabilityAnalysis(d, ctx);
    case 'time_slot_aov':
      return buildTimeSlotAovAnalysis(d, ctx);
    case 'sales_category':
      return buildSalesCategoryAnalysis(d, ctx);
    case 'sales_prediction':
      return buildSalesPredictionAnalysis(d, ctx);
    case 'ai_insight':
      return buildAiInsightAnalysis(d, ctx);
    case 'total_partner':
      return buildTotalPartnerAnalysis(d, ctx);
    default:
      return null;
  }
}
