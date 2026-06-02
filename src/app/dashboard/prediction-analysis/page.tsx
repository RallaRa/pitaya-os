'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useStore } from '@/context/StoreContext';
import { getAuthHeaders } from '@/lib/getAuthHeaders';
import {
  TrendingUp, TrendingDown, Target, RefreshCw, AlertCircle,
  CheckCircle, XCircle, History, ChevronRight, ChevronLeft, Calendar,
} from 'lucide-react';
import type { PredictionAnalysisSnapshot } from '@/lib/predictionAnalysis';
import {
  addDaysYMD,
  formatDateWithDow,
  getKSTTodayYMD,
  getKSTYesterdayYMD,
} from '@/lib/dateUtils';
import { getSidebarAnalysisDefaultYmd } from '@/lib/predictionDailyLock';

function GrowthBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-slate-500 text-xs">-</span>;
  if (pct >= 20) return (
    <span className="inline-flex items-center gap-0.5 text-green-400 text-xs font-semibold">
      <TrendingUp className="w-3 h-3" />+{pct}%
    </span>
  );
  if (pct <= -20) return (
    <span className="inline-flex items-center gap-0.5 text-red-400 text-xs font-semibold">
      <TrendingDown className="w-3 h-3" />{pct}%
    </span>
  );
  return (
    <span className={`text-xs font-medium ${pct >= 0 ? 'text-teal-400' : 'text-amber-400'}`}>
      {pct >= 0 ? '+' : ''}{pct}%
    </span>
  );
}

function MatchIcon({ match, predicted, actual }: { match: boolean; predicted: number | null; actual: number | null }) {
  if (predicted == null) return <span className="text-slate-600 text-[10px]">미예측</span>;
  if (actual == null) return <XCircle className="w-3.5 h-3.5 text-red-400" />;
  if (match) return <CheckCircle className="w-3.5 h-3.5 text-green-400" />;
  return <AlertCircle className="w-3.5 h-3.5 text-amber-400" />;
}

