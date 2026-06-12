'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Target, Settings, CheckCircle2 } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { getAuthHeaders } from '@/lib/getAuthHeaders';
import { formatManwonShort } from '@/lib/breakEvenCalc';

interface BreakEvenData {
  date: string;
  fixedCostsTotal: number;
  variableCostRatio: number;
  marginRate: number;
  monthlyBep: number;
  businessDays: number;
  todayBepTarget: number;
  todayNetSales: number;
  progressPct: number;
  remainingAmount: number;
  achieved: boolean;
  monthKey: string;
  costs: { rent: number; labor: number; admin: number; other: number };
}

export default function BreakEvenAnalyticsPage() {
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';

  const [data, setData] = useState<BreakEvenData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!storeId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/dashboard/break-even?storeId=${encodeURIComponent(storeId)}`, {
        headers: await getAuthHeaders(),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || '조회 실패');
      setData(d);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '불러오기 실패');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="min-h-full bg-slate-950 text-slate-200 p-4 md:p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="p-2 rounded-lg hover:bg-slate-800 text-slate-400">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <Target className="w-5 h-5 text-teal-400" />
              실시간 손익분기
            </h1>
            <p className="text-xs text-slate-500">{data?.date || '오늘'} 기준</p>
          </div>
        </div>
        <Link
          href="/dashboard/settings/fixed-costs"
          className="text-xs text-teal-400 hover:text-teal-300 flex items-center gap-1"
        >
          <Settings className="w-3.5 h-3.5" /> 고정비 설정
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-teal-400" /></div>
      ) : error ? (
        <p className="text-red-400 text-sm">{error}</p>
      ) : data ? (
        <div className="space-y-4">
          <div className={`rounded-xl border p-5 ${data.achieved ? 'border-teal-500/40 bg-teal-950/20' : 'border-slate-800 bg-slate-900/50'}`}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-slate-400">오늘 BEP 달성률</p>
              {data.achieved && (
                <span className="text-xs text-teal-400 flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" /> 달성
                </span>
              )}
            </div>
            <p className={`text-3xl font-bold tabular-nums ${data.achieved ? 'text-teal-400' : 'text-slate-200'}`}>
              {data.progressPct.toFixed(1)}%
            </p>
            <div className="h-3 rounded-full bg-slate-800 mt-3 overflow-hidden">
              <div
                className={`h-full rounded-full ${data.achieved ? 'bg-teal-500' : 'bg-slate-500'}`}
                style={{ width: `${Math.min(100, data.progressPct)}%` }}
              />
            </div>
            {!data.achieved && data.remainingAmount > 0 && (
              <p className="text-sm text-amber-400/90 mt-2">
                BEP까지 {formatManwonShort(data.remainingAmount)} 남음
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: '오늘 목표', value: formatManwonShort(data.todayBepTarget) },
              { label: '오늘 매출', value: formatManwonShort(data.todayNetSales) },
              { label: '월 BEP', value: formatManwonShort(data.monthlyBep) },
              { label: '영업일', value: `${data.businessDays}일` },
            ].map(row => (
              <div key={row.label} className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
                <p className="text-[10px] text-slate-500">{row.label}</p>
                <p className="text-sm font-medium tabular-nums mt-1">{row.value}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <h2 className="text-sm font-medium mb-3">계산 근거</h2>
            <dl className="grid grid-cols-2 gap-2 text-[11px]">
              <div><dt className="text-slate-500">월 고정비</dt><dd className="tabular-nums">{data.fixedCostsTotal.toLocaleString()}원</dd></div>
              <div><dt className="text-slate-500">변동 원가율</dt><dd>{(data.variableCostRatio * 100).toFixed(1)}%</dd></div>
              <div><dt className="text-slate-500">공헌이익률</dt><dd>{(data.marginRate * 100).toFixed(1)}%</dd></div>
              <div><dt className="text-slate-500">공식</dt><dd className="text-slate-400">고정비 ÷ (1 − 원가율)</dd></div>
            </dl>
            <div className="mt-3 pt-3 border-t border-slate-800 grid grid-cols-2 gap-2 text-[11px]">
              <div><span className="text-slate-500">임대 </span>{data.costs.rent.toLocaleString()}원</div>
              <div><span className="text-slate-500">인건비 </span>{data.costs.labor.toLocaleString()}원</div>
              <div><span className="text-slate-500">관리비 </span>{data.costs.admin.toLocaleString()}원</div>
              <div><span className="text-slate-500">기타 </span>{data.costs.other.toLocaleString()}원</div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
