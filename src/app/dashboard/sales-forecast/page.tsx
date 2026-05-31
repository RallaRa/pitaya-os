'use client';

import { useState, useEffect, useCallback } from 'react';
import { useStore } from '@/context/StoreContext';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { RefreshCw, TrendingUp, BarChart2, AlertTriangle, Target } from 'lucide-react';
import { getAuthHeaders } from '@/lib/getAuthHeaders';

const LINE_COLORS = ['#14b8a6','#f97316','#a78bfa','#fb7185','#34d399','#60a5fa','#fbbf24','#e879f9'];

const RANGE_OPTIONS = [
  { label: '7일', value: 7 },
  { label: '14일', value: 14 },
  { label: '30일', value: 30 },
  { label: '90일', value: 90 },
];

function formatDate(d: string) {
  if (!d) return '';
  const parts = d.split('-');
  if (parts.length < 3) return d;
  return `${parts[1]}/${parts[2]}`;
}

export default function SalesForecastPage() {
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';

  const [data,       setData]       = useState<any>(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string|null>(null);
  const [days,       setDays]       = useState(30);
  const [selectedItem, setSelectedItem] = useState('');
  const [activeLines, setActiveLines]   = useState<string[]>([]);

  const load = useCallback(async () => {
    if (!storeId) {
      setLoading(false);
      setData(null);
      setError('매장을 선택해 주세요.');
      return;
    }
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ days: String(days), storeId });
      if (selectedItem) params.set('item', selectedItem);
      const res = await fetch(`/api/dashboard/sales-forecast?${params}`, {
        headers: await getAuthHeaders(),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      setData(d);
      // 기본 상위 5개 라인 활성화
      const top5 = (d.items || []).slice(0, 5);
      setActiveLines(prev => {
        if (prev.length === 0) return top5;
        return prev.filter((n: string) => d.items.includes(n)).slice(0, 8);
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [storeId, days, selectedItem]);

  useEffect(() => { load(); }, [load]);

  const toggleLine = (name: string) => {
    setActiveLines(prev =>
      prev.includes(name)
        ? prev.filter(n => n !== name)
        : [...prev, name].slice(0, 8)
    );
  };

  const stats = data?.stats || {};
  const topItemsByTotal = (data?.items || [])
    .slice(0, 20)
    .filter((n: string) => stats[n])
    .sort((a: string, b: string) => (stats[b]?.total || 0) - (stats[a]?.total || 0));

  return (
    <div className="flex flex-col min-h-full bg-slate-950 text-slate-200">
      {/* 헤더 */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-800/60 shrink-0 flex-wrap">
        <TrendingUp className="w-5 h-5 text-teal-400 shrink-0" />
        <h1 className="text-slate-200 font-semibold text-sm flex-1">품목별 매출 추이</h1>

        {/* 기간 선택 */}
        <div className="flex items-center gap-1">
          {RANGE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setDays(opt.value)}
              className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${
                days === opt.value
                  ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg text-xs transition-colors disabled:opacity-40"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          새로고침
        </button>
      </div>

      {/* 경고 배너 */}
      <div className="mx-4 mt-3 flex items-start gap-1.5 bg-amber-950/40 border border-amber-500/30 rounded-lg px-3 py-2 shrink-0">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
        <p className="text-amber-300/80 text-xs leading-tight">
          AI 예측은 보조 참고 수단입니다. 실제 판매 결과와 다를 수 있으며 운영자의 판단을 우선하세요.
        </p>
      </div>

      <div className="flex flex-1 gap-4 p-4 overflow-hidden min-h-0">
        {/* 왼쪽: 차트 영역 */}
        <div className="flex-1 flex flex-col gap-4 min-w-0">

          {/* 정확도 배지 */}
          {data && (
            <div className="flex items-center gap-3 px-1">
              <span className="flex items-center gap-1.5 text-xs text-teal-400">
                <Target className="w-3.5 h-3.5" />
                모델 정합성 {Math.round(data.modelAccuracy || 0)}%
              </span>
              <span className="text-xs text-slate-600">
                데이터 {data.dataPoints || 0}일 · {(data.items || []).length}개 품목
              </span>
            </div>
          )}

          {/* 차트 */}
          <div className="flex-1 bg-slate-900/50 border border-slate-800/60 rounded-2xl p-4 min-h-0 flex flex-col">
            {loading ? (
              <div className="flex-1 flex items-center justify-center">
                <RefreshCw className="w-6 h-6 text-slate-600 animate-spin" />
              </div>
            ) : error ? (
              <div className="flex-1 flex items-center justify-center text-red-400 text-sm">{error}</div>
            ) : !data?.chartData?.length ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-600 px-4 text-center">
                <BarChart2 className="w-10 h-10 opacity-30" />
                <p className="text-sm">{data?.emptyReason || '일마감·POS 동기화 데이터가 없습니다.'}</p>
                <p className="text-xs text-slate-700">POS 브릿지 동기화 또는 일마감 품목 입력 후 다시 확인해 주세요.</p>
              </div>
            ) : (
              <>
                <p className="text-xs text-slate-500 mb-3 shrink-0">
                  판매량 추이 (kg / 개) — 최근 {days}일
                </p>
                <div className="flex-1 min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.chartData} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={formatDate}
                        tick={{ fill: '#64748b', fontSize: 10 }}
                        tickLine={false}
                        axisLine={{ stroke: '#1e293b' }}
                      />
                      <YAxis
                        tick={{ fill: '#64748b', fontSize: 10 }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                        labelFormatter={formatDate}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: 11, color: '#94a3b8' }}
                        iconType="circle"
                        iconSize={8}
                      />
                      {activeLines.map((name, idx) => (
                        <Line
                          key={name}
                          type="monotone"
                          dataKey={name}
                          stroke={LINE_COLORS[idx % LINE_COLORS.length]}
                          strokeWidth={1.5}
                          dot={false}
                          activeDot={{ r: 4 }}
                          connectNulls
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </div>

          {/* 품목 선택 칩 */}
          {(data?.items || []).length > 0 && (
            <div className="flex flex-wrap gap-1.5 shrink-0">
              {(data.items as string[]).slice(0, 20).map((name: string, idx: number) => {
                const isActive = activeLines.includes(name);
                const color = LINE_COLORS[activeLines.indexOf(name) % LINE_COLORS.length];
                return (
                  <button
                    key={name}
                    onClick={() => toggleLine(name)}
                    className={`px-2.5 py-1 rounded-full text-xs transition-all border ${
                      isActive
                        ? 'border-transparent text-slate-900 font-medium'
                        : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:bg-slate-800'
                    }`}
                    style={isActive ? { background: color } : undefined}
                  >
                    {name}
                  </button>
                );
              })}
              <span className="text-[10px] text-slate-600 self-center ml-1">최대 8개 선택</span>
            </div>
          )}
        </div>

        {/* 오른쪽: 통계 테이블 */}
        <div className="w-72 shrink-0 flex flex-col gap-3">
          <div className="bg-slate-900/50 border border-slate-800/60 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800/60">
              <p className="text-xs font-semibold text-slate-300">품목별 통계 ({days}일)</p>
            </div>
            <div className="overflow-y-auto max-h-[calc(100vh-280px)]">
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <RefreshCw className="w-4 h-4 text-slate-600 animate-spin" />
                </div>
              ) : topItemsByTotal.length === 0 ? (
                <p className="text-xs text-slate-600 text-center py-8">데이터 없음</p>
              ) : (
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-slate-500 border-b border-slate-800/60">
                      <th className="text-left px-3 py-2 font-medium">품목</th>
                      <th className="text-right px-3 py-2 font-medium">평균</th>
                      <th className="text-right px-3 py-2 font-medium">최대</th>
                      <th className="text-right px-3 py-2 font-medium">일수</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topItemsByTotal.map((name: string, idx: number) => {
                      const s = stats[name];
                      const isActive = activeLines.includes(name);
                      return (
                        <tr
                          key={name}
                          onClick={() => toggleLine(name)}
                          className={`border-b border-slate-800/40 last:border-0 cursor-pointer transition-colors ${
                            isActive ? 'bg-slate-800/60' : 'hover:bg-slate-800/30'
                          }`}
                        >
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              {isActive && (
                                <div
                                  className="w-2 h-2 rounded-full shrink-0"
                                  style={{ background: LINE_COLORS[activeLines.indexOf(name) % LINE_COLORS.length] }}
                                />
                              )}
                              <span className={`truncate max-w-[90px] ${isActive ? 'text-slate-200' : 'text-slate-400'}`}>
                                {name}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right text-teal-400">{s.avg}</td>
                          <td className="px-3 py-2 text-right text-slate-300">{s.max}</td>
                          <td className="px-3 py-2 text-right text-slate-500">{s.days}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* 서포터 의견 카드 */}
          <div className="bg-blue-950/30 border border-blue-500/20 rounded-xl px-4 py-3">
            <p className="text-[10px] text-slate-500 mb-1">🤖 서포터 의견</p>
            <p className="text-[11px] text-blue-200/80 leading-relaxed">
              {(data?.items || []).length === 0
                ? '일마감 데이터 입력 시 AI가 품목별 추이를 분석합니다.'
                : `최근 ${days}일간 ${topItemsByTotal[0] || ''}이(가) 가장 활발히 판매되었습니다. 차트에서 품목을 클릭해 비교해 보세요.`
              }
            </p>
            <p className="text-[9px] text-slate-600 mt-1">ℹ️ AI 분석 결과이며 참고용입니다</p>
          </div>
        </div>
      </div>
    </div>
  );
}
