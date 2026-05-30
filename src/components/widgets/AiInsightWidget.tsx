'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp, TrendingDown, Minus, RefreshCw,
  ChevronDown, ChevronUp, MapPin, Users, Newspaper,
} from 'lucide-react';
import { getAuthHeaders } from '@/lib/getAuthHeaders';
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts';
import WidgetWrapper from './WidgetWrapper';
import { AiUsedBadge, type AiMetaDisplay } from '@/components/AiUsedBadge';

interface TrendItem {
  groupName: string;
  data: { period: string; ratio: number }[];
  current: number;
  change: number;
}

interface Highlight { tag: string; text: string; }

interface ComprehensiveData {
  summary?: string;
  opinion?: string;
  highlights?: Highlight[];
  actions?: string[];
  trends?: TrendItem[];
  news?: { keyword: string; title: string; description?: string }[];
  footTraffic?: { index: number; level: string; summary: string };
  commercial?: { businessSummary: string; competitiveLevel: string };
  sales?: { today: number; yesterday: number; change: number | null };
  dataSourceStatus?: Record<string, { status: string; detail?: string }>;
  noData?: boolean;
  cached?: boolean;
  error?: string;
  ai?: AiMetaDisplay;
}

const TAG_COLORS: Record<string, string> = {
  매출: 'bg-teal-500/20 text-teal-300',
  고객: 'bg-blue-500/20 text-blue-300',
  품목: 'bg-purple-500/20 text-purple-300',
  트렌드: 'bg-yellow-500/20 text-yellow-300',
  상권: 'bg-orange-500/20 text-orange-300',
  뉴스: 'bg-red-500/20 text-red-300',
};

function Sparkline({ data }: { data: { period: string; ratio: number }[] }) {
  if (!data?.length) return null;
  return (
    <div className="h-8 w-16 shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line type="monotone" dataKey="ratio" stroke="#14b8a6" dot={false} strokeWidth={1.5} />
          <Tooltip
            contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 6, fontSize: 10 }}
            formatter={(v: number) => [`${Math.round(v)}`, '검색지수']}
            labelFormatter={() => ''}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function boldify(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**')
      ? <strong key={i} className="font-bold text-white">{p.slice(2, -2)}</strong>
      : <span key={i}>{p}</span>,
  );
}

