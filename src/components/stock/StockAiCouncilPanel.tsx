'use client';

import { useCallback, useEffect, useState } from 'react';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';

interface ProviderStatus {
  id: string;
  label: string;
  weight: number;
  errorRate: number;
  state: 'ok' | 'error' | 'excluded' | 'disabled';
}

interface DecisionRow {
  id: string;
  ticker?: string;
  name?: string;
  signal?: string;
  timestamp?: string;
  finalDecision?: string;
  geminiVote?: string | null;
  claudeVote?: string | null;
  gpt4oVote?: string | null;
  groqVote?: string | null;
  confidence?: number;
}

interface EngineInfo {
  heartbeatAt?: string;
  autoTrade?: boolean;
  marketOpen?: boolean;
  networkOnline?: boolean;
  pausedForPos?: boolean;
  regime?: string;
}

function voteIcon(vote?: string | null) {
  if (vote === 'approve') return '🟢';
  if (vote === 'reject') return '🔴';
  return '⚫';
}

function stateDot(state: ProviderStatus['state']) {
  if (state === 'ok') return '🟢';
  if (state === 'error') return '🔴';
  if (state === 'excluded') return '⚫';
  return '⚪';
}

function heartbeatFresh(at?: string): boolean {
  if (!at) return false;
  return Date.now() - new Date(at).getTime() < 6 * 60 * 1000;
}

export default function StockAiCouncilPanel() {
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [decisions, setDecisions] = useState<DecisionRow[]>([]);
  const [engine, setEngine] = useState<EngineInfo | null>(null);

  const load = useCallback(async () => {
    const headers = await getAuthJsonHeaders();
    const [councilRes, decRes] = await Promise.all([
      fetch('/api/stock/ai-council', { headers, cache: 'no-store' }),
      fetch('/api/stock/ai-decisions?limit=10', { headers, cache: 'no-store' }),
    ]);
    if (councilRes.ok) {
      const json = await councilRes.json();
      setProviders(json.providers || []);
      setEngine(json.engine || null);
    }
    if (decRes.ok) {
      const json = await decRes.json();
      setDecisions(json.decisions || []);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => { void load(); }, 15000);
    return () => clearInterval(id);
  }, [load]);

  const posLive = heartbeatFresh(engine?.heartbeatAt);

  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-300">AI 협력 판단</p>
        <div className="flex items-center gap-2 text-[10px]">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${
            posLive ? 'bg-teal-900/50 text-teal-300' : 'bg-red-900/40 text-red-300'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${posLive ? 'bg-teal-400 animate-pulse' : 'bg-red-500'}`} />
            POS {posLive ? 'LIVE' : 'OFF'}
          </span>
          {engine?.heartbeatAt && (
            <span className="text-slate-500">
              ♥ {new Date(engine.heartbeatAt).toLocaleString('ko-KR')}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3">
        {providers.map(p => (
          <div key={p.id} className="rounded-lg bg-slate-950/60 border border-slate-800 p-2 text-center">
            <p className="text-lg">{stateDot(p.state)}</p>
            <p className="text-[10px] text-slate-400 truncate">{p.label}</p>
            <p className="text-xs text-teal-400">{(p.weight * 100).toFixed(0)}%</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[10px] sm:text-xs text-left">
          <thead className="text-slate-500 border-t border-b border-slate-800">
            <tr>
              <th className="px-3 py-2">종목</th>
              <th className="px-2 py-2">G</th>
              <th className="px-2 py-2">C</th>
              <th className="px-2 py-2">4o</th>
              <th className="px-2 py-2">Q</th>
              <th className="px-3 py-2">결과</th>
            </tr>
          </thead>
          <tbody>
            {decisions.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-slate-500 text-center">
                  {posLive
                    ? '판단 이력 없음 — 장중 5분마다 신호 생성'
                    : 'POS 엔진 미연결 — PM2 기동 후 판단 시작'}
                </td>
              </tr>
            ) : (
              decisions.map(d => (
                <tr key={d.id} className="border-b border-slate-800/60 text-slate-300">
                  <td className="px-3 py-2 whitespace-nowrap">{d.name || d.ticker}</td>
                  <td className="px-2 py-2">{voteIcon(d.geminiVote)}</td>
                  <td className="px-2 py-2">{voteIcon(d.claudeVote)}</td>
                  <td className="px-2 py-2">{voteIcon(d.gpt4oVote)}</td>
                  <td className="px-2 py-2">{voteIcon(d.groqVote)}</td>
                  <td className="px-3 py-2">
                    {d.finalDecision === 'execute' ? (
                      <span className="text-teal-400">실행</span>
                    ) : (
                      <span className="text-amber-400">보류</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
