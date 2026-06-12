'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, CircleDollarSign, Loader2, Save, Check, Info } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import { sumFixedCosts } from '@/lib/fixedCosts';

interface CostsForm {
  rent: number;
  labor: number;
  admin: number;
  other: number;
}

export default function FixedCostsSettingsPage() {
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';

  const [costs, setCosts] = useState<CostsForm>({ rent: 0, labor: 0, admin: 0, other: 0 });
  const [closedDaysText, setClosedDaysText] = useState('');
  const [businessDays, setBusinessDays] = useState<number | null>(null);
  const [monthKey, setMonthKey] = useState('');
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
      const res = await fetch(`/api/store/fixed-costs?storeId=${encodeURIComponent(storeId)}`, {
        headers: await getAuthJsonHeaders(),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || '불러오기 실패');
      setCosts(d.costs || {});
      setClosedDaysText((d.closedDays || []).join('\n'));
      setBusinessDays(d.breakEvenMeta?.businessDays ?? null);
      setMonthKey(d.breakEvenMeta?.monthKey || '');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '불러오기 실패');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  const setField = (key: keyof CostsForm, value: string) => {
    const n = Number(value.replace(/,/g, ''));
    setCosts(prev => ({ ...prev, [key]: Number.isFinite(n) ? n : 0 }));
  };

  const save = async () => {
    if (!storeId) return;
    setSaving(true);
    setError('');
    try {
      const closedDays = closedDaysText
        .split(/[\n,]+/)
        .map(s => s.trim())
        .filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s));

      const res = await fetch('/api/store/fixed-costs', {
        method: 'PUT',
        headers: await getAuthJsonHeaders(),
        body: JSON.stringify({ storeId, costs, closedDays }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || '저장 실패');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      setBusinessDays(d.breakEvenMeta?.businessDays ?? businessDays);
      setMonthKey(d.breakEvenMeta?.monthKey || monthKey);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const total = sumFixedCosts(costs);

  return (
    <div className="min-h-full bg-slate-950 text-slate-200 p-4 md:p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/settings" className="p-2 rounded-lg hover:bg-slate-800 text-slate-400">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <CircleDollarSign className="w-5 h-5 text-emerald-400" />
            고정비 · 손익분기
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            월 고정비 ÷ (1 − 원가율) = 월 BEP · 영업일로 나눈 일 목표
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-teal-400" /></div>
      ) : (
        <div className="space-y-4">
          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
            {(['rent', 'labor', 'admin', 'other'] as const).map(key => {
              const labels = { rent: '임대료', labor: '인건비', admin: '관리비', other: '기타 고정비' };
              return (
                <label key={key} className="block">
                  <span className="text-xs text-slate-400">{labels[key]}</span>
                  <input
                    type="number"
                    value={costs[key] || ''}
                    onChange={e => setField(key, e.target.value)}
                    className="mt-1 w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm tabular-nums"
                  />
                </label>
              );
            })}
            <p className="text-sm text-teal-400 pt-1">
              월 고정비 합계: <span className="font-semibold tabular-nums">{total.toLocaleString()}원</span>
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-2">
            <label className="block">
              <span className="text-xs text-slate-400">매장 추가 휴무일 (YYYY-MM-DD, 줄바꿈 구분)</span>
              <textarea
                value={closedDaysText}
                onChange={e => setClosedDaysText(e.target.value)}
                rows={3}
                placeholder="2026-06-15&#10;2026-06-22"
                className="mt-1 w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm font-mono"
              />
            </label>
            {businessDays != null && (
              <p className="text-[11px] text-slate-500 flex items-start gap-1">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                {monthKey || '당월'} 영업일 {businessDays}일 (공휴일·휴무일 제외, 매월 cron 갱신)
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={save}
            disabled={saving || !storeId}
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-sm font-medium"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saved ? '저장됨' : '저장'}
          </button>

          <Link
            href="/dashboard/analytics/break-even"
            className="block text-center text-xs text-teal-400 hover:text-teal-300"
          >
            손익분기 상세 대시보드 →
          </Link>
        </div>
      )}
    </div>
  );
}
