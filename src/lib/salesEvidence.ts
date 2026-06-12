import type { FootTrafficWithComparisons } from '@/lib/areaContext';
import type { CommercialAreaContext } from '@/lib/areaContext';
import { formatStaffingLine, getCurrentStaffingContext } from '@/lib/storeBusinessContext';
import { enrichBriefingAction, parseBriefingActionFields, type BriefingAction } from '@/lib/briefingActions';

export type { BriefingAction } from '@/lib/briefingActions';

export const EVIDENCE_SUMMARY_MAX = 100;

export interface SalesEvidenceLine {
  id: string;
  label: string;
  summary: string;
  detail?: string;
  salesLink?: string;
}

export function truncateEvidenceSummary(text: string, max = EVIDENCE_SUMMARY_MAX): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function fmtPct(v: number | null | undefined): string {
  if (v == null) return '-';
  return `${v > 0 ? '+' : ''}${v}%`;
}

function fmtWon(n: number): string {
  if (n <= 0) return '0원';
  if (n >= 10000) return `${Math.round(n / 10000)}만원`;
  return `${n.toLocaleString()}원`;
}

export function buildBriefingEvidenceLines(params: {
  today: string;
  regionLabel: string;
  footTraffic: FootTrafficWithComparisons;
  commercial: CommercialAreaContext;
  sales: { today: number; yesterday: number; change: number | null };
  trends: { groupName: string; current: number; change: number }[];
  trendKeywords?: string[];
  newsCount: number;
  livestockCount: number;
  regionKeyword: string;
  isClosed?: boolean;
}): { lines: SalesEvidenceLine[]; salesBasis: string } {
  const {
    today,
    regionLabel,
    footTraffic,
    commercial,
    sales,
    trends,
    trendKeywords,
    newsCount,
    livestockCount,
    regionKeyword,
    isClosed,
  } = params;

  const cmp = footTraffic.comparisons;
  const footSummary = truncateEvidenceSummary(
    `${regionLabel} ${footTraffic.dayOfWeek} ${footTraffic.summary.match(/\d+시/)?.[0] || '현재'} 유동지수 ${footTraffic.index}(${footTraffic.level})·전일/전주/전월 동시간 ${fmtPct(cmp?.vsYesterday.changePct)}/${fmtPct(cmp?.vsLastWeek.changePct)}/${fmtPct(cmp?.vsLastMonth.changePct)}·요일·시간 추정`,
  );

  const commercialSummary = truncateEvidenceSummary(
    `${commercial.source === 'api'
      ? (commercial.apiQuery === 'trdarCdN' ? '상권코드 API' : '소상공인 상가 API')
      : '지역 추정'}·${commercial.region} 경쟁 ${commercial.competitiveLevel}·${commercial.businessSummary.slice(0, 30)}…→ 차별 진열·가격`,
  );

  const staffing = getCurrentStaffingContext();
  const salesStatus = isClosed ? '마감' : `영업중·${staffing.modeLabel}·365일 24h`;
  const salesSummary = truncateEvidenceSummary(
    `POS 순매출 ${today} ${fmtWon(sales.today)} vs 어제 ${fmtWon(sales.yesterday)}(${fmtPct(sales.change)})·${salesStatus}`,
  );

  const topTrend = trends[0];
  const kwHint = trendKeywords?.length ? trendKeywords.slice(0, 3).join(',') : '설정키워드';
  const trendSummary = topTrend
    ? truncateEvidenceSummary(
        `네이버 DataLab·${kwHint}·${topTrend.groupName} 지수${topTrend.current}(4주vs직전4주 ${fmtPct(topTrend.change)})·검색↑→홍보·진열`,
      )
    : truncateEvidenceSummary('네이버 DataLab·매장 키워드 미설정·검색 트렌드 없음→키워드 등록 후 홍보 연동');

  const diseaseSummary = livestockCount > 0
    ? truncateEvidenceSummary(
        `MAFRA 가축질병 180일·${regionKeyword} ${livestockCount}건·원료가·수급 리스크→ 안심·국내산 강조 진열`,
      )
    : truncateEvidenceSummary(`MAFRA 가축질병 180일·${regionKeyword} 발생 없음·수급 안정→ 프로모션 여지`);

  const lines: SalesEvidenceLine[] = [
    {
      id: 'footTraffic',
      label: '유동',
      summary: footSummary,
      detail: `${footTraffic.summary} 비교는 같은 요일·같은 시각대 추정치끼리입니다(실측 유동 아님). ${formatStaffingLine()}. 유인(11–21)은 대면 진열·시식, 무인(21–11)은 POP·키오스크 노출을 검토하세요.`,
      salesLink: '피크 전후 전면 진열·시식·세트 구성으로 유입→구매 전환',
    },
    {
      id: 'commercial',
      label: '상권',
      summary: commercialSummary,
      detail: `${commercial.businessSummary} (출처: ${commercial.source === 'api' ? '공공 상가 API' : '지역 추정'})`,
      salesLink: '경쟁 밀집 시 차별 품목·가격표·포장 강조',
    },
    {
      id: 'sales',
      label: '오늘 매출',
      summary: salesSummary,
      detail: `당일 POS 순매출을 어제 같은 기준(일마감/실시간)과 비교합니다. 매장은 365일·24h 영업(11–21 유인/21–11 무인). ${isClosed ? '마감 후 확정치' : '영업 중이면 유인·무인 시간대별로 다시 확인하세요.'}`,
      salesLink: sales.change != null && sales.change < 0
        ? '어제 대비 부진 시 인기 품목 할인·단골 알림'
        : '호조 시 재고·베스트셀러 추가 진열',
    },
    {
      id: 'trends',
      label: '검색 트렌드',
      summary: trendSummary,
      detail: trends.length
        ? trends.map(t => `${t.groupName}: ${t.current} (${fmtPct(t.change)})`).join(' · ')
        : '대시보드에서 네이버 검색 키워드를 등록하면 트렌드·홍보 문구에 반영됩니다.',
      salesLink: '검색↑ 키워드 POP·SNS·전단에 반영',
    },
    {
      id: 'livestock',
      label: '가축질병',
      summary: diseaseSummary,
      detail: livestockCount > 0
        ? `최근 180일 ${regionKeyword} 인근 발생 ${livestockCount}건(MAFRA). 고객 불안 시 국내산·검역 정보 POP 권장.`
        : `최근 180일 ${regionKeyword} 기준 MAFRA 발생 없음.`,
      salesLink: '수급 이슈 시 대체 부위·프로모션으로 객단가 방어',
    },
  ];

  if (newsCount > 0) {
    lines.push({
      id: 'news',
      label: '뉴스',
      summary: truncateEvidenceSummary(`네이버 뉴스 ${newsCount}건·축산·식품 키워드·고객 관심 이슈→ POP·대화 소재`),
      detail: '매장 지역·품목 관련 헤드라인을 수집합니다. 가격·안전 이슈는 진열·설명 보강에 활용.',
      salesLink: '이슈 키워드를 카운터 설명·SNS에 연결',
    });
  }

  const salesBasis = truncateEvidenceSummary(
    `매출 향상 기준: POS 당일 vs 어제·유동·상권·네이버4주·뉴스 ${newsCount}건·${today} KST`,
  );

  return { lines, salesBasis };
}

export function normalizeBriefingActions(raw: unknown): BriefingAction[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((a): BriefingAction | null => {
      if (typeof a === 'string') {
        const text = a.trim();
        return text ? enrichBriefingAction({ text }) : null;
      }
      if (a && typeof a === 'object') {
        const o = a as { text?: string; basis?: string };
        const text = String(o.text ?? '').trim();
        if (!text) return null;
        const basis = String(o.basis ?? '').trim();
        const extra = parseBriefingActionFields(o as Record<string, unknown>);
        return enrichBriefingAction({
          text,
          ...(basis ? { basis } : {}),
          ...extra,
        });
      }
      return null;
    })
    .filter((x) => x !== null)
    .slice(0, 5);
}
