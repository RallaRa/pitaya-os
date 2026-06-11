'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Loader2, RefreshCw, Send, AlertTriangle, UserX,
} from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { getAuthHeaders, getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import type { ChurnScoreFactors } from '@/lib/customerChurnScore';
import { CHURN_RISK_THRESHOLD } from '@/lib/customerChurnScore';
import { VISIT_TREND_LABELS } from '@/lib/customerVisitTrend';
import type { VisitTrendSegment } from '@/lib/customerVisitTrend';

interface ChurnRow {
  cusCode: string;
  name: string;
  phoneMasked: string;
  churnScore: number;
  factors: ChurnScoreFactors;
  daysSinceLastVisit: number | null;
  avgCycleDays: number | null;
  visitTrend: VisitTrendSegment;
  lastVisitDate: string;
  pitayaGrade: string;
}

const FACTOR_LABELS: { key: keyof ChurnScoreFactors; label: string; max: number }[] = [
  { key: 'overdueDays', label: '방문주기 초과', max: 40 },
  { key: 'frequencyDecline', label: '방문빈도 감소', max: 30 },
  { key: 'spendDecline', label: '구매금액 감소', max: 20 },
  { key: 'couponUnused', label: '쿠폰 미사용', max: 10 },
];

function scoreBadge(score: number) {
  if (score >= 85) return 'bg-rose-950/60 text-rose-400 border-rose-500/40';
  if (score >= 70) return 'bg-amber-950/50 text-amber-400 border-amber-500/40';
  return 'bg-slate-800 text-slate-400 border-slate-600';
}

export default function ChurnRiskPage() {
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';

  const [items, setItems] = useState<ChurnRow[]>([]);
  const [totalAtRisk, setTotalAtRisk] = useState(0);
  const [processedAt, setProcessedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<ChurnRow | null>(null);
  const [queueing, setQueueing] = useState(false);
  const [bulkQueueing, setBulkQueueing] = useState(false);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    if (!storeId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `/api/dashboard/churn-risk?storeId=${encodeURIComponent(storeId)}&limit=100`,
        { headers: await getAuthHeaders() },
      );
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || '조회 실패');
      setItems(d.items || []);
      setTotalAtRisk(d.totalAtRisk ?? 0);
      setProcessedAt(d.processedAt || null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '데이터를 불러오지 못했습니다');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  const enqueueOne = async (cusCode: string) => {
    setQueueing(true);
    setToast('');
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/customers/churn-queue', {
        method: 'POST',
        headers,
        body: JSON.stringify({ storeId, cusCode }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || '큐 등록 실패');
      setToast(`알림톡 큐 등록 완료 (${d.created}건)`);
    } catch (e: unknown) {
      setToast(e instanceof Error ? e.message : '큐 등록 실패');
    } finally {
      setQueueing(false);
    }
  };

  const enqueueAll = async () => {
    if (!items.length) return;
    setBulkQueueing(true);
    setToast('');
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/customers/churn-queue', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          storeId,
          cusCodes: items.map(i => i.cusCode),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || '일괄 큐 등록 실패');
      setToast(`일괄 등록: ${d.created}건 생성, ${d.skipped}건 스킵`);
    } catch (e: unknown) {
      setToast(e instanceof Error ? e.message : '일괄 큐 등록 실패');
    } finally {
      setBulkQueueing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-6">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/customers"
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-white flex items-center gap-2">
              <UserX className="w-5 h-5 text-rose-400" />
              고객 이탈 위험
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              이탈 스코어 {CHURN_RISK_THRESHOLD}점 이상 — 매일 자정 자동 갱신
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-300 hover:bg-slate-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            새로고침
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
            <p className="text-[10px] text-slate-500">이탈 위험 고객</p>
            <p className="text-2xl font-bold text-rose-400">{totalAtRisk.toLocaleString()}</p>
          </div>
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
            <p className="text-[10px] text-slate-500">기준 점수</p>
            <p className="text-2xl font-bold text-amber-400">{CHURN_RISK_THRESHOLD}+</p>
          </div>
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 col-span-2">
            <p className="text-[10px] text-slate-500">마지막 스코어 갱신</p>
            <p className="text-sm text-slate-300 mt-1">
              {processedAt
                ? new Date(processedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
                : '— (cron 실행 후 표시)'}
            </p>
          </div>
        </div>

        {toast && (
          <p className="text-xs text-teal-300 bg-teal-950/30 border border-teal-800/40 rounded-lg px-3 py-2">
            {toast}
          </p>
        )}

        {error && (
          <p className="text-xs text-rose-400 bg-rose-950/30 border border-rose-800/40 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-500">
            스코어 = 방문주기 초과(40) + 방문빈도 감소(30) + 구매금액 감소(20) + 쿠폰 미사용(10)
          </p>
          {items.length > 0 && (
            <button
              type="button"
              onClick={enqueueAll}
              disabled={bulkQueueing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-900/40 border border-teal-700/50 text-xs text-teal-300 hover:bg-teal-900/60 disabled:opacity-50"
            >
              {bulkQueueing
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Send className="w-3.5 h-3.5" />}
              전체 알림톡 큐 등록
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-teal-400" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-slate-600" />
            <p>이탈 위험 고객이 없습니다.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-800 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-900 text-slate-500 text-left">
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">고객</th>
                  <th className="px-3 py-2 font-medium">스코어</th>
                  <th className="px-3 py-2 font-medium hidden md:table-cell">방문패턴</th>
                  <th className="px-3 py-2 font-medium hidden md:table-cell">미방문</th>
                  <th className="px-3 py-2 font-medium hidden lg:table-cell">등급</th>
                  <th className="px-3 py-2 font-medium">액션</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row, idx) => (
                  <tr
                    key={row.cusCode}
                    className="border-t border-slate-800/80 hover:bg-slate-900/50 cursor-pointer"
                    onClick={() => setSelected(selected?.cusCode === row.cusCode ? null : row)}
                  >
                    <td className="px-3 py-2.5 text-slate-600">{idx + 1}</td>
                    <td className="px-3 py-2.5">
                      <Link
                        href={`/dashboard/customers?cusCode=${encodeURIComponent(row.cusCode)}`}
                        className="text-slate-200 hover:text-teal-300"
                        onClick={e => e.stopPropagation()}
                      >
                        {row.name}
                      </Link>
                      <p className="text-[10px] text-slate-500">{row.cusCode}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-block px-2 py-0.5 rounded border font-bold tabular-nums ${scoreBadge(row.churnScore)}`}>
                        {row.churnScore}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 hidden md:table-cell text-slate-400">
                      {VISIT_TREND_LABELS[row.visitTrend] || row.visitTrend}
                    </td>
                    <td className="px-3 py-2.5 hidden md:table-cell text-slate-400">
                      {row.daysSinceLastVisit != null ? `${row.daysSinceLastVisit}일` : '—'}
                    </td>
                    <td className="px-3 py-2.5 hidden lg:table-cell text-slate-400">
                      {row.pitayaGrade || '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); enqueueOne(row.cusCode); }}
                        disabled={queueing}
                        className="flex items-center gap-1 px-2 py-1 rounded bg-teal-950/40 text-teal-400 hover:bg-teal-900/50 disabled:opacity-40"
                      >
                        <Send className="w-3 h-3" />
                        큐
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {selected && (
          <div className="rounded-xl bg-slate-900 border border-slate-800 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-white">
              {selected.name} — 스코어 상세 ({selected.churnScore}점)
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {FACTOR_LABELS.map(f => {
                const val = selected.factors[f.key] ?? 0;
                const pct = Math.round((val / f.max) * 100);
                return (
                  <div key={f.key} className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                    <p className="text-[10px] text-slate-500">{f.label}</p>
                    <p className="text-lg font-bold text-slate-200">{val}<span className="text-xs text-slate-500">/{f.max}</span></p>
                    <div className="mt-1 h-1 rounded bg-slate-700 overflow-hidden">
                      <div className="h-full bg-teal-500/70" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-slate-500">
              최근 방문: {selected.lastVisitDate || '—'}
              {selected.avgCycleDays != null && ` · 평균 주기 ${selected.avgCycleDays}일`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
