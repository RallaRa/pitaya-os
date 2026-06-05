'use client';

import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, RefreshCw, TrendingUp, TrendingDown, ChevronDown, ChevronUp, Truck } from 'lucide-react';
import WidgetWrapper from './WidgetWrapper';
import WidgetEmptyReason from './WidgetEmptyReason';
import { AiUsedBadge, type AiMetaDisplay } from '@/components/AiUsedBadge';
import { getAuthHeaders } from '@/lib/getAuthHeaders';

interface PartnerItem {
  rank: number; item: string; action: string;
  expectedSales: string; reason: string; badge: string;
}

interface PeriodData {
  period: string; opinion: string;
  topItems: PartnerItem[]; bottomItems: PartnerItem[];
  keyAlert: string; confidence: number;
  weekHighlight?: string;
  monthProgress?: string; salesForecast?: string;
}

interface OrderAdvice {
  isOrderDay: boolean; dDay: string | null; comment: string;
  items: { item: string; orderRecommend: string; changeVsNormal: string }[];
}

interface DataStatus {
  status: string; days?: number; count?: number;
}

interface PartnerData {
  generatedAt: string; cached: boolean; noData?: boolean; emptyReason?: string;
  today: PeriodData | null; tomorrow: PeriodData | null;
  thisWeek: PeriodData | null; thisMonth: PeriodData | null;
  orderAdvice: OrderAdvice | null;
  dataSourceStatus: Record<string, DataStatus>;
  error?: string;
  aiError?: boolean;
  ai?: AiMetaDisplay;
}

const BADGE_STYLE: Record<string, string> = {
  HOT:  'bg-red-500/20    text-red-300    border-red-500/30',
  UP:   'bg-green-500/20  text-green-300  border-green-500/30',
  주의:  'bg-amber-500/20  text-amber-300  border-amber-500/30',
  추천:  'bg-blue-500/20   text-blue-300   border-blue-500/30',
};

const BADGE_EMOJI: Record<string, string> = { HOT:'🔥', UP:'⬆️', 주의:'⚠️', 추천:'💡' };

function boldify(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**')
      ? <strong key={i} className="font-bold text-white">{p.slice(2,-2)}</strong>
      : <span key={i}>{p}</span>
  );
}

function ItemCard({ item, isTop }: { item: PartnerItem; isTop: boolean }) {
  const badge = item.badge || '';
  const badgeCls = BADGE_STYLE[badge] || 'bg-slate-700/40 text-slate-400 border-slate-600/30';
  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-slate-800/40 last:border-0">
      <span className={`text-[11px] font-bold w-5 shrink-0 mt-0.5 ${isTop ? 'text-teal-500' : 'text-red-500/70'}`}>{item.rank}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-xs text-slate-200 font-medium">{item.item}</span>
          {badge && (
            <span className={`text-[9px] px-1 py-0.5 rounded border ${badgeCls}`}>
              {BADGE_EMOJI[badge]}{badge}
            </span>
          )}
        </div>
        <p className="text-[10px] text-teal-400 mt-0.5">{item.expectedSales} · {item.action}</p>
        <p className="text-[10px] text-slate-500 truncate">{item.reason}</p>
      </div>
    </div>
  );
}

