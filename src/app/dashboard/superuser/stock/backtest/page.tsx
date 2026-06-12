'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';

export default function StockBacktestPage() {
  const [scores, setScores] = useState<Array<{ symbol: string; name: string; composite: number; buyProbability: number }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const headers = await getAuthJsonHeaders();
      const session = localStorage.getItem('pitaya_stock_session_id');
      if (session) headers['x-stock-session'] = session;
      const res = await fetch('/api/stock/scores', { headers });
      const data = await res.json();
      setScores((data.scores?.top20 as typeof scores) || data.top20 || []);
      setLoading(false);
    })();
  }, []);

  const avgScore = scores.length
    ? scores.reduce((s, r) => s + r.composite, 0) / scores.length
    : 0;
  const simReturn = scores.length
    ? scores.slice(0, 5).reduce((s, r) => s + (r.buyProbability - 0.5) * 20, 0) / 5
    : 0;

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-5 pb-24">
      <h1 className="text-lg font-bold text-white">백테스트 · 스코어 시뮬</h1>
      <p className="text-sm text-slate-400">
        최근 팩터 스코어 Top20 기준 간이 시뮬 (FDR 10년 백테스트는 추후 연동)
      </p>

      {loading ? (
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-4">
              <p className="text-xs text-slate-500">평균 복합 스코어</p>
              <p className="text-xl font-bold text-white">{avgScore.toFixed(1)}</p>
            </div>
            <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-4">
              <p className="text-xs text-slate-500">Top5 가상 수익률*</p>
              <p className={`text-xl font-bold ${simReturn >= 0 ? 'text-red-400' : 'text-blue-400'}`}>
                {simReturn >= 0 ? '+' : ''}{simReturn.toFixed(2)}%
              </p>
            </div>
          </div>
          <p className="text-[10px] text-slate-600">* buyProbability 기반 간이 추정, 실제 체결과 다를 수 있음</p>

          <div className="rounded-xl border border-slate-700/60 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 border-b border-slate-800">
                  <th className="text-left p-2">#</th>
                  <th className="text-left p-2">종목</th>
                  <th className="text-right p-2">스코어</th>
                  <th className="text-right p-2">매수확률</th>
                </tr>
              </thead>
              <tbody>
                {scores.map((r, i) => (
                  <tr key={r.symbol} className="border-b border-slate-800/50 text-slate-300">
                    <td className="p-2">{i + 1}</td>
                    <td className="p-2">{r.name}</td>
                    <td className="text-right p-2">{r.composite.toFixed(1)}</td>
                    <td className="text-right p-2">{(r.buyProbability * 100).toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {scores.length === 0 && (
              <p className="p-4 text-center text-slate-500 text-sm">스코어 없음 — AI 시장 스캔을 먼저 실행하세요</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
