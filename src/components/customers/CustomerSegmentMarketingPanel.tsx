'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bot, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { getAuthHeaders } from '@/lib/getAuthHeaders';
import type { CustomerAdviceSegment } from '@/lib/marketing/customerSegmentAdvice';
import type { SegmentMarketingContext } from '@/lib/marketing/customerSegmentAdvice.server';

export interface SegmentAdviceResponse {
  segment: CustomerAdviceSegment;
  segmentLabel: string;
  summary: string;
  couponStrategy: string;
  messageTone: string;
  actions: string[];
  sampleMessage: string;
  timing: string;
  cautions: string[];
  provider?: string;
  generatedAt: string;
  cached?: boolean;
  empty?: boolean;
  context?: SegmentMarketingContext;
}

interface CustomerSegmentMarketingPanelProps {
  segment: CustomerAdviceSegment;
  storeId: string;
  count: number;
}

export default function CustomerSegmentMarketingPanel({
  segment,
  storeId,
  count,
}: CustomerSegmentMarketingPanelProps) {
  const [data, setData] = useState<SegmentAdviceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAdvice = useCallback(async (refresh = false) => {
    if (!storeId || !segment) return;
    setLoading(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const params = new URLSearchParams({ storeId, segment });
      if (refresh) params.set('refresh', '1');
      const res = await fetch(`/api/marketing/segment-advice?${params}`, { headers });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `오류 (${res.status})`);
      setData(json);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [storeId, segment]);

  useEffect(() => {
    void loadAdvice(false);
  }, [loadAdvice]);

  const ctx = data?.context;
  const displayCount = ctx?.count ?? count;

  return (
    <div className="bg-slate-900/70 border border-teal-500/25 rounded-xl overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-teal-500/15 bg-teal-500/5">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-teal-400" />
          <span className="text-sm font-semibold text-teal-200">
            AI 마케팅 제안 — {data?.segmentLabel || segment}
          </span>
          <span className="text-xs text-slate-500">
            {displayCount.toLocaleString()}명
          </span>
          {data?.cached && (
            <span className="text-[10px] px-1.5 py-0.5 rounded border border-slate-600 text-slate-500">
              오늘 캐시
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => void loadAdvice(true)}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          새로고침
        </button>
      </div>

      <div className="p-4 space-y-4">
        {loading && !data && (
          <div className="flex items-center gap-2 text-sm text-slate-400 py-6 justify-center">
            <Loader2 className="w-4 h-4 animate-spin text-teal-400" />
            세그먼트 분석 중…
          </div>
        )}

        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}

        {data && !error && (
          <>
            <p className="text-[15px] text-slate-100 leading-relaxed">{data.summary}</p>

            {ctx && displayCount > 0 && (
              <div className="flex flex-wrap gap-2 text-[11px]">
                {ctx.avgChurnScore != null && (
                  <span className="px-2 py-0.5 rounded-full border bg-slate-800 text-slate-400 border-slate-700">
                    평균 이탈 {ctx.avgChurnScore}점
                  </span>
                )}
                {ctx.avgDaysSinceLastVisit != null && (
                  <span className="px-2 py-0.5 rounded-full border bg-slate-800 text-slate-400 border-slate-700">
                    평균 미방문 {ctx.avgDaysSinceLastVisit}일
                  </span>
                )}
                {ctx.avgCycleDays != null && (
                  <span className="px-2 py-0.5 rounded-full border bg-slate-800 text-slate-400 border-slate-700">
                    평균 주기 {ctx.avgCycleDays}일
                  </span>
                )}
                {Object.entries(ctx.marketingBreakdown).map(([label, n]) => (
                  <span key={label} className="px-2 py-0.5 rounded-full border bg-teal-500/10 text-teal-300 border-teal-500/25">
                    {label} {n}명
                  </span>
                ))}
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-3">
              <AdviceBlock title="쿠폰·혜택" content={data.couponStrategy} />
              <AdviceBlock title="문자 톤" content={data.messageTone} />
              <AdviceBlock title="발송 타이밍" content={data.timing} className="md:col-span-2" />
            </div>

            {data.actions.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">실행 조치</p>
                <ul className="space-y-1.5">
                  {data.actions.map((action, i) => (
                    <li key={i} className="text-sm text-slate-300 flex gap-2">
                      <span className="text-teal-500 shrink-0">•</span>
                      {action}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {data.sampleMessage && (
              <div className="bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2.5">
                <p className="text-[10px] text-slate-500 mb-1">샘플 문자</p>
                <p className="text-sm text-slate-200 whitespace-pre-wrap">{data.sampleMessage}</p>
              </div>
            )}

            {data.cautions.length > 0 && (
              <div className="text-xs text-amber-400/90 space-y-1">
                {data.cautions.map((c, i) => (
                  <p key={i}>⚠ {c}</p>
                ))}
              </div>
            )}

            {data.provider && (
              <p className="text-[10px] text-slate-600 flex items-center gap-1">
                <Bot className="w-3 h-3" />
                {data.provider} · {new Date(data.generatedAt).toLocaleString('ko-KR')}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function AdviceBlock({
  title,
  content,
  className = '',
}: {
  title: string;
  content: string;
  className?: string;
}) {
  if (!content || content === '—') return null;
  return (
    <div className={`bg-slate-800/40 border border-slate-700/60 rounded-lg px-3 py-2.5 ${className}`}>
      <p className="text-[10px] text-slate-500 mb-1">{title}</p>
      <p className="text-sm text-slate-200 leading-relaxed">{content}</p>
    </div>
  );
}