function PeriodTab({ data, isWeek, isMonth }: { data: PeriodData; isWeek?: boolean; isMonth?: boolean }) {
  if (!data) return null;
  const monthMatch  = isMonth && data.monthProgress ? /(\d+)[^/]+\/\s*(\d+)/.exec(data.monthProgress) : null;
  const passedDays  = monthMatch ? parseInt(monthMatch[1]) : 0;
  const totalDays   = monthMatch ? passedDays + parseInt(monthMatch[2]) : 0;
  const progress    = totalDays > 0 ? Math.round((passedDays / totalDays) * 100) : 0;

  return (
    <div className="space-y-3">
      {/* 키 알림 */}
      {data.keyAlert && (
        <div className="bg-amber-900/30 border border-amber-700/40 rounded-lg px-3 py-2 text-xs text-amber-200 font-medium">
          ⚡ {data.keyAlert}
        </div>
      )}

      {/* 주간 특이사항 */}
      {isWeek && data.weekHighlight && (
        <div className="bg-purple-900/30 border border-purple-700/40 rounded-lg px-3 py-2 text-xs text-purple-200">
          📅 {data.weekHighlight}
        </div>
      )}

      {/* 월간 진행률 + 예상매출 */}
      {isMonth && (
        <div className="space-y-2">
          {data.monthProgress && (
            <div>
              <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                <span>{data.monthProgress}</span>
                <span>{progress}%</span>
              </div>
              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-teal-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
          {data.salesForecast && (
            <div className="bg-teal-900/30 border border-teal-700/40 rounded-lg px-3 py-2 text-xs text-teal-200">
              📊 이번달 예상 총매출: <span className="font-bold">{data.salesForecast}</span>
            </div>
          )}
        </div>
      )}

      {/* AI 운영의견 */}
      <div className="bg-slate-800/50 rounded-xl p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">기간별 실행</span>
          <span className="text-[10px] text-slate-500">신뢰도 {data.confidence}%</span>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">{boldify(data.opinion)}</p>
      </div>

      {/* 품목 예측 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <div className="flex items-center gap-1 mb-2">
            <TrendingUp className="w-3 h-3 text-teal-400" />
            <span className="text-[10px] font-semibold text-teal-400 uppercase">주력 TOP5</span>
          </div>
          <div className="space-y-0">
            {(data.topItems||[]).slice(0,5).map((item, i) => (
              <ItemCard key={i} item={item} isTop />
            ))}
            {(data.topItems||[]).length === 0 && (
              <p className="text-[10px] text-slate-600">데이터 없음</p>
            )}
          </div>
        </div>
        <div>
          <div className="flex items-center gap-1 mb-2">
            <TrendingDown className="w-3 h-3 text-red-400" />
            <span className="text-[10px] font-semibold text-red-400 uppercase">감소 TOP5</span>
          </div>
          <div className="space-y-0">
            {(data.bottomItems||[]).slice(0,5).map((item, i) => (
              <ItemCard key={i} item={item} isTop={false} />
            ))}
            {(data.bottomItems||[]).length === 0 && (
              <p className="text-[10px] text-slate-600">데이터 없음</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function partnerHasContent(data: PartnerData | null | undefined): boolean {
  if (!data) return false;
  const periods = [data.today, data.tomorrow, data.thisWeek, data.thisMonth];
  return periods.some(
    p => !!(p?.opinion?.trim() || p?.topItems?.length || p?.bottomItems?.length || p?.keyAlert?.trim()),
  );
}

interface Props {
  editMode: boolean;
  onRemove: () => void;
  storeId: string;
  mobileLayout?: boolean;
}

export default function TotalPartnerWidget({ editMode, onRemove, storeId, mobileLayout = false }: Props) {
  const [data,     setData]     = useState<PartnerData | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [tab,      setTab]      = useState<'today'|'tomorrow'|'thisWeek'|'thisMonth'>('today');
  const [showSrc,  setShowSrc]  = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async (force = false) => {
    setLoading(true); setError(null);
    const q = storeId ? `?storeId=${storeId}` : '';
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/dashboard/total-partner${q}${force ? (q ? '&' : '?') + 'refresh=1' : ''}`, { headers });
      const d = await res.json();
      setData(d);
      setUpdatedAt(new Date());
      if (d.error) setError(d.error);
    } catch {
      setError('데이터 로드 실패');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  const order = data?.orderAdvice;
  const orderBg = order?.dDay === '당일' ? 'bg-red-900/40 border-red-700/50 animate-pulse'
                : order?.dDay === 'D-1'  ? 'bg-orange-900/40 border-orange-700/50'
                : order?.dDay === 'D-2'  ? 'bg-amber-900/40 border-amber-700/50'
                : '';

  const srcStatus = data?.dataSourceStatus || {};
  const richness = Object.values(srcStatus).filter(s => s.status === 'ok').length;
  const richnessLabel = richness >= 4 ? '상' : richness >= 2 ? '중' : '하';
  const richnessCls   = richness >= 4 ? 'text-green-400' : richness >= 2 ? 'text-amber-400' : 'text-red-400';

  const TABS = [
    { key: 'today'     as const, label: '오늘'    },
    { key: 'tomorrow'  as const, label: '내일'    },
    { key: 'thisWeek'  as const, label: '이번주'  },
    { key: 'thisMonth' as const, label: '이번달'  },
  ];

  const currentData = data?.[tab] ?? null;

  return (
    <WidgetWrapper
      title="AI 운영 파트너"
      editMode={editMode}
      onRemove={onRemove}
      onRefresh={() => load(true)}
      updatedAt={updatedAt}
      loading={loading}
      error={error}
      autoHeight={mobileLayout}
    >
      <div className={`flex flex-col ${mobileLayout ? 'min-h-[24rem]' : 'h-full overflow-hidden'}`}>
        {/* 경고 배너 (고정) */}
        <div className="shrink-0 bg-amber-950/60 border-b border-amber-800/40 px-3 py-1.5 flex items-center gap-2">
          <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
          <p className="text-[10px] text-amber-300">AI 분석은 보조 참고 수단입니다. 실제 운영은 경험과 판단을 우선하세요.</p>
        </div>

        {/* 발주 알림 배너 (조건부) */}
        {order?.dDay && order.dDay !== 'null' && (
          <div className={`shrink-0 border-b px-3 py-1.5 flex items-center gap-2 ${orderBg}`}>
            <Truck className="w-3 h-3 text-current shrink-0" />
            <p className={`text-[10px] font-semibold ${order.dDay === '당일' ? 'text-red-300' : order.dDay === 'D-1' ? 'text-orange-300' : 'text-amber-300'}`}>
              📦 발주 {order.dDay} — {order.comment?.slice(0,50)}
            </p>
          </div>
        )}

        {/* noData 상태 */}
        {data?.noData && !partnerHasContent(data) ? (
          <div className="p-3">
            <WidgetEmptyReason
              reason={data.emptyReason || 'POS·일마감 매출 이력이 없어 AI 운영 분석을 생성할 수 없습니다.'}
              hints={['POS 브릿지 동기화', '일마감 입력', 'AI API 키 설정']}
            />
          </div>
        ) : (
          <>
            {/* 기간 탭 */}
            <div className="shrink-0 flex border-b border-slate-800">
              {TABS.map(t => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`flex-1 py-2 text-[11px] font-medium transition-colors ${
                    tab === t.key
                      ? 'text-teal-300 border-b-2 border-teal-400 bg-teal-900/20'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* 탭 콘텐츠 */}
            <div className={`p-3 ${mobileLayout ? '' : 'flex-1 overflow-y-auto min-h-0'}`}>
              {(data?.aiError || data?.error) && (
                <div className="mb-3 bg-amber-900/30 border border-amber-700/40 rounded-xl px-3 py-2 text-xs text-amber-200">
                  {data.error || 'AI 분석에 실패했습니다. 새로고침을 눌러 다시 시도해 주세요.'}
                </div>
              )}
              {currentData ? (
                <PeriodTab
                  data={currentData}
                  isWeek={tab === 'thisWeek'}
                  isMonth={tab === 'thisMonth'}
                />
              ) : (
                <div className="flex items-center justify-center h-32 text-slate-600 text-xs">
                  분석 데이터 없음
                </div>
              )}

              {/* 발주 의견 카드 (D-2 이내) */}
              {order && order.dDay && order.dDay !== 'null' && tab === 'today' && order.items?.length > 0 && (
                <div className="mt-3 bg-blue-900/20 border border-blue-700/40 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Truck className="w-3.5 h-3.5 text-blue-400" />
                    <span className="text-xs font-semibold text-blue-300">📦 발주 의견</span>
                    <span className="text-[10px] text-blue-400/70 ml-auto">{order.dDay}</span>
                  </div>
                  <p className="text-[10px] text-blue-200 mb-2">{order.comment}</p>
                  <div className="space-y-1">
                    {order.items.slice(0,5).map((i, idx) => (
                      <div key={idx} className="flex items-center justify-between text-[10px]">
                        <span className="text-slate-300">{i.item}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-blue-300">{i.orderRecommend}</span>
                          <span className={`${i.changeVsNormal?.startsWith('+') ? 'text-green-400' : 'text-red-400'}`}>{i.changeVsNormal}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* 하단 정보 바 */}
        <div className="shrink-0 border-t border-slate-800 px-3 py-1.5">
          <div className="flex items-center gap-2 text-[10px] text-slate-500">
            {data?.cached && <span className="bg-slate-700 px-1.5 py-0.5 rounded text-slate-400">캐시</span>}
            <span className="flex-1 truncate">
              {updatedAt ? `업데이트 ${updatedAt.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}` : ''}
            </span>
            <span className={`font-medium ${richnessCls}`}>데이터 풍부도 {richnessLabel}</span>
            <button
              onClick={() => setShowSrc(v => !v)}
              className="flex items-center gap-0.5 hover:text-slate-300 transition-colors"
            >
              📊 출처 {showSrc ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
            </button>
          </div>

          {/* 데이터 출처 접이식 */}
          {showSrc && (
            <div className="mt-1.5 pt-1.5 border-t border-slate-800/60 grid grid-cols-2 gap-x-4 gap-y-0.5">
              {Object.entries(srcStatus).map(([key, val]) => (
                <div key={key} className="flex items-center justify-between text-[9px]">
                  <span className="text-slate-500">{key}</span>
                  <span className={val.status === 'ok' ? 'text-green-400' : val.status === 'empty' ? 'text-amber-400' : 'text-red-400'}>
                    {val.status === 'ok' ? '✓' : val.status === 'empty' ? '△' : '✗'}
                    {val.days ? ` ${val.days}일` : ''}
                    {val.count != null ? ` ${val.count}건` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
          <AiUsedBadge ai={data?.ai} className="mt-1.5" />
        </div>
      </div>
    </WidgetWrapper>
  );
}
