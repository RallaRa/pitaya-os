'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Power } from 'lucide-react';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';

interface Settings {
  masterEnabled: boolean;
  maxOrderAmount: number;
  maxInvestAmount: number;
  paperMode: boolean;
}

async function stockHeaders() {
  const headers = await getAuthJsonHeaders();
  const session = localStorage.getItem('pitaya_stock_session_id');
  if (session) headers['x-stock-session'] = session;
  return headers;
}

export default function StockTraderAiPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [analysis, setAnalysis] = useState('');

  const load = useCallback(async () => {
    const h = await stockHeaders();
    const res = await fetch('/api/stock/settings', { headers: h });
    const data = await res.json();
    if (res.ok) setSettings(data.settings);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const saveMaster = async (enabled: boolean) => {
    setLoading(true);
    try {
      const h = await stockHeaders();
      await fetch('/api/stock/master', { method: 'POST', headers: h, body: JSON.stringify({ enabled }) });
      await load();
      setMsg(enabled ? 'AI 자동매매 ON' : 'AI 자동매매 OFF');
    } finally {
      setLoading(false);
    }
  };

  const runScan = async (executeAfter: boolean) => {
    setLoading(true);
    setMsg('');
    try {
      const h = await stockHeaders();
      const scanRes = await fetch('/api/stock/scan', { method: 'POST', headers: h });
      const scanData = await scanRes.json();
      setAnalysis(JSON.stringify(scanData.analysis || scanData, null, 2));

      if (!scanRes.ok) {
        setMsg(scanData.errors?.join(' · ') || '스캔 일부 실패');
      } else {
        setMsg(`스캔 완료 · Top ${scanData.topPick?.name || '—'}`);
      }

      if (executeAfter && settings?.masterEnabled) {
        const execRes = await fetch('/api/stock/execute', {
          method: 'POST',
          headers: h,
          body: JSON.stringify({ dryRun: false }),
        });
        const execData = await execRes.json();
        setMsg(prev => `${prev} → ${execData.action || execData.message || '실행됨'}`);
      } else if (executeAfter) {
        setMsg(prev => `${prev} (마스터 OFF — 주문 스킵)`);
      }
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : '실행 실패');
    } finally {
      setLoading(false);
    }
  };

  if (!settings) {
    return (
      <div className="flex justify-center py-16 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-5 pb-24">
      <h1 className="text-lg font-bold text-white">AI 자동매매</h1>

      <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-4 flex items-center justify-between">
        <div>
          <p className="text-sm text-white font-medium">마스터 스위치</p>
          <p className="text-xs text-slate-500">스캔은 OFF 가능 · 주문만 ON 필요</p>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => void saveMaster(!settings.masterEnabled)}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold ${
            settings.masterEnabled ? 'bg-red-900/40 text-red-300 border border-red-500/40' : 'bg-teal-700 text-white'
          }`}
        >
          <Power className="w-4 h-4" />
          {settings.masterEnabled ? 'AI OFF' : 'AI ON'}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={loading} onClick={() => void runScan(false)} className="px-4 py-2 rounded-lg bg-teal-700 text-white text-sm">
          시장 스캔
        </button>
        <button type="button" disabled={loading} onClick={() => void runScan(true)} className="px-4 py-2 rounded-lg bg-amber-700 text-white text-sm">
          스캔 + 매매 실행
        </button>
      </div>

      {msg && <p className="text-teal-400 text-sm">{msg}</p>}
      {analysis && (
        <pre className="text-xs text-slate-300 bg-slate-900/80 border border-slate-700 rounded-xl p-4 overflow-x-auto whitespace-pre-wrap">{analysis}</pre>
      )}
    </div>
  );
}
