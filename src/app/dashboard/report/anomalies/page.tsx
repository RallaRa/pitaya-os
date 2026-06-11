'use client';

import { useState, useEffect, useCallback } from 'react';
import { useStore } from '@/context/StoreContext';
import { getAuthHeaders } from '@/lib/getAuthHeaders';
import { AlertTriangle, Loader2 } from 'lucide-react';

interface Log {
  id: string;
  date: string;
  type: string;
  todaySales: number;
  deviation: number;
  aiSummary?: string;
}

export default function AnomalyLogsPage() {
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/dashboard/anomaly-logs?storeId=${encodeURIComponent(storeId)}`, { headers });
    const data = await res.json();
    setLogs(data.logs || []);
    setLoading(false);
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-bold text-amber-400 mb-1 flex items-center gap-2">
        <AlertTriangle className="w-5 h-5" /> 매출 이상 탐지
      </h1>
      <p className="text-slate-500 text-sm mb-6">30일 평균 대비 ±2σ 이탈 기록</p>

      {loading ? (
        <Loader2 className="w-6 h-6 animate-spin text-teal-400" />
      ) : logs.length === 0 ? (
        <p className="text-slate-600 text-sm">탐지 기록이 없습니다.</p>
      ) : (
        <ul className="space-y-2">
          {logs.map(log => (
            <li key={log.id} className="bg-slate-900 border border-slate-700 rounded-xl p-4">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-white font-medium">{log.date}</span>
                <span className={log.type === 'drop' ? 'text-red-400' : 'text-teal-400'}>
                  {log.type === 'drop' ? '급감' : '급증'} · {log.deviation?.toFixed?.(1)}σ
                </span>
              </div>
              <p className="text-slate-400 text-xs">{log.aiSummary || `${log.todaySales?.toLocaleString()}원`}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
