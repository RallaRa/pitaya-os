'use client';

import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, Target } from 'lucide-react';
import WidgetWrapper from './WidgetWrapper';
import WidgetEmptyReason from './WidgetEmptyReason';
import { AiUsedBadge, type AiMetaDisplay } from '@/components/AiUsedBadge';
import { getAuthHeaders } from '@/lib/getAuthHeaders';

interface PredictionItem {
  rank: number; item: string; expectedSales: number;
  displayRecommend: string; changeVsLastWeek: number;
  confidence: number; badges: string[]; reasons: string[];
  reasonDetail: string;
}

interface PredictionData {
  predictionDate: string; supporterComment: string;
  topItems: PredictionItem[]; bottomItems: PredictionItem[];
  keyFactors: string[];
  dataSourceStatus: Record<string, string>;
  activeVariables: number; modelAccuracy: number;
  noData?: boolean; cached?: boolean;
  emptyReason?: string;
  generatedAt?: unknown;
  ai?: AiMetaDisplay;
}

function boldify(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**')
      ? <strong key={i} className="font-bold text-slate-100">{p.slice(2, -2)}</strong>
      : <span key={i}>{p}</span>,
  );
}

function ItemRow({ item }: { item: PredictionItem }) {
  const changeColor = item.changeVsLastWeek > 0 ? 'text-green-400' : item.changeVsLastWeek < 0 ? 'text-red-400' : 'text-slate-500';
  return (
    <div className="flex items-start gap-2 py-2 border-b border-slate-800/60 last:border-0">
      <span className="text-[10px] font-bold text-slate-500 w-4 shrink-0 mt-0.5">{item.rank}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-xs text-slate-200 font-medium break-words">{item.item}</span>
          {item.badges?.map((b, i) => (
            <span key={i} className="text-[9px] bg-slate-700 text-slate-300 px-1 rounded shrink-0">{b}</span>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-[10px] text-teal-400">{item.expectedSales}kg 예상</span>
          {item.changeVsLastWeek !== 0 && (
            <span className={`text-[10px] ${changeColor}`}>
              {item.changeVsLastWeek > 0 ? '+' : ''}{item.changeVsLastWeek}%
            </span>
          )}
          <span className="text-[10px] text-slate-600">신뢰도 {item.confidence}%</span>
        </div>
        {item.displayRecommend && (
          <p className="text-[10px] text-slate-500 mt-0.5 break-words">{item.displayRecommend}</p>
        )}
        {item.reasonDetail && (
          <p className="text-[10px] text-slate-400 mt-1 leading-relaxed break-words whitespace-pre-wrap">
            💡 {item.reasonDetail}
          </p>
        )}
      </div>
    </div>
  );
}

export default function SalesPredictionWidget({
  editMode, onRemove, storeId,
}: { editMode: boolean; onRemove: () => void; storeId?: string }) {
  const [data,       setData]       = useState<PredictionData | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [updatedAt,  setUpdatedAt]  = useState<Date | null>(null);
  const [showSource, setShowSource] = useState(false);
  const [orderInfo,  setOrderInfo]  = useState<{ dDayType?: string; gaps?: { start: string; end: string }[] } | null>(null);

  const load = useCallback(async (forceRefresh = false) => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams();
      if (storeId) params.set('storeId', storeId);
      if (forceRefresh) params.set('refresh', '1');
      const res = await fetch(`/api/dashboard/sales-prediction?${params}`, { headers: await getAuthHeaders() });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setData(d); setUpdatedAt(new Date());
    } catch {
      setError('예측 데이터를 불러오지 못했습니다');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  const loadOrderInfo = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (storeId) params.set('storeId', storeId);
      const res = await fetch(`/api/order/check-delivery-gap?${params}`, { headers: await getAuthHeaders() });
      setOrderInfo(await res.json());
    } catch { /* ignore */ }
  }, [storeId]);

  useEffect(() => { load(false); loadOrderInfo(); }, [load, loadOrderInfo]);

  const dDayType = orderInfo?.dDayType;
  const dDayBanner = dDayType ? {
    'D-2':    { bg: 'bg-amber-900/30 border-amber-500/40', text: 'text-amber-300', msg: '📦 발주 마감 D-2 — 발주 준비를 시작하세요' },
    'D-1':    { bg: 'bg-orange-900/30 border-orange-500/40', text: 'text-orange-300', msg: '📦 발주 마감 D-1 ⚠️ — 오늘 중 발주하세요!' },
    '당일':   { bg: 'bg-red-900/30 border-red-500/40', text: 'text-red-300 font-bold', msg: '🚨 오늘이 발주 마감일입니다!' },
    '배송불가': { bg: 'bg-red-900/40 border-red-500/50', text: 'text-red-200 font-bold animate-pulse', msg: `🚨 긴급 발주 필요 — 배송 불가 구간 (${orderInfo?.gaps?.[0]?.start}~${orderInfo?.gaps?.[0]?.end})` },
  }[dDayType] : null;

  const showEmptyReason = data?.noData || (!data?.supporterComment && !(data?.topItems?.length));

  return (
    <WidgetWrapper
      title="📈 AI 매출 예측 분석"
      editMode={editMode}
      onRemove={onRemove}
      onRefresh={() => load(true)}
      updatedAt={updatedAt}
      loading={loading}
      error={error}
      autoHeight
      className="shadow-lg shadow-teal-900/10"
    >
      <div className="flex flex-col text-xs pb-2">

        <div className="mx-2 mt-1 mb-1 flex items-start gap-1.5 bg-amber-950/40 border border-amber-500/30 rounded-lg px-2.5 py-1.5">
          <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-amber-300/80 text-[10px] leading-tight">
            AI 예측은 보조 참고 수단입니다. 실제와 다를 수 있으며 운영자의 판단을 우선하세요.
          </p>
        </div>

        {dDayBanner && (
          <div className={`mx-2 mb-2 border rounded-lg px-2.5 py-1.5 ${dDayBanner.bg}`}>
            <p className={`text-[10px] ${dDayBanner.text}`}>{dDayBanner.msg}</p>
          </div>
        )}

        {showEmptyReason && data?.emptyReason && (
          <WidgetEmptyReason
            reason={data.emptyReason}
            hints={['POS 브릿지 실행 여부 확인', '일마감에 품목(items) 저장 여부 확인', 'AI 키는 .env.local 확인']}
            className="mx-2 mb-2"
          />
        )}

        {data?.supporterComment && (
          <div className="mx-2 mb-2 bg-blue-950/40 border border-blue-500/25 rounded-xl px-3 py-3">
            <p className="text-[10px] text-blue-400/90 font-semibold mb-1.5">🤖 AI 종합 분석 (500자 이내)</p>
            <p className="text-[12px] sm:text-[13px] text-blue-100/95 leading-relaxed whitespace-pre-wrap break-words">
              {boldify(data.supporterComment)}
            </p>
            <p className="text-[9px] text-slate-600 mt-2">{data.supporterComment.length}자 · 참고용 분석</p>
            <AiUsedBadge ai={data.ai} className="mt-2" />
          </div>
        )}

        {data?.noData ? null : (
          <div className="flex flex-col sm:flex-row gap-3 px-2">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-green-400 font-semibold mb-1 sticky top-0 bg-slate-900/95 py-0.5 z-[1]">
                📈 오늘 주력 예상 TOP5
              </p>
              <div className="rounded-lg bg-slate-800/30 px-2">
                {(data?.topItems || []).length === 0 ? (
                  <p className="text-slate-600 text-[10px] py-2">품목 예측 없음</p>
                ) : (
                  (data?.topItems || []).map(item => <ItemRow key={`t-${item.rank}`} item={item} />)
                )}
              </div>
            </div>
            <div className="hidden sm:block w-px bg-slate-800 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-red-400 font-semibold mb-1 sticky top-0 bg-slate-900/95 py-0.5 z-[1]">
                📉 오늘 감소 예상 TOP5
              </p>
              <div className="rounded-lg bg-slate-800/30 px-2">
                {(data?.bottomItems || []).length === 0 ? (
                  <p className="text-slate-600 text-[10px] py-2">품목 예측 없음</p>
                ) : (
                  (data?.bottomItems || []).map(item => <ItemRow key={`b-${item.rank}`} item={item} />)
                )}
              </div>
            </div>
          </div>
        )}

        {data && !data.noData && (
          <div className="px-2 pt-2 mt-1 border-t border-slate-800/60">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setShowSource(v => !v)}
                className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
              >
                {showSource ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                근거 데이터 펼치기
              </button>
              <span className="ml-auto flex items-center gap-1 text-[10px] text-teal-400">
                <Target className="w-3 h-3" />
                정합성 {Math.round(data.modelAccuracy || 0)}%
              </span>
            </div>
            {showSource && (
              <div className="mt-1.5 bg-slate-800/40 rounded-lg p-2 grid grid-cols-2 gap-x-3 gap-y-0.5">
                {Object.entries(data.dataSourceStatus || {}).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-1 text-[10px]">
                    <span>{v as string}</span>
                    <span className="text-slate-500 break-all">{k}</span>
                  </div>
                ))}
                <div className="col-span-2 text-[9px] text-slate-600 mt-1">
                  활성 날씨변수 {data.activeVariables}개
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </WidgetWrapper>
  );
}
