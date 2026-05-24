'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Trophy, AlertCircle, Lightbulb, ClipboardList,
  TrendingUp, TrendingDown, Minus, RefreshCw,
  CheckCircle2, Circle, Database, ExternalLink,
} from 'lucide-react';
import {
  LineChart, Line, ResponsiveContainer, Tooltip,
} from 'recharts';
import WidgetWrapper from './WidgetWrapper';

/* ── Types ── */
interface BestItem  { item: string; reason: string; action: string; }
interface Issue     { type: '가격변동'|'트렌드'|'재고'|'날씨'; title: string; detail: string; }
interface Improvement { category: string; suggestion: string; }
interface PrepItem  { item: string; priority: 'high'|'medium'|'low'; detail: string; done?: boolean; }
interface TrendItem { groupName: string; data: {period: string; ratio: number}[]; current: number; change: number; }

interface InsightData {
  todayBest:    BestItem[];
  mainIssues:   Issue[];
  improvements: Improvement[];
  tomorrowPrep: PrepItem[];
  summary:      string;
  cached?:      boolean;
  stale?:       boolean;
  noData?:      boolean;
}

/* ── Constants ── */
const TABS = [
  { id: 'best',   label: '금일 예상 Best',  icon: '🏆' },
  { id: 'issues', label: '주요 이슈',        icon: '📢' },
  { id: 'improve',label: '보완사항',         icon: '💡' },
  { id: 'prep',   label: '익일 준비사항',    icon: '📋' },
] as const;
type TabId = typeof TABS[number]['id'];

const ISSUE_ICONS: Record<string, string> = {
  '가격변동': '🔴', '트렌드': '🟡', '재고': '🟠', '날씨': '🔵',
};
const PRIORITY_COLORS: Record<string, string> = {
  high:   'text-red-400   bg-red-400/10   border-red-400/20',
  medium: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  low:    'text-slate-400  bg-slate-700     border-slate-600',
};
const PRIORITY_LABELS: Record<string, string> = { high: '중요', medium: '보통', low: '낮음' };

/* ── Sparkline mini chart ── */
function Sparkline({ data }: { data: { period: string; ratio: number }[] }) {
  if (!data?.length) return null;
  return (
    <div className="h-8 w-16 shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line type="monotone" dataKey="ratio" stroke="#14b8a6" dot={false} strokeWidth={1.5} />
          <Tooltip
            contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 6, fontSize: 10 }}
            formatter={(v: any) => [`${Math.round(v)}`, '검색지수']}
            labelFormatter={() => ''}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ── Main Widget ── */