export default function AiInsightWidget({
  editMode, onRemove, storeId,
}: {
  editMode: boolean; onRemove: () => void; storeId?: string;
}) {
  const [data, setData] = useState<ComprehensiveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [showSources, setShowSources] = useState(false);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams();
      if (storeId) q.set('storeId', storeId);
      if (force) q.set('force', '1');
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/dashboard/comprehensive-opinion?${q}`, { headers });
      const d = await res.json();
      if (!res.ok && d.error) setError(d.error);
      setData(d);
      setUpdatedAt(new Date());
    } catch {
      setError('종합 의견을 불러오지 못했습니다');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  const srcStatus = data?.dataSourceStatus || {};
  const okCount = Object.values(srcStatus).filter(s => s.status === 'ok' || s.status === 'estimate').length;

  return (
    <WidgetWrapper
      title="AI 종합 운영의견"
      editMode={editMode}
      onRemove={onRemove}
      onRefresh={() => load(true)}
      updatedAt={updatedAt}
      loading={loading}
      error={error}
    >
      <div className="flex flex-col h-full overflow-hidden">
        {data?.noData ? (
          <div className="flex-1 flex items-center justify-center p-6 text-center">
            <div className="space-y-2">
              <MapPin className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="text-xs text-slate-400">{data.summary || '데이터 부족'}</p>
              <p className="text-[10px] text-slate-600">POS 연동 · 키워드 설정 · 일마감 입력 후 분석됩니다</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {/* 한줄 요약 */}
            {data?.summary && (
              <div className="bg-teal-900/30 border border-teal-700/40 rounded-xl px-3 py-2">
                <p className="text-teal-200 text-sm font-semibold">{data.summary}</p>
              </div>
            )}

            {/* 종합 의견 */}
            {data?.opinion && (
              <div className="bg-slate-800/50 rounded-xl p-3">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">종합 운영의견</p>
                <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">{boldify(data.opinion)}</p>
              </div>
            )}

            {/* 유동·상권·매출 스냅샷 */}
            <div className="grid grid-cols-3 gap-2">
              {data?.footTraffic && (
                <div className="bg-slate-800/40 rounded-lg p-2 border border-slate-700/40">
                  <p className="text-[9px] text-slate-500">유동</p>
                  <p className="text-sm font-bold text-slate-200">{data.footTraffic.index}</p>
                  <p className="text-[9px] text-slate-500">{data.footTraffic.level}</p>
                </div>
              )}
              {data?.commercial && (
                <div className="bg-slate-800/40 rounded-lg p-2 border border-slate-700/40">
                  <p className="text-[9px] text-slate-500">상권</p>
                  <p className="text-sm font-bold text-slate-200">{data.commercial.competitiveLevel}</p>
                  <p className="text-[9px] text-slate-500 truncate">{data.commercial.businessSummary.slice(0, 20)}</p>
                </div>
              )}
              {data?.sales && (
                <div className="bg-slate-800/40 rounded-lg p-2 border border-slate-700/40">
                  <p className="text-[9px] text-slate-500">오늘 매출</p>
                  <p className="text-sm font-bold text-teal-300">
                    {data.sales.today > 0 ? `${(data.sales.today / 10000).toFixed(0)}만` : '-'}
                  </p>
                  {data.sales.change != null && (
                    <p className={`text-[9px] ${data.sales.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {data.sales.change >= 0 ? '+' : ''}{data.sales.change}%
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* 핵심 포인트 */}
            {data?.highlights && data.highlights.length > 0 && (
              <div className="space-y-1.5">
                {data.highlights.map((h, i) => (
                  <div key={i} className="flex items-start gap-2 bg-slate-800/40 rounded-lg px-2.5 py-2">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded shrink-0 ${TAG_COLORS[h.tag] || 'bg-slate-700 text-slate-300'}`}>
                      {h.tag}
                    </span>
                    <p className="text-[11px] text-slate-300 leading-snug">{h.text}</p>
                  </div>
                ))}
              </div>
            )}

            {/* 네이버 트렌드 */}
            {data?.trends && data.trends.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-slate-400 mb-1.5 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> 네이버 검색 트렌드
                </p>
                <div className="space-y-1">
                  {data.trends.map((t, i) => (
                    <div key={i} className="flex items-center gap-2 bg-slate-800/40 rounded-lg px-2 py-1.5">
                      <span className="text-[11px] text-slate-200 flex-1 truncate">{t.groupName}</span>
                      <Sparkline data={t.data} />
                      <span className="text-[10px] text-slate-400 w-8 text-right">{t.current}</span>
                      <span className={`text-[9px] flex items-center w-10 justify-end ${t.change > 0 ? 'text-green-400' : t.change < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                        {t.change > 0 ? <TrendingUp className="w-2.5 h-2.5" /> : t.change < 0 ? <TrendingDown className="w-2.5 h-2.5" /> : <Minus className="w-2.5 h-2.5" />}
                        {t.change > 0 ? '+' : ''}{t.change}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 오늘 할 일 */}
            {data?.actions && data.actions.length > 0 && (
              <div className="bg-blue-900/20 border border-blue-700/30 rounded-xl p-3">
                <p className="text-[10px] font-semibold text-blue-300 mb-1.5 flex items-center gap-1">
                  <Users className="w-3 h-3" /> 오늘 실행
                </p>
                <ul className="space-y-1">
                  {data.actions.map((a, i) => (
                    <li key={i} className="text-[11px] text-blue-100/90 flex gap-1.5">
                      <span className="text-blue-400 shrink-0">{i + 1}.</span>{a}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 뉴스 */}
            {data?.news && data.news.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-slate-400 mb-1.5 flex items-center gap-1">
                  <Newspaper className="w-3 h-3" /> 관련 뉴스
                </p>
                <div className="space-y-1">
                  {data.news.slice(0, 4).map((n, i) => (
                    <p key={i} className="text-[10px] text-slate-400 truncate">
                      <span className="text-slate-500">[{n.keyword}]</span> {n.title}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 하단 데이터 출처 */}
        <div className="shrink-0 border-t border-slate-800 px-3 py-1.5">
          <div className="flex items-center gap-2 text-[10px] text-slate-500">
            {data?.cached && <span className="bg-slate-700 px-1.5 py-0.5 rounded">캐시</span>}
            <span className="flex-1">참조 {okCount}/7 소스</span>
            <button onClick={() => setShowSources(v => !v)} className="flex items-center gap-0.5 hover:text-slate-300">
              출처 {showSources ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
            </button>
            <button onClick={() => load(true)} className="hover:text-teal-400"><RefreshCw className="w-3 h-3" /></button>
          </div>
          {showSources && (
            <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5">
              {Object.entries(srcStatus).map(([key, val]) => (
                <div key={key} className="flex justify-between text-[9px]">
                  <span className="text-slate-500">{key}</span>
                  <span className={
                    val.status === 'ok' ? 'text-green-400'
                    : val.status === 'estimate' ? 'text-amber-400'
                    : val.status === 'empty' ? 'text-slate-500' : 'text-red-400'
                  }>
                    {val.status === 'ok' ? '✓' : val.status === 'estimate' ? '~' : val.status === 'empty' ? '△' : '✗'}
                    {val.detail ? ` ${val.detail}` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
          <AiUsedBadge ai={data?.ai} className="px-3 pb-2" />
        </div>
      </div>
    </WidgetWrapper>
  );
}
