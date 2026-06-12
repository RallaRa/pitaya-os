'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';

interface JournalEntry {
  id: string;
  symbol: string;
  name: string;
  type: string;
  price: number;
  quantity: number;
  status: string;
  aiReason: string;
  executedAt: string;
  paper?: boolean;
}

export default function StockJournalPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [stats, setStats] = useState<{ totalTrades: number; winRate: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const headers = await getAuthJsonHeaders();
        const res = await fetch('/api/stock/journal', { headers });
        const json = await res.json();
        if (res.ok) {
          setEntries(json.entries || []);
          setStats(json.stats || null);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-teal-400" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
      <h1 className="text-lg font-bold text-white">매매 일지</h1>
      {stats && (
        <div className="grid grid-cols-2 gap-3 max-w-md">
          <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-3">
            <p className="text-[10px] text-slate-500">총 기록</p>
            <p className="text-white font-semibold">{stats.totalTrades}</p>
          </div>
          <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-3">
            <p className="text-[10px] text-slate-500">승률 (매도)</p>
            <p className="text-white font-semibold">{stats.winRate.toFixed(1)}%</p>
          </div>
        </div>
      )}
      <div className="rounded-xl border border-slate-700/60 overflow-hidden">
        <table className="w-full text-xs text-left">
          <thead className="text-slate-500 border-b border-slate-800 bg-slate-900/80">
            <tr>
              <th className="px-4 py-2">시간</th>
              <th className="px-4 py-2">종목</th>
              <th className="px-4 py-2">구분</th>
              <th className="px-4 py-2">가격</th>
              <th className="px-4 py-2">수량</th>
              <th className="px-4 py-2">AI 근거</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">매매 기록 없음</td></tr>
            ) : (
              entries.map(e => (
                <tr key={e.id} className="border-b border-slate-800/60 text-slate-300">
                  <td className="px-4 py-2 whitespace-nowrap">{new Date(e.executedAt).toLocaleString('ko-KR')}</td>
                  <td className="px-4 py-2">{e.name || e.symbol}</td>
                  <td className={`px-4 py-2 ${e.type === 'buy' ? 'text-teal-400' : 'text-amber-400'}`}>{e.type}</td>
                  <td className="px-4 py-2">{Number(e.price).toLocaleString()}</td>
                  <td className="px-4 py-2">{e.quantity}</td>
                  <td className="px-4 py-2 max-w-xs truncate" title={e.aiReason}>{e.aiReason}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
