'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Cake, Loader2, Save, Check, Info } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import type { BirthdayCampaignSettings } from '@/lib/birthdaySettings';

export default function BirthdayCampaignSettingsPage() {
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';

  const [settings, setSettings] = useState<BirthdayCampaignSettings>({
    enabled: true,
    couponType: 'fixed',
    couponValue: 5000,
    couponMinAmount: 30000,
    couponValidDays: 14,
    d3QueueEnabled: true,
    d0MessengerEnabled: true,
  });
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
      const res = await fetch(
        `/api/store/birthday-campaign?storeId=${encodeURIComponent(storeId)}`,
        { headers: await getAuthJsonHeaders() },
      );
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || '설정 불러오기 실패');
      setSettings(d.settings);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '불러오기 실패');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!storeId) return;
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      const res = await fetch('/api/store/birthday-campaign', {
        method: 'PUT',
        headers: await getAuthJsonHeaders(),
        body: JSON.stringify({ storeId, settings }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || '저장 실패');
      setSettings(d.settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-6">
      <div className="max-w-lg mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/settings"
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-lg font-bold text-white flex items-center gap-2">
              <Cake className="w-5 h-5 text-pink-400" />
              생일 마케팅
            </h1>
            <p className="text-xs text-slate-500">D-3 쿠폰 발급 · D-0 매장 알림</p>
          </div>
        </div>

        <div className="flex items-start gap-2 p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-slate-400">
          <Info className="w-4 h-4 shrink-0 text-teal-400 mt-0.5" />
          <p>
            매일 오전 9시 자동 실행됩니다. D-3에 생일 쿠폰을 발급하고 알림톡 큐에 등록하며,
            생일 당일(D-0)에는 💰 매출알림 채널로 직원에게 생일 고객 목록을 보냅니다.
          </p>
        </div>

        {error && (
          <p className="text-xs text-rose-400 bg-rose-950/30 border border-rose-800/40 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-7 h-7 animate-spin text-teal-400" />
          </div>
        ) : (
          <div className="space-y-4 rounded-xl bg-slate-900 border border-slate-800 p-4">
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm text-slate-300">생일 마케팅 활성화</span>
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={e => setSettings(s => ({ ...s, enabled: e.target.checked }))}
                className="rounded border-slate-600"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-[10px] text-slate-500">쿠폰 유형</span>
                <select
                  value={settings.couponType}
                  onChange={e => setSettings(s => ({
                    ...s,
                    couponType: e.target.value as 'fixed' | 'percent',
                  }))}
                  className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="fixed">정액 할인 (원)</option>
                  <option value="percent">정률 할인 (%)</option>
                </select>
              </label>
              <label className="block">
                <span className="text-[10px] text-slate-500">
                  할인 {settings.couponType === 'fixed' ? '금액 (원)' : '율 (%)'}
                </span>
                <input
                  type="number"
                  min={0}
                  value={settings.couponValue}
                  onChange={e => setSettings(s => ({ ...s, couponValue: Number(e.target.value) }))}
                  className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
                />
              </label>
            </div>

            <label className="block">
              <span className="text-[10px] text-slate-500">최소 주문 금액 (원)</span>
              <input
                type="number"
                min={0}
                value={settings.couponMinAmount}
                onChange={e => setSettings(s => ({ ...s, couponMinAmount: Number(e.target.value) }))}
                className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
              />
            </label>

            <label className="block">
              <span className="text-[10px] text-slate-500">쿠폰 유효 일수 (생일 기준)</span>
              <input
                type="number"
                min={1}
                max={90}
                value={settings.couponValidDays}
                onChange={e => setSettings(s => ({ ...s, couponValidDays: Number(e.target.value) }))}
                className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
              />
            </label>

            <label className="flex items-center justify-between gap-3 pt-2 border-t border-slate-800">
              <span className="text-sm text-slate-300">D-3 알림톡 큐 등록</span>
              <input
                type="checkbox"
                checked={settings.d3QueueEnabled}
                onChange={e => setSettings(s => ({ ...s, d3QueueEnabled: e.target.checked }))}
                className="rounded border-slate-600"
              />
            </label>

            <label className="flex items-center justify-between gap-3">
              <span className="text-sm text-slate-300">D-0 메신저 생일 목록</span>
              <input
                type="checkbox"
                checked={settings.d0MessengerEnabled}
                onChange={e => setSettings(s => ({ ...s, d0MessengerEnabled: e.target.checked }))}
                className="rounded border-slate-600"
              />
            </label>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={save}
                disabled={saving || !storeId}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-600 text-white text-sm disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                저장
              </button>
              {saved && (
                <span className="text-xs text-teal-400 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> 저장됨
                </span>
              )}
              <Link
                href="/dashboard/marketing/birthday"
                className="ml-auto text-xs text-slate-500 hover:text-teal-400"
              >
                캠페인 이력 →
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
