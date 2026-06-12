'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, BarChart3, Loader2, Save, Check, Info } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';

interface ItemTarget {
  id: string;
  name: string;
  masterTargetMargin: number;
  customTarget: number | null;
}

export default function MarginTargetsSettingsPage() {
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';

  const [globalTarget, setGlobalTarget] = useState(35);
  const [items, setItems] = useState<ItemTarget[]>([]);
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
      const [settingsRes, itemsRes] = await Promise.all([
        fetch(`/api/store/margin-targets?storeId=${encodeURIComponent(storeId)}`, {
          headers: await getAuthJsonHeaders(),
        }),
        fetch(`/api/items?storeId=${encodeURIComponent(storeId)}`, {
          headers: await getAuthJsonHeaders(),
        }),
      ]);
      const settingsData = await settingsRes.json();
      const itemsData = await itemsRes.json();
      if (!settingsRes.ok) throw new Error(settingsData.error || '설정 불러오기 실패');
      if (!itemsRes.ok) throw new Error(itemsData.error || '품목 불러오기 실패');

      const s = settingsData.settings || {};
      setGlobalTarget(Math.round((s.globalTargetMargin ?? 0.35) * 1000) / 10);
      const itemTargets = (s.itemTargets || {}) as Record<string, number>;

      setItems(
        (itemsData.items || []).map((it: { id: string; cut?: string; name?: string; targetMargin?: number }) => ({
          id: it.id,
          name: String(it.cut || it.name || '품목'),
          masterTargetMargin: Math.round((it.targetMargin ?? 0) * 1000) / 10,
          customTarget: itemTargets[it.id] != null
            ? Math.round(itemTargets[it.id] * 1000) / 10
            : null,
        })),
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '불러오기 실패');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  const setItemTarget = (id: string, value: string) => {
    const n = value === '' ? null : Number(value);
    setItems(prev => prev.map(it =>
      it.id === id ? { ...it, customTarget: n != null && !Number.isNaN(n) ? n : null } : it,
    ));
  };

  const save = async () => {
    if (!storeId) return;
    setSaving(true);
    setError('');
    try {
      const itemTargets: Record<string, number> = {};
      for (const it of items) {
        if (it.customTarget != null && it.customTarget > 0) {
          itemTargets[it.id] = it.customTarget / 100;
        }
      }
      const res = await fetch('/api/store/margin-targets', {
        method: 'PUT',
        headers: await getAuthJsonHeaders(),
        body: JSON.stringify({
          storeId,
          settings: {
            globalTargetMargin: globalTarget / 100,
            itemTargets,
          },
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || '저장 실패');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  if (!storeId) {
    return <div className="min-h-full bg-slate-950 p-6 text-slate-400 text-sm">매장을 선택해 주세요.</div>;
  }

  return (
    <div className="min-h-full bg-slate-950 text-slate-200">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/settings" className="p-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-400">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-lg font-bold flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-teal-400" />
              마진율 목표 설정
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">전체·품목별 목표 — 랭킹 달성률 계산</p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-teal-400" /></div>
        ) : (
          <>
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
              <label className="block">
                <span className="text-sm text-slate-300">매장 전체 목표 마진율 (%)</span>
                <input
                  type="number"
                  min={5}
                  max={90}
                  step={0.1}
                  value={globalTarget}
                  onChange={e => setGlobalTarget(Number(e.target.value) || 0)}
                  className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
                />
              </label>
              <p className="text-[10px] text-slate-600 flex items-center gap-1">
                <Info className="w-3 h-3" /> 개별 설정 없는 품목은 품목 마스터「목표마진%」→ 없으면 전체 목표 적용
              </p>
            </div>

            <div className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden">
              <p className="text-xs text-slate-500 px-4 py-2 border-b border-slate-800">품목별 개별 목표 (%)</p>
              <div className="max-h-96 overflow-y-auto divide-y divide-slate-800/60">
                {items.map(it => (
                  <div key={it.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span className="flex-1 text-slate-300 truncate">{it.name}</span>
                    <span className="text-[10px] text-slate-600 shrink-0">
                      마스터 {it.masterTargetMargin > 0 ? `${it.masterTargetMargin}%` : '—'}
                    </span>
                    <input
                      type="number"
                      min={5}
                      max={90}
                      step={0.1}
                      placeholder="—"
                      value={it.customTarget ?? ''}
                      onChange={e => setItemTarget(it.id, e.target.value)}
                      className="w-20 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-right"
                    />
                  </div>
                ))}
              </div>
            </div>

            {error && <p className="text-xs text-rose-400">{error}</p>}

            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-600 text-white text-sm disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              저장
              {saved && <Check className="w-4 h-4 text-teal-200" />}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
