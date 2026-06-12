'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useStockTraderApi } from '@/components/stock-trader/useStockTraderApi';

interface AiConfig {
  enabled: boolean;
  minConfidence: number;
  maxQtyPerOrder: number;
  maxOrdersPerRun: number;
  cooldownMinutes: number;
  riskProfile: string;
  goal: string;
  watchlist: Array<{ broker: string; symbol: string; note?: string }>;
}

export default function StockTraderAiPage() {
  const { call, loading, error } = useStockTraderApi();
  const [cfg, setCfg] = useState<AiConfig | null>(null);
  const [msg, setMsg] = useState('');
  const [analysis, setAnalysis] = useState<string>('');

  const load = async () => {
    const res = await call<{ config: AiConfig }>('ai/config');
    setCfg(res.config);
  };

  useEffect(() => { void load().catch(() => {}); }, []);

  const save = async () => {
    if (!cfg) return;
    await call('ai/config', {
      method: 'PUT',
      body: JSON.stringify({
        enabled: cfg.enabled,
        mode: 'ai',
        minConfidence: cfg.minConfidence,
        maxQtyPerOrder: cfg.maxQtyPerOrder,
        maxOrdersPerRun: cfg.maxOrdersPerRun,
        cooldownMinutes: cfg.cooldownMinutes,
        riskProfile: cfg.riskProfile,
        goal: cfg.goal,
      }),
    });
    setMsg('설정 저장됨');
  };

  const analyze = async () => {
    const res = await call<{ analysis: { summary: string; decisions: Array<{ symbol: string; action: string; reason: string }> } }>(
      'ai/analyze',
      { method: 'POST', body: '{}' },
    );
    setAnalysis(
      `${res.analysis.summary}\n\n` +
      res.analysis.decisions.map(d => `${d.symbol} ${d.action}: ${d.reason}`).join('\n'),
    );
    setMsg('분석 완료 (주문 없음)');
  };

  const runAi = async (dryRun: boolean) => {
    const res = await call<{ executed: number; skipped: number; analysis: { summary: string } }>(
      'ai/run',
      { method: 'POST', body: JSON.stringify({ dryRun }) },
    );
    setAnalysis(res.analysis.summary);
    setMsg(`${dryRun ? '시뮬' : '실행'}: 주문 ${res.executed}건, 스킵 ${res.skipped}건`);
  };

  if (!cfg) {
    return (
      <div className="flex justify-center py-16 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-5">
      <h1 className="text-lg font-bold text-white">AI 자동매매</h1>

      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input
          type="checkbox"
          checked={cfg.enabled}
          onChange={e => setCfg({ ...cfg, enabled: e.target.checked })}
        />
        AI 자동매매 활성
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-slate-400">
          최소 신뢰도
          <input
            type="number"
            step="0.01"
            min="0"
            max="1"
            value={cfg.minConfidence}
            onChange={e => setCfg({ ...cfg, minConfidence: Number(e.target.value) })}
            className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-white"
          />
        </label>
        <label className="text-sm text-slate-400">
          리스크
          <select
            value={cfg.riskProfile}
            onChange={e => setCfg({ ...cfg, riskProfile: e.target.value })}
            className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-white"
          >
            <option value="conservative">보수</option>
            <option value="balanced">균형</option>
            <option value="aggressive">공격</option>
          </select>
        </label>
      </div>

      <label className="block text-sm text-slate-400">
        투자 목표
        <textarea
          value={cfg.goal}
          onChange={e => setCfg({ ...cfg, goal: e.target.value })}
          rows={3}
          className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-white text-sm"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void save()} disabled={loading} className="px-4 py-2 rounded-lg bg-teal-700 text-white text-sm">
          저장
        </button>
        <button type="button" onClick={() => void analyze()} disabled={loading} className="px-4 py-2 rounded-lg bg-slate-700 text-white text-sm">
          AI 분석
        </button>
        <button type="button" onClick={() => void runAi(true)} disabled={loading} className="px-4 py-2 rounded-lg bg-slate-700 text-white text-sm">
          시뮬 실행
        </button>
        <button type="button" onClick={() => void runAi(false)} disabled={loading || !cfg.enabled} className="px-4 py-2 rounded-lg bg-amber-700 text-white text-sm">
          AI 매매 실행
        </button>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}
      {msg && <p className="text-teal-400 text-sm">{msg}</p>}
      {analysis && (
        <pre className="text-xs text-slate-300 bg-slate-900/80 border border-slate-700 rounded-xl p-4 whitespace-pre-wrap">{analysis}</pre>
      )}

      <div>
        <p className="text-xs text-slate-500 mb-2">관심 종목</p>
        <ul className="text-sm text-slate-400 space-y-1">
          {cfg.watchlist.map(w => (
            <li key={`${w.broker}:${w.symbol}`}>
              {w.broker.toUpperCase()} {w.symbol}{w.note ? ` — ${w.note}` : ''}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