export default function AiInsightWidget({
  editMode, onRemove, storeId,
}: {
  editMode: boolean; onRemove: () => void; storeId?: string;
}) {
  const [data,       setData]       = useState<InsightData | null>(null);
  const [trends,     setTrends]     = useState<TrendItem[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [updatedAt,  setUpdatedAt]  = useState<Date | null>(null);
  const [activeTab,  setActiveTab]  = useState<TabId>('best');
  const [checkedPrep,setCheckedPrep]= useState<Set<number>>(new Set());

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams();
      if (storeId) q.set('storeId', storeId);
      if (force)   q.set('force', '1');

      const [insightRes, trendRes] = await Promise.allSettled([
        fetch(`/api/dashboard/ai-insight?${q}`).then(r => r.json()),
        fetch(`/api/external/naver-trend${storeId ? `?storeId=${storeId}` : ''}`).then(r => r.json()),
      ]);

      if (insightRes.status === 'fulfilled') setData(insightRes.value);
      if (trendRes.status === 'fulfilled' && trendRes.value.trends) setTrends(trendRes.value.trends);
      setUpdatedAt(new Date());
    } catch {
      setError('AI 인사이트를 불러오지 못했습니다');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  /* 체크리스트 토글 */
  const togglePrep = (idx: number) => {
    setCheckedPrep(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  /* 탭 내용 */
  const renderContent = () => {
    if (!data) return null;

    if (data.noData) {
      return (
        <div className="flex flex-col items-center justify-center h-32 gap-2 text-slate-500">
          <Database className="w-8 h-8 opacity-40" />
          <p className="text-xs text-center">{data.summary || '데이터가 없습니다'}</p>
        </div>
      );
    }

    switch (activeTab) {
      case 'best':
        return (
          <div className="space-y-2 p-3">
            {data.todayBest.length === 0 ? (
              <p className="text-slate-600 text-xs text-center py-4">추천 데이터 없음</p>
            ) : data.todayBest.map((item, i) => {
              const trend = trends.find(t => t.groupName.includes(item.item) || item.item.includes(t.groupName));
              return (
                <div key={i} className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/40">
                  <div className="flex items-start gap-2">
                    <span className="text-sm shrink-0">{['🥇','🥈','🥉'][i] || '•'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-slate-100 text-sm font-semibold">{item.item}</p>
                        {trend && <Sparkline data={trend.data} />}
                        {trend && (
                          <span className={`text-[9px] flex items-center gap-0.5 ${trend.change > 0 ? 'text-green-400' : trend.change < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                            {trend.change > 0 ? <TrendingUp className="w-2.5 h-2.5" /> : trend.change < 0 ? <TrendingDown className="w-2.5 h-2.5" /> : <Minus className="w-2.5 h-2.5" />}
                            {trend.change > 0 ? '+' : ''}{trend.change}%
                          </span>
                        )}
                      </div>
                      <p className="text-slate-400 text-[11px] mt-0.5">{item.reason}</p>
                      <p className="text-teal-400 text-[11px] mt-1 font-medium">→ {item.action}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );

      case 'issues':
        return (
          <div className="space-y-2 p-3">
            {data.mainIssues.length === 0 ? (
              <p className="text-slate-600 text-xs text-center py-4">주요 이슈 없음</p>
            ) : data.mainIssues.map((issue, i) => (
              <div key={i} className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/40">
                <div className="flex items-start gap-2">
                  <span className="text-base shrink-0 mt-0.5">{ISSUE_ICONS[issue.type] || '⚪'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-slate-100 text-xs font-semibold">{issue.title}</p>
                      <span className="text-[9px] text-slate-500 bg-slate-700 rounded px-1.5 py-0.5">{issue.type}</span>
                    </div>
                    <p className="text-slate-400 text-[11px] mt-1">{issue.detail}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        );

      case 'improve':
        return (
          <div className="space-y-2 p-3">
            {data.improvements.length === 0 ? (
              <p className="text-slate-600 text-xs text-center py-4">보완사항 없음</p>
            ) : data.improvements.map((imp, i) => (
              <div key={i} className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/40">
                <div className="flex items-start gap-2">
                  <Lightbulb className="w-3.5 h-3.5 text-yellow-400 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <span className="text-[9px] text-slate-500 bg-slate-700 rounded px-1.5 py-0.5">{imp.category}</span>
                    <p className="text-slate-200 text-xs mt-1">{imp.suggestion}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        );

      case 'prep':
        return (
          <div className="space-y-1.5 p-3">
            {data.tomorrowPrep.length === 0 ? (
              <p className="text-slate-600 text-xs text-center py-4">준비사항 없음</p>
            ) : [...data.tomorrowPrep]
              .sort((a, b) => ['high','medium','low'].indexOf(a.priority) - ['high','medium','low'].indexOf(b.priority))
              .map((prep, i) => {
                const done = checkedPrep.has(i);
                return (
                  <button
                    key={i}
                    onClick={() => togglePrep(i)}
                    className={`w-full flex items-start gap-2.5 p-2.5 rounded-xl border transition-all text-left ${
                      done ? 'bg-teal-900/20 border-teal-700/30 opacity-60' : 'bg-slate-800/60 border-slate-700/40 hover:border-slate-600'
                    }`}
                  >
                    {done
                      ? <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                      : <Circle className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                    }
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`text-xs font-medium ${done ? 'line-through text-slate-500' : 'text-slate-100'}`}>{prep.item}</p>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded border ${PRIORITY_COLORS[prep.priority]}`}>
                          {PRIORITY_LABELS[prep.priority]}
                        </span>
                      </div>
                      <p className="text-slate-400 text-[11px] mt-0.5">{prep.detail}</p>
                    </div>
                  </button>
                );
              })
            }
          </div>
        );
    }
  };

  return (
    <WidgetWrapper
      title="🤖 AI 인사이트"
      editMode={editMode}
      onRemove={onRemove}
      onRefresh={() => load(true)}
      updatedAt={updatedAt}
      loading={loading}
      error={error}
    >
      <div className="flex flex-col h-full">
        {/* 한줄 요약 */}
        {data?.summary && !data.noData && (
          <div className="mx-3 mt-2 px-3 py-2 bg-teal-900/20 border border-teal-700/30 rounded-xl">
            <p className="text-teal-300 text-xs font-medium">{data.summary}</p>
          </div>
        )}

        {/* 탭 헤더 */}
        <div className="flex gap-1 px-3 pt-2 shrink-0 overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'bg-teal-600/20 text-teal-300 border border-teal-600/30'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <span>{tab.icon}</span>
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* 탭 콘텐츠 */}
        <div className="flex-1 overflow-y-auto">
          {renderContent()}
        </div>

        {/* 하단 바 */}
        <div className="shrink-0 px-3 py-2 border-t border-slate-800/60 flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-1 flex-wrap">
            {data?.cached && (
              <span className="text-[9px] bg-slate-700 text-slate-400 rounded px-1.5 py-0.5">
                {data.stale ? '캐시(갱신실패)' : '캐시 데이터'}
              </span>
            )}
            {process.env.NEXT_PUBLIC_APP_URL !== undefined && (
              <>
                <span className="text-[9px] bg-blue-900/30 text-blue-400 rounded px-1.5 py-0.5">축산물품질평가원</span>
                <span className="text-[9px] bg-green-900/30 text-green-400 rounded px-1.5 py-0.5">네이버 데이터랩</span>
                <span className="text-[9px] bg-teal-900/30 text-teal-400 rounded px-1.5 py-0.5">자체매출</span>
              </>
            )}
          </div>
          <button
            onClick={() => load(true)}
            disabled={loading}
            className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-teal-400 transition-colors"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            새로고침
          </button>
        </div>
      </div>
    </WidgetWrapper>
  );
}
