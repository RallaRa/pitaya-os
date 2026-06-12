'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useStockTraderApi } from '@/components/stock-trader/useStockTraderApi';

interface LogEntry {
  id: string;
  at: string;
  strategyName: string;
  action: string;
  detail: string;
}

export default function StockTraderLogsPage() {
  const { call, loading, error } = useStockTraderApi();
  const [logs, setLogs] = useState<LogEntry[]>([]);

  useEffect(() => {
    void call<{ logs: LogEntry[] }>('auto/logs')
      .then(r => setLogs(r.logs || []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-4">
      <h1 className="text-lg font-bold text-white">실행 로그</h1>
      {loading && logs.length === 0 && <Loader2 className="w-5 h-5 animate-spin text-slate-400" />}
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <div className="space-y-2">
        {logs.slice(0, 50).map(l => (
          <div key={l.id} className="rounded-lg border border-slate-700/60 bg-slate-900/40 px-3 py-2 text-xs">
            <p className="text-slate-300">
              <span className="text-slate-500">{l.at.slice(0, 19)}</span>
              {' · '}{l.strategyName} · <strong>{l.action}</strong>
            </p>
            <p className="text-slate-500 mt-1 truncate">{l.detail}</p>
          </div>
        ))}
        {!loading && logs.length === 0 && <p className="text-slate-500 text-sm">로그 없음</p>}
      </div>
    </div>
  );
}
