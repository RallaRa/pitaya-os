'use client';

import { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import HrSystemShell from '@/components/hr-system/HrSystemShell';
import { useStore } from '@/context/StoreContext';
import { getAuthHeaders } from '@/lib/getAuthHeaders';
import type { PayrollSettings } from '@/lib/hr-system/types';
import { DEFAULT_PAYROLL_SETTINGS } from '@/lib/hr-system/types';

export default function PayrollSettingsPage() {
  const { currentStore } = useStore();
  const [settings, setSettings] = useState<PayrollSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!currentStore?.storeId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(
          `/api/hr-system/payroll/settings?storeId=${encodeURIComponent(currentStore.storeId)}`,
          { headers },
        );
        const data = await res.json();
        if (!cancelled) setSettings(data.settings);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [currentStore?.storeId]);

  const updateInsurance = (key: keyof PayrollSettings['insurance'], value: number) => {
    setSettings(prev => prev ? {
      ...prev,
      insurance: { ...prev.insurance, [key]: value },
    } : prev);
  };

  const updateTax = (key: keyof PayrollSettings['tax'], value: number) => {
    setSettings(prev => prev ? {
      ...prev,
      tax: { ...prev.tax, [key]: value },
    } : prev);
  };

  const handleSave = async () => {
    if (!currentStore?.storeId || !settings) return;
    setSaving(true);
    setMessage('');
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/hr-system/payroll/settings', {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '저장 실패');
      setSettings(data.settings);
      setMessage('저장되었습니다.');
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : '오류');
    } finally {
      setSaving(false);
    }
  };

  const ins = settings?.insurance || DEFAULT_PAYROLL_SETTINGS.insurance;
  const tax = settings?.tax || DEFAULT_PAYROLL_SETTINGS.tax;

  return (
    <HrSystemShell
      actions={(
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          저장
        </button>
      )}
    >
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-cyan-400" /></div>
      ) : (
        <div className="space-y-6 max-w-3xl">
          {message && (
            <p className="text-xs text-cyan-300 bg-cyan-950/40 border border-cyan-800/40 rounded-lg px-3 py-2">{message}</p>
          )}

          <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <h2 className="text-sm font-semibold text-slate-100 mb-3">기본 설정</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-xs text-slate-400">
                기본 지급일
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={settings?.payDayDefault ?? 25}
                  onChange={e => setSettings(prev => prev ? { ...prev, payDayDefault: Number(e.target.value) } : prev)}
                  className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="text-xs text-slate-400">
                회계연도 시작월
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={settings?.fiscalYearStart ?? 1}
                  onChange={e => setSettings(prev => prev ? { ...prev, fiscalYearStart: Number(e.target.value) } : prev)}
                  className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white"
                />
              </label>
            </div>
          </section>

          <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <h2 className="text-sm font-semibold text-slate-100 mb-3">4대보험 요율 (%)</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-400">
              {([
                ['nationalPensionEmployee', '국민연금(근로자)'],
                ['nationalPensionEmployer', '국민연금(사업주)'],
                ['healthInsuranceEmployee', '건강보험(근로자)'],
                ['healthInsuranceEmployer', '건강보험(사업주)'],
                ['longTermCareRate', '장기요양(건강보험 대비)'],
                ['employmentInsuranceEmployee', '고용보험(근로자)'],
                ['employmentInsuranceEmployer', '고용보험(사업주)'],
                ['industrialAccidentEmployer', '산재보험(사업주)'],
              ] as const).map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    type="number"
                    step="0.0001"
                    value={((ins[key] || 0) * 100).toFixed(4)}
                    onChange={e => updateInsurance(key, Number(e.target.value) / 100)}
                    className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white"
                  />
                </label>
              ))}
              <label>
                국민연금 상한 (원)
                <input
                  type="number"
                  value={ins.pensionCap}
                  onChange={e => updateInsurance('pensionCap', Number(e.target.value))}
                  className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white"
                />
              </label>
            </div>
          </section>

          <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <h2 className="text-sm font-semibold text-slate-100 mb-3">세금 설정</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-400">
              <label>
                원천징수율 (%)
                <input
                  type="number"
                  step="0.1"
                  value={((tax.defaultWithholdingRate || 0) * 100).toFixed(1)}
                  onChange={e => updateTax('defaultWithholdingRate', Number(e.target.value) / 100)}
                  className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white"
                />
              </label>
              <label>
                지방소득세 비율 (소득세 대비 %)
                <input
                  type="number"
                  step="1"
                  value={((tax.localTaxRate || 0) * 100).toFixed(0)}
                  onChange={e => updateTax('localTaxRate', Number(e.target.value) / 100)}
                  className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white"
                />
              </label>
              <label>
                비과세 식대 한도 (원)
                <input
                  type="number"
                  value={tax.mealTaxFreeLimit}
                  onChange={e => updateTax('mealTaxFreeLimit', Number(e.target.value))}
                  className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white"
                />
              </label>
            </div>
          </section>
        </div>
      )}
    </HrSystemShell>
  );
}
