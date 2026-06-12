'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, RefreshCw, Compass } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { getAuthHeaders, getAuthJsonHeaders } from '@/lib/getAuthHeaders';

interface Briefing {
  weekId: string;
  periodStart: string;
  periodEnd: string;
  summary: string;
  focusTasks: string[];
  inventoryAdvice: string[];
  marketingSuggestion: string;
  generatedAt: string;
}

export default function WeeklyCoachingPage() {
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!storeId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `/api/dashboard/weekly-coaching?storeId=${encodeURIComponent(storeId)}`,
        { headers: await getAuthHeaders() },
      );
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || '조회 실패');
      setBriefing(d.briefing || null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '불러오기 실패');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  const runNow = async () => {
    if (!storeId) return;
    setRunning(true);
    setError('');
    try {
      const res = await fetch('/api/dashboard/weekly-coaching', {
        method: 'POST',
        headers: await getAuthJsonHeaders(),
        body: JSON.stringify({ storeId }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || '생성 실패');
      setBriefing(d.briefing);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '생성 실패');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="min-h-full bg-slate-950 text-slate-200 p-4 md:p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="p-2 rounded-lg hover:bg-slate-800 text-slate-400">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <Compass className="w-5 h-5 text-teal-400" />
              AI 경영 코치
            </h1>
            <p className="text-xs text-slate-500">매주 월요일 08:00 KST 자동 브리핑</p>
          </div>
        </div>
        <button
          type="button"
          onClick={runNow}
          disabled={running || !storeId}
          className="text-xs flex items-center gap-1 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50"
        >
          {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          수동 실행
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-teal-400" /></div>
      ) : error ? (
        <p className="text-red-400 text-sm">{error}</p>
      ) : !briefing ? (
        <p className="text-slate-500 text-sm">아직 주간 브리핑이 없습니다. 수동 실행을 눌러 생성하세요.</p>
      ) : (
        <div className="space-y-4">
          <p className="text-[11px] text-slate-500">
            {briefing.periodStart} ~ {briefing.periodEnd} · {briefing.weekId}
          </p>

          <section className="rounded-xl border border-teal-500/30 bg-teal-950/20 p-4">
            <h2 className="text-sm font-medium text-teal-300 mb-2">지난 주 총평</h2>
            <p className="text-sm text-slate-200 leading-relaxed">{briefing.summary}</p>
          </section>

          <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <h2 className="text-sm font-medium mb-2">이번 주 집중 과제</h2>
            <ol className="list-decimal list-inside space-y-1 text-sm text-slate-300">
              {briefing.focusTasks.map(t => <li key={t}>{t}</li>)}
            </ol>
          </section>

          {briefing.inventoryAdvice?.length > 0 && (
            <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
              <h2 className="text-sm font-medium mb-2">재고·발주</h2>
              <ul className="space-y-1 text-sm text-slate-300">
                {briefing.inventoryAdvice.map(a => <li key={a}>· {a}</li>)}
              </ul>
            </section>
          )}

          {briefing.marketingSuggestion && (
            <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
              <h2 className="text-sm font-medium mb-2">마케팅 제안</h2>
              <p className="text-sm text-slate-300">{briefing.marketingSuggestion}</p>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
