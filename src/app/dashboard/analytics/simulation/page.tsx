'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, SlidersHorizontal } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { getAuthHeaders } from '@/lib/getAuthHeaders';
import {
  PRESET_SCENARIOS,
  runProfitSimulation,
  formatManwonDetailed,
  type ScenarioKey,
  type SimulationBaseline,
  type SimulationResult,
} from '@/lib/profitSimulationCalc';

interface ApiPayload {
  baseline: SimulationBaseline;
  fixedCosts: { rent: number; labor: number; admin: number; other: number };
  scenarios: Record<ScenarioKey, SimulationResult & { label: string }>;
}

const SCENARIO_COLORS: Record<ScenarioKey, string> = {
  optimistic: 'text-teal-400 border-teal-500/40 bg-teal-950/30',
  base: 'text-slate-300 border-slate-600 bg-slate-900/50',
  pessimistic: 'text-red-400 border-red-500/40 bg-red-950/20',
};

function SliderRow({
  label, min, max, step, value, onChange, suffix,
}: {
  label: string; min: number; max: number; step: number;
  value: number; onChange: (v: number) => void; suffix: string;
}) {
  return (
    <label className="block space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <span className="text-teal-300 tabular-nums">{value > 0 ? '+' : ''}{value}{suffix}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-teal-500"
      />
    </label>
  );
}

function ScenarioCard({
  title, colorClass, result,
}: {
  title: string;
  colorClass: string;
  result: SimulationResult;
}) {
  return (
    <div className={`rounded-xl border p-4 space-y-2 ${colorClass}`}>
      <h3 className="font-semibold text-sm">{title}</h3>
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div>
          <p className="text-slate-500">예상 월 매출</p>
          <p className="font-medium tabular-nums">{formatManwonDetailed(result.monthlyRevenue)}</p>
        </div>
        <div>
          <p className="text-slate-500">예상 영업이익</p>
          <p className={`font-medium tabular-nums ${result.operatingProfit >= 0 ? '' : 'text-red-400'}`}>
            {formatManwonDetailed(result.operatingProfit)}
          </p>
        </div>
        <div>
          <p className="text-slate-500">월 손익분기점</p>
          <p className="font-medium tabular-nums">{formatManwonDetailed(result.monthlyBep)}</p>
        </div>
        <div>
          <p className="text-slate-500">BEP 달성일(추정)</p>
          <p className="font-medium tabular-nums">
            {result.bepDayOfMonth != null ? `${result.bepDayOfMonth}일` : '—'}
          </p>
        </div>
        <div className="col-span-2">
          <p className="text-slate-500">연말 예상 매출</p>
          <p className="font-medium tabular-nums">{formatManwonDetailed(result.yearEndRevenue)}</p>
        </div>
      </div>
    </div>
  );
}

export default function ProfitSimulationPage() {
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';

  const [baseline, setBaseline] = useState<SimulationBaseline | null>(null);
  const [fixedCostsTotal, setFixedCostsTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [revenueGrowth, setRevenueGrowth] = useState(0);
  const [costDelta, setCostDelta] = useState(0);
  const [fixedDelta, setFixedDelta] = useState(0);

  const load = useCallback(async () => {
    if (!storeId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `/api/dashboard/profit-simulation?storeId=${encodeURIComponent(storeId)}`,
        { headers: await getAuthHeaders() },
      );
      const d: ApiPayload = await res.json();
      if (!res.ok) throw new Error((d as { error?: string }).error || '조회 실패');
      setBaseline(d.baseline);
      setFixedCostsTotal(d.baseline.fixedCostsTotal);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '불러오기 실패');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  const customResult = useMemo(() => {
    if (!baseline) return null;
    return runProfitSimulation(baseline, {
      revenueGrowthPct: revenueGrowth,
      costRatioDeltaPct: costDelta,
      fixedCostDeltaPct: fixedDelta,
    });
  }, [baseline, revenueGrowth, costDelta, fixedDelta]);

  const presetResults = useMemo(() => {
    if (!baseline) return null;
    return (Object.keys(PRESET_SCENARIOS) as ScenarioKey[]).map(key => ({
      key,
      label: PRESET_SCENARIOS[key].label,
      result: runProfitSimulation(baseline, PRESET_SCENARIOS[key]),
    }));
  }, [baseline]);

  const applyPreset = (key: ScenarioKey) => {
    const p = PRESET_SCENARIOS[key];
    setRevenueGrowth(p.revenueGrowthPct);
    setCostDelta(p.costRatioDeltaPct);
    setFixedDelta(p.fixedCostDeltaPct);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-white flex items-center gap-2">
              <SlidersHorizontal className="w-5 h-5 text-teal-400" />
              손익 시뮬레이션
            </h1>
            <p className="text-xs text-slate-500">슬라이더 조정 → 3가지 시나리오 + 사용자 시나리오 실시간 계산</p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-teal-400" />
          </div>
        ) : error ? (
          <p className="text-rose-400 text-sm">{error}</p>
        ) : baseline && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                <p className="text-slate-500">기준 월매출</p>
                <p className="font-bold text-slate-200">{formatManwonDetailed(baseline.baseMonthlyRevenue)}</p>
              </div>
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                <p className="text-slate-500">원가율(추정)</p>
                <p className="font-bold">{(baseline.baseCostRatio * 100).toFixed(1)}%</p>
              </div>
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                <p className="text-slate-500">고정비/월</p>
                <p className="font-bold">{formatManwonDetailed(fixedCostsTotal)}</p>
              </div>
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                <p className="text-slate-500">기준</p>
                <p className="font-bold">{baseline.monthLabel}</p>
              </div>
            </div>

            <div className="rounded-xl bg-slate-900 border border-slate-800 p-4 space-y-4">
              <p className="text-sm font-medium text-slate-300">변수 조정</p>
              <SliderRow
                label="매출 성장률"
                min={-20}
                max={50}
                step={1}
                value={revenueGrowth}
                onChange={setRevenueGrowth}
                suffix="%"
              />
              <SliderRow
                label="원가율 변동"
                min={-10}
                max={10}
                step={0.5}
                value={costDelta}
                onChange={setCostDelta}
                suffix="%p"
              />
              <SliderRow
                label="고정비 변동"
                min={-20}
                max={20}
                step={1}
                value={fixedDelta}
                onChange={setFixedDelta}
                suffix="%"
              />
              <div className="flex flex-wrap gap-2 pt-1">
                {(Object.keys(PRESET_SCENARIOS) as ScenarioKey[]).map(key => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => applyPreset(key)}
                    className="px-2.5 py-1 rounded-lg text-[11px] border border-slate-700 text-slate-400 hover:text-teal-300"
                  >
                    {PRESET_SCENARIOS[key].label} 프리셋
                  </button>
                ))}
              </div>
            </div>

            {customResult && (
              <ScenarioCard
                title="▶ 사용자 시나리오 (슬라이더)"
                colorClass="text-teal-300 border-teal-600/50 bg-teal-950/20"
                result={customResult}
              />
            )}

            <div className="grid md:grid-cols-3 gap-3">
              {presetResults?.map(({ key, label, result }) => (
                <ScenarioCard
                  key={key}
                  title={label}
                  colorClass={SCENARIO_COLORS[key]}
                  result={result}
                />
              ))}
            </div>

            <p className="text-[10px] text-slate-600">
              고정비는 store_settings.fixed_costs — 미설정 시 기본값(임대·인건비·관리·기타) 사용.
              손익분기점 = 고정비 ÷ (1 − 원가율).
            </p>
          </>
        )}
      </div>
    </div>
  );
}