export default function PredictionAnalysisPage() {
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';

  const [data, setData] = useState<PredictionAnalysisSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(getSidebarAnalysisDefaultYmd);

  const maxDate = getKSTTodayYMD();
  const isToday = selectedDate === maxDate;

  const load = useCallback(async () => {
    if (!storeId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const params = new URLSearchParams({ storeId, date: selectedDate });
      const res = await fetch(`/api/dashboard/prediction-analysis?${params}`, { headers });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '조회 실패');
      setData(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [storeId, selectedDate]);

  useEffect(() => { load(); }, [load]);

  const shiftDate = (delta: number) => {
    setSelectedDate(prev => {
      const next = addDaysYMD(prev, delta);
      if (next > maxDate) return maxDate;
      return next;
    });
  };

  if (!storeId) {
    return (
      <div className="p-6 text-slate-400 text-sm">매장을 선택해 주세요.</div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Target className="w-5 h-5 text-teal-400" />
            예측분석
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            {formatDateWithDow(selectedDate)} 기준 · 품목 성장률 · 예측 vs 실제 · AI 반영 근거
          </p>
          <p className="text-slate-500 text-xs mt-0.5">
            기본 데이터는 전일 23:59 마감(00:00 일마감 전 확정분). 당일 선택 시 실적만 누적 표시됩니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-900 border border-slate-700 rounded-lg p-1">
            <button
              type="button"
              onClick={() => shiftDate(-1)}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-md transition-colors"
              title="이전 날"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 px-2">
              <Calendar className="w-3.5 h-3.5 text-teal-400 shrink-0" />
              <input
                type="date"
                value={selectedDate}
                max={maxDate}
                onChange={e => {
                  const v = e.target.value;
                  if (v && v <= maxDate) setSelectedDate(v);
                }}
                className="bg-transparent text-sm text-white focus:outline-none [color-scheme:dark]"
              />
            </div>
            <button
              type="button"
              onClick={() => shiftDate(1)}
              disabled={selectedDate >= maxDate}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-md transition-colors disabled:opacity-30 disabled:pointer-events-none"
              title="다음 날"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => setSelectedDate(maxDate)}
            disabled={isToday}
            className="text-xs text-slate-400 hover:text-teal-400 border border-slate-700 rounded-lg px-3 py-2 disabled:opacity-40"
          >
            오늘
          </button>
          <button
            type="button"
            onClick={() => setSelectedDate(addDaysYMD(maxDate, -1))}
            disabled={selectedDate === addDaysYMD(maxDate, -1)}
            className="text-xs text-slate-400 hover:text-teal-400 border border-slate-700 rounded-lg px-3 py-2 disabled:opacity-40"
          >
            어제
          </button>
          <Link
            href="/dashboard/prediction-history"
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-teal-400 border border-slate-700 rounded-lg px-3 py-2"
          >
            <History className="w-3.5 h-3.5" /> AI 예측 히스토리
            <ChevronRight className="w-3 h-3" />
          </Link>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1 text-xs bg-teal-600 hover:bg-teal-500 text-white rounded-lg px-3 py-2 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> 새로고침
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded-xl p-4 text-red-300 text-sm">{error}</div>
      )}

      {loading && !data && (
        <div className="text-slate-500 text-sm py-12 text-center">분석 데이터 로딩 중...</div>
      )}

      {data && (
        <>
          {data.dataBasisLabel && (
            <div className="bg-slate-900/80 border border-slate-700 rounded-xl px-4 py-2 text-xs text-slate-400">
              집계 기준: {data.dataBasisLabel}
            </div>
          )}

          {/* 요약 카드 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <p className="text-[10px] text-slate-500 uppercase tracking-wide">분석 대상일</p>
              <p className="text-lg font-bold text-white mt-1">{formatDateWithDow(data.targetDate)}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                예측 생성: {data.predictionDate}
                {data.isPartialDay && <span className="text-amber-400 ml-1">· 당일 누적</span>}
              </p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <p className="text-[10px] text-slate-500 uppercase tracking-wide">실제 매출</p>
              <p className="text-lg font-bold text-teal-400 mt-1">
                {(data.actual?.netSales || 0).toLocaleString()}원
              </p>
              <p className="text-xs text-slate-500 mt-0.5">{data.isPartialDay ? '현재까지 순매출' : '순매출 기준'}</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <p className="text-[10px] text-slate-500 uppercase tracking-wide">예측 정합성</p>
              <p className="text-lg font-bold text-white mt-1">
                {data.accuracyScore != null ? `${data.accuracyScore}%` : '미검증'}
              </p>
              <p className="text-xs text-slate-500 mt-0.5 truncate">{data.insightSummary}</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <p className="text-[10px] text-slate-500 uppercase tracking-wide">백테스트 평균</p>
              <p className="text-lg font-bold text-purple-400 mt-1">
                {data.backtest?.avgAccuracy != null ? `${data.backtest.avgAccuracy}%` : '-'}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                최근 {data.backtest?.recentScores?.length || 0}일 참조
              </p>
            </div>
          </div>

          {data.isPartialDay && (
            <div className="bg-blue-900/20 border border-blue-800/50 rounded-xl p-4 text-blue-200 text-sm">
              당일 실적은 POS 동기화 시점까지 누적됩니다. 마감 후 정확도가 더 높아집니다.
            </div>
          )}

          {data.accuracyDetail && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <p className="text-xs font-semibold text-slate-300 mb-2">정확도 산출 ({data.accuracyDetail.method})</p>
              <div className="flex flex-wrap gap-3 text-xs">
                <span className="text-teal-400">TOP10 적중 {data.accuracyDetail.top5Hits}/{data.accuracyDetail.top5Total}</span>
                <span className="text-slate-400">순위보너스 +{data.accuracyDetail.rankBonus}점</span>
                {data.accuracyDetail.missed.length > 0 && (
                  <span className="text-amber-400">과대예측: {data.accuracyDetail.missed.join(', ')}</span>
                )}
                {data.accuracyDetail.surprises.length > 0 && (
                  <span className="text-red-400">누락: {data.accuracyDetail.surprises.join(', ')}</span>
                )}
              </div>
            </div>
          )}

          {data.backtest?.calibrationNotes?.length > 0 && (
            <div className="bg-purple-900/15 border border-purple-800/40 rounded-xl p-4">
              <p className="text-xs font-semibold text-purple-300 mb-2">백테스트 보정 (다음 AI 예측에 자동 반영)</p>
              <ul className="space-y-1">
                {data.backtest.calibrationNotes.map((note, i) => (
                  <li key={i} className="text-xs text-slate-400">· {note}</li>
                ))}
              </ul>
              {data.backtest.recentScores.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {data.backtest.recentScores.slice(0, 10).map(row => (
                    <span
                      key={row.date}
                      className={`text-[10px] px-2 py-0.5 rounded-full border ${
                        row.score >= 70
                          ? 'border-green-500/40 text-green-400 bg-green-900/20'
                          : row.score >= 40
                            ? 'border-amber-500/40 text-amber-400 bg-amber-900/20'
                            : 'border-red-500/40 text-red-400 bg-red-900/20'
                      }`}
                    >
                      {row.date.slice(5)} {row.score}%
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {data.noData && (
            <div className="bg-amber-900/20 border border-amber-800/50 rounded-xl p-4 text-amber-200 text-sm">
              아직 충분한 예측·실적 데이터가 없습니다. 일마감 또는 POS 동기화 후 다시 확인해 주세요.
            </div>
          )}

          {/* 예측 vs 실제 */}
          <section className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800">
              <h2 className="text-sm font-semibold text-slate-200">예측 vs 실제 품목 비교</h2>
              <p className="text-[10px] text-slate-500 mt-0.5">{data.targetDate} 기준 TOP 품목</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-800">
                    <th className="text-left p-3 font-medium">품목</th>
                    <th className="text-center p-3 font-medium">예측순위</th>
                    <th className="text-center p-3 font-medium">실제순위</th>
                    <th className="text-right p-3 font-medium">실제수량</th>
                    <th className="text-center p-3 font-medium">적중</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.itemCompare || []).length === 0 ? (
                    <tr><td colSpan={5} className="p-6 text-center text-slate-600">비교 데이터 없음</td></tr>
                  ) : data.itemCompare.map(row => (
                    <tr key={row.item} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                      <td className="p-3 text-slate-200">{row.item}</td>
                      <td className="p-3 text-center text-slate-400">{row.predictedRank ?? '-'}</td>
                      <td className="p-3 text-center text-slate-400">{row.actualRank ?? '-'}</td>
                      <td className="p-3 text-right text-slate-300">{row.actualQty}</td>
                      <td className="p-3 text-center">
                        <MatchIcon match={row.match} predicted={row.predictedRank} actual={row.actualRank} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 품목 성장률 */}
            <section className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800">
                <h2 className="text-sm font-semibold text-slate-200">품목별 매출상승률</h2>
                <p className="text-[10px] text-slate-500 mt-0.5">최근 7일 vs 이전 7일 판매량</p>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {(data.itemGrowth || []).slice(0, 15).map(row => (
                  <div key={row.name} className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800/50">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-slate-200 truncate">{row.name}</p>
                      <p className="text-[10px] text-slate-600 truncate">{row.basis}</p>
                    </div>
                    <GrowthBadge pct={row.growthPct} />
                  </div>
                ))}
                {(data.itemGrowth || []).length === 0 && (
                  <p className="p-6 text-center text-slate-600 text-xs">성장률 데이터 없음</p>
                )}
              </div>
            </section>

            {/* 예측 상세 */}
            <section className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800">
                <h2 className="text-sm font-semibold text-slate-200">당시 AI 예측 근거</h2>
                <p className="text-[10px] text-slate-500 mt-0.5">{data.predictionDate} 생성 예측</p>
              </div>
              <div className="p-4 space-y-3 max-h-80 overflow-y-auto">
                {data.predicted?.supporterComment ? (
                  <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
                    {data.predicted.supporterComment.replace(/\*\*/g, '')}
                  </p>
                ) : (
                  <p className="text-xs text-slate-600">예측 기록 없음</p>
                )}
                {data.predicted?.keyFactors && data.predicted.keyFactors.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {data.predicted.keyFactors.map(f => (
                      <span key={f} className="text-[10px] bg-teal-900/40 text-teal-300 px-2 py-0.5 rounded-full">{f}</span>
                    ))}
                  </div>
                )}
                {data.predicted?.topItems && data.predicted.topItems.length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-slate-800">
                    <p className="text-[10px] text-teal-400 font-semibold uppercase">예측 TOP 품목</p>
                    {data.predicted.topItems.slice(0, 5).map((it, i) => (
                      <div key={i} className="text-xs text-slate-400 flex justify-between gap-2">
                        <span>{it.item}</span>
                        {it.changeVsLastWeek != null && (
                          <span className={it.changeVsLastWeek >= 0 ? 'text-green-400' : 'text-red-400'}>
                            {it.changeVsLastWeek >= 0 ? '+' : ''}{it.changeVsLastWeek}%
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>

          <p className="text-[10px] text-slate-600 text-center">
            이 분석 요약은 대시보드 AI 매출 예측 갱신 시 프롬프트 변수로 자동 반영됩니다.
          </p>
        </>
      )}
    </div>
  );
}
