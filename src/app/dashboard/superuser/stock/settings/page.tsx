'use client';

import { useEffect, useState } from 'react';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';

export default function StockSettingsPage() {
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    void (async () => {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/stock/settings', { headers });
      if (res.ok) {
        const json = await res.json();
        setSettings(json.settings);
      }
    })();
  }, []);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    const headers = await getAuthJsonHeaders();
    const res = await fetch('/api/stock/settings', {
      method: 'PUT',
      headers,
      body: JSON.stringify(settings),
    });
    setSaving(false);
    setMsg(res.ok ? '저장됨' : '실패');
  };

  if (!settings) return <p className="p-6 text-slate-400 text-sm">로딩…</p>;

  return (
    <div className="p-4 sm:p-6 max-w-xl mx-auto space-y-4">
      <h1 className="text-lg font-bold text-white">설정</h1>
      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input
          type="checkbox"
          checked={!!settings.masterEnabled}
          onChange={e => setSettings({ ...settings, masterEnabled: e.target.checked })}
        />
        AI 자동매매 마스터 스위치
      </label>
      <label className="block text-sm text-slate-400">
        최대 투자금 (원)
        <input
          type="number"
          value={Number(settings.maxInvestAmount) || 0}
          onChange={e => setSettings({ ...settings, maxInvestAmount: Number(e.target.value) })}
          className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-white"
        />
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input
          type="checkbox"
          checked={!!settings.paperMode}
          onChange={e => setSettings({ ...settings, paperMode: e.target.checked })}
        />
        모의투자 모드 (실주문 대신 Firestore 가상 체결)
      </label>
      <label className="block text-sm text-slate-400">
        1회 최대 주문금 (원)
        <input
          type="number"
          value={Number(settings.maxOrderAmount) || 0}
          onChange={e => setSettings({ ...settings, maxOrderAmount: Number(e.target.value) })}
          className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-white"
        />
      </label>
      <label className="block text-sm text-slate-400">
        손절 기준 (%)
        <input
          type="number"
          value={Number(settings.stopLossPct) || 7}
          onChange={e => setSettings({ ...settings, stopLossPct: Number(e.target.value) })}
          className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-white"
        />
      </label>
      <label className="block text-sm text-slate-400">
        MDD 한도 (%)
        <input
          type="number"
          value={Number(settings.mddLimitPct) || 20}
          onChange={e => setSettings({ ...settings, mddLimitPct: Number(e.target.value) })}
          className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-white"
        />
      </label>
      <button type="button" onClick={() => void save()} disabled={saving} className="px-4 py-2 rounded-lg bg-teal-700 text-white text-sm">
        저장
      </button>
      {msg && <p className="text-teal-400 text-sm">{msg}</p>}
      <p className="text-xs text-slate-500">Pitaya env: STOCK_TRADER_API_URL, STOCK_TRADER_API_TOKEN, GEMINI_API_KEY</p>
    </div>
  );
}
