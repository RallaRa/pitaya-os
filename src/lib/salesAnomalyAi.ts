import { adminDb } from '@/lib/firebase/admin';
import { HOLIDAYS } from '@/components/calendar/CalendarTypes';
import { generateTextWithFallback, hasAnyAiProvider } from '@/lib/aiProviderFallback';
import type { AnomalyResult, AnomalyType } from '@/lib/salesAnomalyDetect';

const DOW_KO = ['일', '월', '화', '수', '목', '금', '토'];

async function loadDayContext(storeId: string, date: string) {
  const reportSnap = await adminDb.collection('daily_reports')
    .where('storeId', '==', storeId)
    .where('reportDate', '==', date)
    .limit(1)
    .get();

  const report = reportSnap.docs[0]?.data();
  const customerCount = Number(report?.customerCount ?? report?.totalCustomers ?? 0);
  const topItems = Array.isArray(report?.items)
    ? report.items.slice(0, 5).map((it: { name?: string; netSales?: number }) =>
        `${it.name || '품목'} ${Number(it.netSales || 0).toLocaleString()}원`,
      ).join(', ')
    : '';

  const d = new Date(`${date}T12:00:00+09:00`);
  const dow = DOW_KO[d.getDay()];
  const holiday = HOLIDAYS[date] || null;

  return { customerCount, topItems, dow, holiday };
}

export function formatAnomalyMessengerText(params: {
  date: string;
  type: AnomalyType;
  todaySales: number;
  mean: number;
  deviation: number;
  aiAnalysis?: string;
  aiActions?: string[];
}): string {
  const icon = params.type === 'spike' ? '🟢 급증' : '🔴 급감';
  const sign = params.deviation >= 0 ? '+' : '';
  const lines = [
    `📊 매출 이상 탐지 (${params.date})`,
    `${icon} — ${params.todaySales.toLocaleString()}원`,
    `평균 ${Math.round(params.mean).toLocaleString()}원 대비 ${sign}${params.deviation.toFixed(1)}σ`,
  ];
  if (params.aiAnalysis) {
    lines.push('', '🤖 AI 원인 추정', params.aiAnalysis);
  }
  if (params.aiActions?.length) {
    lines.push('', '💡 추천 조치', ...params.aiActions.map(a => `· ${a}`));
  }
  return lines.join('\n');
}

export async function analyzeSalesAnomalyWithAi(
  storeId: string,
  result: AnomalyResult & { type: AnomalyType },
): Promise<{ aiSummary: string; aiAnalysis: string; aiActions: string[]; provider?: string }> {
  const ctx = await loadDayContext(storeId, result.date);
  const fallbackSummary = result.type === 'spike'
    ? `매출 급증: ${result.todaySales.toLocaleString()}원 (평균 ${Math.round(result.mean).toLocaleString()}원 대비 +${result.deviation.toFixed(1)}σ)`
    : `매출 급감: ${result.todaySales.toLocaleString()}원 (평균 ${Math.round(result.mean).toLocaleString()}원 대비 ${result.deviation.toFixed(1)}σ)`;

  if (!hasAnyAiProvider()) {
    return {
      aiSummary: fallbackSummary,
      aiAnalysis: 'AI 연동 미설정 — 통계 이상치만 감지되었습니다.',
      aiActions: [],
    };
  }

  const prompt = [
    '정육점 POS 매출 이상치 원인을 한국어로 간결히 분석하세요.',
    `유형: ${result.type === 'spike' ? '급증' : '급감'}`,
    `날짜: ${result.date} (${ctx.dow}요일${ctx.holiday ? `, ${ctx.holiday}` : ''})`,
    `당일 매출: ${result.todaySales.toLocaleString()}원`,
    `최근 30일 평균: ${Math.round(result.mean).toLocaleString()}원`,
    `편차: ${result.deviation.toFixed(1)}σ`,
    `객수: ${ctx.customerCount || '미상'}`,
    ctx.topItems ? `TOP 품목: ${ctx.topItems}` : '',
    '',
    'JSON만 출력: {"analysis":"2~3문장 원인 추정","actions":["조치1","조치2"]}',
  ].filter(Boolean).join('\n');

  try {
    const ai = await generateTextWithFallback({
      prompt,
      json: true,
      useCase: 'insight',
      temperature: 0.4,
    });
    let parsed: { analysis?: string; actions?: string[] } = {};
    try {
      parsed = JSON.parse(ai.text.replace(/```json\s*|```/g, '').trim());
    } catch {
      parsed = { analysis: ai.text.slice(0, 300) };
    }
    const aiAnalysis = String(parsed.analysis || '').trim() || fallbackSummary;
    const aiActions = Array.isArray(parsed.actions)
      ? parsed.actions.map(String).filter(Boolean).slice(0, 3)
      : [];

    return {
      aiSummary: fallbackSummary,
      aiAnalysis,
      aiActions,
      provider: ai.provider,
    };
  } catch {
    return {
      aiSummary: fallbackSummary,
      aiAnalysis: 'AI 분석 실패 — 통계 이상치만 기록됩니다.',
      aiActions: [],
    };
  }
}
