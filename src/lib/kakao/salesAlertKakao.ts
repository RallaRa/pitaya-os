import {
  formatAlertChangePct,
  SALES_ALERT_START_HOUR,
  type SalesDropBenchmark,
  type SalesRiseBenchmark,
} from '@/lib/salesHourlyAlert';

export interface KakaoListItem {
  title: string;
  description: string;
}

export function buildSalesHourlyKakaoListItems(opts: {
  direction: 'down' | 'up';
  hour: number;
  todayTotal: number;
  benchmarks: SalesDropBenchmark[] | SalesRiseBenchmark[];
  focusItems: string[];
}): KakaoListItem[] {
  const { direction, hour, todayTotal, benchmarks, focusItems } = opts;
  const items: KakaoListItem[] = [];

  items.push({
    title: `${SALES_ALERT_START_HOUR}~${hour}시 순매출`,
    description: `${todayTotal.toLocaleString()}원`,
  });

  for (const b of benchmarks.slice(0, 2)) {
    const pct = 'dropPct' in b ? b.dropPct : (b as SalesRiseBenchmark).risePct;
    items.push({
      title: b.label,
      description: `${formatAlertChangePct(pct, direction)} (기준 ${b.amount.toLocaleString()}원)`,
    });
  }

  if (focusItems.length && items.length < 3) {
    items.push({
      title: direction === 'down' ? '주력 품목 점검' : '잘 팔린 품목',
      description: focusItems.slice(0, 3).join(' · '),
    });
  }

  while (items.length < 2) {
    items.push({
      title: '상세',
      description: '매출 보고서에서 비교·품목을 확인하세요',
    });
  }

  return items.slice(0, 3);
}

/** 앱 알림 허브용 짧은 본문 (기존 message 형식 유지) */
export function buildSalesHourlyHubMessage(opts: {
  direction: 'down' | 'up';
  hour: number;
  todayTotal: number;
  benchmarks: SalesDropBenchmark[] | SalesRiseBenchmark[];
  focusItems: string[];
}): string {
  const { direction, hour, todayTotal, benchmarks, focusItems } = opts;
  const lines = benchmarks
    .slice(0, 3)
    .map(b => {
      const pct = (b as SalesDropBenchmark).dropPct ?? (b as SalesRiseBenchmark).risePct;
      return `${b.label} ${formatAlertChangePct(pct, direction)}`;
    })
    .join(', ');

  const itemLines = focusItems.length
    ? focusItems.slice(0, 3).map((name, i) => `${i + 1}. ${name}`).join('\n')
    : direction === 'down'
      ? '전일 인기 품목 위주로 진열·프로모션 점검'
      : '당일 인기 품목 재고·진열 유지';

  return [
    `${SALES_ALERT_START_HOUR}~${hour}시 순매출 ${todayTotal.toLocaleString()}원`,
    direction === 'down' ? `기준 대비 하락: ${lines}` : `기준 대비 상승: ${lines}`,
    '',
    direction === 'down' ? '주력 추천 품목:' : '잘 팔린 품목:',
    itemLines,
  ].join('\n');
}
