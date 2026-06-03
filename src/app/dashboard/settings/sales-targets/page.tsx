'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Target, Loader2, Save, Plus, Trash2, Check, AlertTriangle, Info,
} from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import { getKSTTodayYMD } from '@/lib/dateUtils';
import {
  addMonthsYm,
  listMonthsInPeriod,
  monthBeforeYm,
  newPeriodId,
  type TargetPeriod,
} from '@/lib/salesTargets';

const DEFAULT_START = '2025-05';
const DEFAULT_END = '9999-12';

export default function SalesTargetsSettingsPage() {
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';
  const todayYm = getKSTTodayYMD().slice(0, 7);

  const [periods, setPeriods] = useState<TargetPeriod[]>([]);
  const [activePeriodId, setActivePeriodId] = useState<string>('default');
  const [previousPeriod, setPreviousPeriod] = useState<TargetPeriod | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!storeId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/dashboard/sales-targets?storeId=${encodeURIComponent(storeId)}`, {
        headers: await getAuthJsonHeaders(),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || '불러오기 실패');
      setPeriods(d.periods || []);
      if (d.activePeriod?.id) setActivePeriodId(d.activePeriod.id);
      setPreviousPeriod(d.previousPeriod || null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '목표 데이터를 불러오지 못했습니다');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  const activePeriod = useMemo(
    () => periods.find(p => p.id === activePeriodId) || periods[0],
    [periods, activePeriodId],
  );

  const monthRows = useMemo(() => {
    if (!activePeriod) return [];
    const viewStart =
      activePeriod.startYm > addMonthsYm(todayYm, -3)
        ? activePeriod.startYm
        : addMonthsYm(todayYm, -3);
    const viewEnd =
      activePeriod.endYm < addMonthsYm(todayYm, 11)
        ? activePeriod.endYm
        : addMonthsYm(todayYm, 11);
    return listMonthsInPeriod(viewStart, viewEnd);
  }, [activePeriod, todayYm]);

  const updatePeriod = (id: string, patch: Partial<TargetPeriod>) => {
    setPeriods(prev =>
      prev.map(p => (p.id === id ? { ...p, ...patch } : p)),
    );
  };

  const updateMonth = (ym: string, field: 'sales' | 'customers', value: number) => {
    if (!activePeriod) return;
    setPeriods(prev =>
      prev.map(p => {
        if (p.id !== activePeriod.id) return p;
        const months = { ...p.months };
        months[ym] = {
          sales: field === 'sales' ? value : months[ym]?.sales ?? 0,
          customers: field === 'customers' ? value : months[ym]?.customers ?? 0,
        };
        return { ...p, months };
      }),
    );
  };

  const addPeriod = () => {
    const newP: TargetPeriod = {
      id: newPeriodId(),
      startYm: '2027-01',
      endYm: DEFAULT_END,
      months: {},
    };
    const cap = monthBeforeYm(newP.startYm);
    setPeriods(prev => {
      const trimmed = prev.map(p =>
        p.endYm >= newP.startYm || p.endYm > cap ? { ...p, endYm: cap } : p,
      );
      return [...trimmed, newP];
    });
    setActivePeriodId(newP.id);
  };

  const removePeriod = (id: string) => {
    if (periods.length <= 1) return;
    setPeriods(prev => prev.filter(p => p.id !== id));
    if (activePeriodId === id) {
      setActivePeriodId(periods.find(p => p.id !== id)?.id || 'default');
    }
  };

  const save = async () => {
    if (!storeId) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/dashboard/sales-targets', {
        method: 'PUT',
        headers: await getAuthJsonHeaders(),
        body: JSON.stringify({ storeId, periods }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || '저장 실패');
      setPeriods(d.periods || periods);
      if (d.activePeriod?.id) setActivePeriodId(d.activePeriod.id);
      setPreviousPeriod(d.previousPeriod || null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  if (!storeId) {
    return (
      <div className="min-h-full bg-slate-950 p-6 text-slate-400 text-sm">
        매장을 먼저 선택해 주세요.
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-950 p-4 md:p-6 max-w-4xl mx-auto">
      <Link
        href="/dashboard/settings"
        className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-300 text-sm mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> 설정
      </Link>

      <div className="flex items-start gap-3 mb-6">
        <Target className="w-8 h-8 text-amber-400 shrink-0" />
        <div>
          <h1 className="text-xl font-bold text-slate-100">매출·객수 목표</h1>
          <p className="text-slate-500 text-sm mt-1">
            월별 <strong className="text-slate-400">순매출(원)</strong>·<strong className="text-slate-400">총객수(명)</strong> 목표.
            대시보드 「매출 목표」 주간·월간이 목표 대비로 표시됩니다.
          </p>
        </div>
      </div>

      <div className="mb-4 flex items-start gap-2 bg-blue-950/30 border border-blue-800/40 rounded-xl px-3 py-2.5 text-[11px] text-blue-200/90 leading-relaxed">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          <p>오늘({todayYm})이 속한 기간의 해당 월 목표가 적용됩니다.</p>
          <p className="mt-1 text-blue-300/70">
            실적은 매월 1일~오늘 기준 <strong>총객수</strong>·<strong>일평균 객수</strong>·<strong>순매출</strong>로 비교합니다.
          </p>
          <p className="mt-1 text-blue-300/70">
            새 기간(예: 2027-01~9999-12)을 추가하면 직전 기간 종료월이 자동으로 2026-12처럼 조정됩니다.
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 text-red-400 text-sm bg-red-950/30 border border-red-800/40 rounded-lg px-3 py-2">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 text-teal-400 animate-spin" />
        </div>
      ) : (
        <>
          {/* 기간 */}
          <section className="mb-6 bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-300">목표 적용 기간</h2>
              <button
                type="button"
                onClick={addPeriod}
                className="flex items-center gap-1 text-xs text-teal-400 hover:text-teal-300"
              >
                <Plus className="w-3.5 h-3.5" /> 기간 추가
              </button>
            </div>
            <div className="space-y-3">
              {periods.map(p => {
                const isActive = p.id === activePeriodId;
                const isCurrent = todayYm >= p.startYm && todayYm <= p.endYm;
                return (
                  <div
                    key={p.id}
                    className={`rounded-xl border p-3 ${isActive ? 'border-amber-500/50 bg-amber-950/20' : 'border-slate-800 bg-slate-800/30'}`}
                  >
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <button
                        type="button"
                        onClick={() => setActivePeriodId(p.id)}
                        className={`text-xs px-2 py-0.5 rounded ${isActive ? 'bg-amber-600/30 text-amber-200' : 'bg-slate-700 text-slate-400'}`}
                      >
                        {isActive ? '편집 중' : '선택'}
                      </button>
                      {isCurrent && (
                        <span className="text-[10px] text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded">
                          오늘 적용
                        </span>
                      )}
                      {periods.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removePeriod(p.id)}
                          className="ml-auto text-slate-600 hover:text-red-400"
                          aria-label="기간 삭제"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <label className="text-slate-500 text-xs">시작</label>
                      <input
                        type="month"
                        value={p.startYm}
                        onChange={e => updatePeriod(p.id, { startYm: e.target.value })}
                        className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-slate-200 text-xs"
                      />
                      <span className="text-slate-600">~</span>
                      <label className="text-slate-500 text-xs">종료</label>
                      <input
                        type="month"
                        value={p.endYm === '9999-12' ? '9999-12' : p.endYm}
                        onChange={e => updatePeriod(p.id, { endYm: e.target.value || DEFAULT_END })}
                        className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-slate-200 text-xs"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            {previousPeriod && (
              <p className="text-[10px] text-slate-500 mt-3">
                직전 기간(참고): {previousPeriod.startYm} ~ {previousPeriod.endYm}
              </p>
            )}
          </section>

          {/* 월별 목표 */}
          {activePeriod && (
            <section className="mb-6 bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
              <h2 className="text-sm font-semibold text-slate-300 mb-1">
                월별 목표 — {activePeriod.startYm} ~ {activePeriod.endYm}
              </h2>
              <p className="text-[10px] text-slate-500 mb-3">
                객수는 <strong className="text-slate-400">월 총객수</strong>로 입력 (화면에는 1일~오늘 총·일평균으로 표시)
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-500 border-b border-slate-800">
                      <th className="text-left py-2 pr-2">월</th>
                      <th className="text-right py-2 px-2">순매출 목표(원)</th>
                      <th className="text-right py-2 pl-2">총객수 목표(명)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthRows.map(ym => {
                      const m = activePeriod.months[ym] || { sales: 0, customers: 0 };
                      const isThisMonth = ym === todayYm;
                      return (
                        <tr
                          key={ym}
                          className={`border-b border-slate-800/60 ${isThisMonth ? 'bg-amber-950/15' : ''}`}
                        >
                          <td className="py-2 pr-2 text-slate-300 whitespace-nowrap">
                            {ym}
                            {isThisMonth && (
                              <span className="text-amber-400 ml-1">●</span>
                            )}
                          </td>
                          <td className="py-1 px-2">
                            <input
                              type="number"
                              min={0}
                              step={10000}
                              value={m.sales || ''}
                              placeholder="0"
                              onChange={e =>
                                updateMonth(ym, 'sales', Number(e.target.value) || 0)
                              }
                              className="w-full text-right bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200 tabular-nums"
                            />
                          </td>
                          <td className="py-1 pl-2">
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={m.customers || ''}
                              placeholder="0"
                              onChange={e =>
                                updateMonth(ym, 'customers', Number(e.target.value) || 0)
                              }
                              className="w-full text-right bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200 tabular-nums"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {monthRows.length === 0 && (
                <p className="text-slate-500 text-xs py-4 text-center">표시할 월이 없습니다.</p>
              )}
            </section>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white rounded-xl text-sm font-semibold"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : saved ? (
                <Check className="w-4 h-4" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {saved ? '저장됨' : '저장'}
            </button>
            <button
              type="button"
              onClick={() => {
                setPeriods([
                  {
                    id: 'default',
                    startYm: DEFAULT_START,
                    endYm: DEFAULT_END,
                    months: {},
                  },
                ]);
                setActivePeriodId('default');
              }}
              className="text-xs text-slate-500 hover:text-slate-300"
            >
              기본 기간으로 초기화 (2025-05 ~ 9999-12)
            </button>
          </div>
        </>
      )}
    </div>
  );
}
