'use client';

import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, RefreshCw, Target } from 'lucide-react';
import WidgetWrapper from './WidgetWrapper';

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
  dataSourceStatus: Record<string,string>;
  activeVariables: number; modelAccuracy: number;
  noData?: boolean; cached?: boolean;
  generatedAt?: any;
}

function boldify(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**')
      ? <strong key={i} className="font-bold text-slate-100">{p.slice(2,-2)}</strong>
      : <span key={i}>{p}</span>
  );
}

function ItemRow({ item, isTop }: { item: PredictionItem; isTop: boolean }) {
  const changeColor = item.changeVsLastWeek > 0 ? 'text-green-400' : item.changeVsLastWeek < 0 ? 'text-red-400' : 'text-slate-500';
  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-slate-800/60 last:border-0">
      <span className="text-[10px] font-bold text-slate-500 w-4 shrink-0 mt-0.5">{item.rank}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-xs text-slate-200 font-medium truncate">{item.item}</span>
          {item.badges?.map((b,i) => (
            <span key={i} className="text-[9px] bg-slate-700 text-slate-300 px-1 rounded">{b}</span>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-teal-400">{item.expectedSales}kg 예상</span>
          {item.changeVsLastWeek !== 0 && (
            <span className={`text-[10px] ${changeColor}`}>
              {item.changeVsLastWeek > 0 ? '+' : ''}{item.changeVsLastWeek}%
            </span>
          )}
        </div>
        {item.displayRecommend && (
          <p className="text-[10px] text-slate-500 mt-0.5 truncate">{item.displayRecommend}</p>
        )}
      </div>
      <span className="text-[10px] text-slate-600 shrink-0">{item.confidence}%</span>
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
  const [orderInfo,  setOrderInfo]  = useState<any>(null);

  const load = useCallback(async (forceRefresh = false) => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams();
      if (storeId) params.set('storeId', storeId);
      if (forceRefresh) params.set('refresh', '1');
      const res = await fetch(`/api/dashboard/sales-prediction?${params}`);
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setData(d); setUpdatedAt(new Date());
    } catch { setError('예측 데이터를 불러오지 못했습니다'); }
    finally { setLoading(false); }
  }, [storeId]);

  const loadOrderInfo = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (storeId) params.set('storeId', storeId);
      const res = await fetch(`/api/order/check-delivery-gap?${params}`);
      setOrderInfo(await res.json());
    } catch {}
  }, [storeId]);

  useEffect(() => { load(false); loadOrderInfo(); }, [load, loadOrderInfo]);

  const dDayBanner = orderInfo?.dDayType ? {
    'D-2':    { bg:'bg-amber-900/30 border-amber-500/40',   text:'text-amber-300',  msg:'📦 발주 마감 D-2 — 발주 준비를 시작하세요' },
    'D-1':    { bg:'bg-orange-900/30 border-orange-500/40', text:'text-orange-300', msg:'📦 발주 마감 D-1 ⚠️ — 오늘 중 발주하세요!' },
    '당일':   { bg:'bg-red-900/30 border-red-500/40',       text:'text-red-300 font-bold', msg:'🚨 오늘이 발주 마감일입니다!' },
    '배송불가':{ bg:'bg-red-900/40 border-red-500/50',      text:'text-red-200 font-bold animate-pulse', msg:`🚨 긴급 발주 필요 — 배송 불가 구간 (${orderInfo.gaps?.[0]?.start}~${orderInfo.gaps?.[0]?.end})` },
  }[orderInfo.dDayType] : null;

  return (
    <WidgetWrapper
      title="📈 AI 매출 예측"
      editMode={editMode} onRemove={onRemove}
      onRefresh={() => load(true)} updatedAt={updatedAt}
      loading={loading} error={error}
    >
      <div className="flex flex-col h-full overflow-hidden text-xs">

        {/* 경고 배너 */}
        <div className="mx-2 mt-1 mb-1 flex items-start gap-1.5 bg-amber-950/40 border border-amber-500/30 rounded-lg px-2.5 py-1.5 shrink-0">
          <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-amber-300/80 text-[10px] leading-tight">
            AI 예측은 보조 참고 수단입니다. 실제와 다를 수 있으며 운영자의 판단을 우선하세요.
          </p>
        </div>

        {/* 발주 알림 배너 */}
        {dDayBanner && (
          <div className={`mx-2 mb-1 border rounded-lg px-2.5 py-1.5 shrink-0 ${dDayBanner.bg}`}>
            <p className={`text-[10px] ${dDayBanner.text}`}>{dDayBanner.msg}</p>
          </div>
        )}

        {/* 서포터 의견 */}
        {data?.supporterComment && (
          <div className="mx-2 mb-1 bg-blue-950/30 border border-blue-500/20 rounded-lg px-2.5 py-1.5 shrink-0">
            <p className="text-[10px] text-slate-500 mb-0.5">🤖 서포터 의견</p>
            <p className="text-[10px] text-blue-200/90 leading-tight">{boldify(data.supporterComment)}</p>
            <p className="text-[9px] text-slate-600 mt-0.5">ℹ️ AI 분석 결과이며 참고용입니다</p>
          </div>
        )}

        {data?.noData ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-1 text-slate-600">
            <p className="text-xs">일마감 데이터를 꾸준히 입력하면</p>
            <p className="text-xs">정확한 예측이 시작됩니다 📊</p>
          </div>
        ) : (
          <div className="flex flex-1 gap-2 px-2 overflow-hidden min-h-0">
            {/* TOP 5 */}
            <div className="flex-1 flex flex-col min-w-0">
              <p className="text-[10px] text-green-400 font-semibold mb-1 shrink-0">📈 오늘 주력 예상 TOP5</p>
              <div className="flex-1 overflow-y-auto">
                {(data?.topItems || []).map(item => <ItemRow key={item.rank} item={item} isTop={true} />)}
              </div>
            </div>
            <div className="w-px bg-slate-800 shrink-0" />
            {/* BOTTOM 5 */}
            <div className="flex-1 flex flex-col min-w-0">
              <p className="text-[10px] text-red-400 font-semibold mb-1 shrink-0">📉 오늘 감소 예상 TOP5</p>
              <div className="flex-1 overflow-y-auto">
                {(data?.bottomItems || []).map(item => <ItemRow key={item.rank} item={item} isTop={false} />)}
              </div>
            </div>
          </div>
        )}

        {/* 하단 */}
        {data && (
          <div className="px-2 pb-1 shrink-0 border-t border-slate-800/60 mt-1 pt-1">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSource(v=>!v)}
                className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
              >
                {showSource ? <ChevronUp className="w-3 h-3"/> : <ChevronDown className="w-3 h-3"/>}
                근거 데이터 펼치기
              </button>
              <span className="ml-auto flex items-center gap-1 text-[10px] text-teal-400">
                <Target className="w-3 h-3"/>
                정합성 {Math.round(data.modelAccuracy || 0)}% 🎯
              </span>
            </div>

            {showSource && (
              <div className="mt-1.5 bg-slate-800/40 rounded-lg p-2 grid grid-cols-2 gap-x-3 gap-y-0.5">
                {Object.entries(data.dataSourceStatus || {}).map(([k,v]) => (
                  <div key={k} className="flex items-center gap-1 text-[10px]">
                    <span>{v as string}</span>
                    <span className="text-slate-500 truncate">{k}</span>
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
