'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import AccountingShell from '@/components/accounting/AccountingShell';

export default function AccountingSettingsPage() {
  const { currentStore } = useStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [businessNumber, setBusinessNumber] = useState('');
  const [fiscalYearStart, setFiscalYearStart] = useState(1);
  const [voucherApprovalRequired, setVoucherApprovalRequired] = useState(true);
  const [autoVoucherFromPurchase, setAutoVoucherFromPurchase] = useState(false);
  const [autoVoucherFromSales, setAutoVoucherFromSales] = useState(false);
  const [erpCompanyCode, setErpCompanyCode] = useState('1000');
  const [erpBusinessPlaceCode, setErpBusinessPlaceCode] = useState('1000');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    if (!currentStore?.storeId) return;
    setLoading(true);
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch(
        `/api/accounting/settings?storeId=${encodeURIComponent(currentStore.storeId)}`,
        { headers },
      );
      const data = await res.json();
      const s = data.settings || {};
      setCompanyName(s.companyName || currentStore.storeName || '');
      setBusinessNumber(s.businessNumber || '');
      setFiscalYearStart(s.fiscalYearStart ?? 1);
      setVoucherApprovalRequired(s.voucherApprovalRequired !== false);
      setAutoVoucherFromPurchase(!!s.autoVoucherFromPurchase);
      setAutoVoucherFromSales(!!s.autoVoucherFromSales);
      setErpCompanyCode(s.erpCompanyCode || '1000');
      setErpBusinessPlaceCode(s.erpBusinessPlaceCode || '1000');
    } finally {
      setLoading(false);
    }
  }, [currentStore?.storeId, currentStore?.storeName]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!currentStore?.storeId) return;
    setSaving(true);
    setMsg('');
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/accounting/settings', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          storeId: currentStore.storeId,
          companyName,
          businessNumber,
          fiscalYearStart,
          voucherApprovalRequired,
          autoVoucherFromPurchase,
          autoVoucherFromSales,
          erpCompanyCode,
          erpBusinessPlaceCode,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '저장 실패');
      setMsg('저장되었습니다.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AccountingShell>
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-teal-400" /></div>
      </AccountingShell>
    );
  }

  return (
    <AccountingShell
      actions={(
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="text-xs px-2.5 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-600 text-white inline-flex items-center gap-1 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          저장
        </button>
      )}
    >
      <div className="max-w-lg space-y-4">
        <div>
          <label className="text-[10px] text-slate-500">회사명(결산주체)</label>
          <input
            value={companyName}
            onChange={e => setCompanyName(e.target.value)}
            className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100"
          />
        </div>
        <div>
          <label className="text-[10px] text-slate-500">사업자등록번호</label>
          <input
            value={businessNumber}
            onChange={e => setBusinessNumber(e.target.value)}
            className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100"
          />
        </div>
        <div>
          <label className="text-[10px] text-slate-500">회계연도 시작월</label>
          <select
            value={fiscalYearStart}
            onChange={e => setFiscalYearStart(parseInt(e.target.value, 10))}
            className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100"
          >
            {[...Array(12)].map((_, i) => (
              <option key={i + 1} value={i + 1}>{i + 1}월</option>
            ))}
          </select>
        </div>
        <div className="pt-2 border-t border-slate-800">
          <p className="text-xs font-semibold text-slate-400 mb-3">ERP 전표 연동</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-slate-500">회사코드 (더존)</label>
              <input
                value={erpCompanyCode}
                onChange={e => setErpCompanyCode(e.target.value)}
                placeholder="1000"
                className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500">사업장코드 (영림원·더존)</label>
              <input
                value={erpBusinessPlaceCode}
                onChange={e => setErpBusinessPlaceCode(e.target.value)}
                placeholder="1000"
                className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100"
              />
            </div>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={voucherApprovalRequired}
            onChange={e => setVoucherApprovalRequired(e.target.checked)}
            className="rounded border-slate-600"
          />
          전표 승인 후 장부 반영 (영림원 전표승인)
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={autoVoucherFromPurchase}
            onChange={e => setAutoVoucherFromPurchase(e.target.checked)}
            className="rounded border-slate-600"
          />
          Pitaya 매입 저장 시 자동전표처리 대기열 등록 (자동전표처리 메뉴에서 승인)
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={autoVoucherFromSales}
            onChange={e => setAutoVoucherFromSales(e.target.checked)}
            className="rounded border-slate-600"
          />
          POS 일마감 시 매출전표 자동 생성 (예정)
        </label>
        {msg && <p className="text-xs text-teal-300">{msg}</p>}
      </div>
    </AccountingShell>
  );
}
