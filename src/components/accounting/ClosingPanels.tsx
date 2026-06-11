'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Lock, Unlock } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import AccountingShell from '@/components/accounting/AccountingShell';
import AccountingDateFilters from '@/components/accounting/AccountingDateFilters';
import { currentPeriod, currentYear, monthStartYMD, todayYMD } from '@/components/accounting/accountingDateUtils';
import { VOUCHER_TYPE_LABELS, type AccountType } from '@/lib/accounting/types';

type LedgerRow = {
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  openingDebit: number;
  openingCredit: number;
  periodDebit: number;
  periodCredit: number;
  balance: number;
};

export function MonthlyClosingPanel() {
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';
  const [periods, setPeriods] = useState<Array<{ period: string; closed: boolean }>>([]);
  const [period, setPeriod] = useState(currentPeriod());
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch(`/api/accounting/periods?storeId=${encodeURIComponent(storeId)}&year=${currentYear()}`, { headers });
      const data = await res.json();
      setPeriods(data.periods || []);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  const toggle = async (closed: boolean) => {
    if (!storeId || processing) return;
    setProcessing(true);
    setMsg('');
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/accounting/periods', {
        method: closed ? 'POST' : 'PATCH',
        headers,
        body: JSON.stringify({ storeId, period, closed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '처리 실패');
      setMsg(closed ? `${period} 월마감 완료` : `${period} 마감 해제`);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '처리 실패');
    } finally {
      setProcessing(false);
    }
  };

  const months = Array.from({ length: 12 }, (_, i) => `${currentYear()}-${String(i + 1).padStart(2, '0')}`);

  return (
    <AccountingShell
      actions={(
        <div className="flex gap-2">
          <button type="button" disabled={processing} onClick={() => toggle(true)} className="text-xs px-2.5 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-600 text-white inline-flex items-center gap-1 disabled:opacity-40">
            <Lock className="w-3.5 h-3.5" /> 마감
          </button>
          <button type="button" disabled={processing} onClick={() => toggle(false)} className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 inline-flex items-center gap-1 disabled:opacity-40">
            <Unlock className="w-3.5 h-3.5" /> 해제
          </button>
        </div>
      )}
    >
      <label className="text-[10px] text-slate-500 block mb-4">
        대상 월
        <select value={period} onChange={e => setPeriod(e.target.value)} className="block mt-1 px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white">
          {months.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </label>
      {msg && <p className="text-xs text-teal-300 mb-3">{msg}</p>}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-teal-400" /></div>
      ) : (
        <div className="border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-800/80 text-slate-400">
              <tr>
                <th className="text-left px-3 py-2">회계월</th>
                <th className="text-center px-3 py-2">상태</th>
              </tr>
            </thead>
            <tbody>
              {months.map(m => {
                const row = periods.find(p => p.period === m);
                const closed = row?.closed === true;
                return (
                  <tr key={m} className="border-t border-slate-800/80">
                    <td className="px-3 py-2 text-slate-300">{m}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={closed ? 'text-amber-400' : 'text-teal-400'}>{closed ? '마감' : '진행중'}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AccountingShell>
  );
}

export function TrialBalancePanel() {
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [totals, setTotals] = useState({ totalDebit: 0, totalCredit: 0, balanced: false });
  const [endDate, setEndDate] = useState(todayYMD());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const headers = await getAuthJsonHeaders();
      const params = new URLSearchParams({ storeId, type: 'trial-balance', endDate });
      const res = await fetch(`/api/accounting/closing?${params}`, { headers });
      const data = await res.json();
      setRows(data.rows || []);
      setTotals({ totalDebit: data.totalDebit || 0, totalCredit: data.totalCredit || 0, balanced: !!data.balanced });
    } finally {
      setLoading(false);
    }
  }, [storeId, endDate]);

  useEffect(() => { load(); }, [load]);

  return (
    <AccountingShell>
      <AccountingDateFilters endDate={endDate} onEndDateChange={setEndDate} />
      <p className={`text-xs mb-3 ${totals.balanced ? 'text-teal-400' : 'text-red-400'}`}>
        차변합계 {totals.totalDebit.toLocaleString()} / 대변합계 {totals.totalCredit.toLocaleString()}
        {totals.balanced ? ' · 균형' : ' · 불균형'}
      </p>
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-teal-400" /></div>
      ) : (
        <div className="border border-slate-800 rounded-xl overflow-x-auto">
          <table className="w-full text-xs min-w-[760px]">
            <thead className="bg-slate-800/80 text-slate-400">
              <tr>
                <th className="text-left px-3 py-2">계정</th>
                <th className="text-right px-3 py-2">차변</th>
                <th className="text-right px-3 py-2">대변</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const debit = row.openingDebit + row.periodDebit;
                const credit = row.openingCredit + row.periodCredit;
                return (
                  <tr key={row.accountCode} className="border-t border-slate-800/80">
                    <td className="px-3 py-2 text-slate-200">{row.accountCode} · {row.accountName}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{debit ? debit.toLocaleString() : ''}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{credit ? credit.toLocaleString() : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AccountingShell>
  );
}

export function BalanceSheetPanel() {
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';
  const [data, setData] = useState<{
    asset: LedgerRow[];
    liability: LedgerRow[];
    equity: LedgerRow[];
    totalAssets: number;
    totalLiabilities: number;
    totalEquity: number;
  } | null>(null);
  const [asOf, setAsOf] = useState(todayYMD());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const headers = await getAuthJsonHeaders();
      const params = new URLSearchParams({ storeId, type: 'balance-sheet', asOf });
      const res = await fetch(`/api/accounting/closing?${params}`, { headers });
      setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [storeId, asOf]);

  useEffect(() => { load(); }, [load]);

  const Section = ({ title, rows, total }: { title: string; rows: LedgerRow[]; total: number }) => (
    <div className="mb-4">
      <h3 className="text-sm font-semibold text-slate-200 mb-2">{title}</h3>
      <div className="border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-xs">
          <tbody>
            {rows.map(r => (
              <tr key={r.accountCode} className="border-t border-slate-800/80 first:border-t-0">
                <td className="px-3 py-2 text-slate-300">{r.accountCode} · {r.accountName}</td>
                <td className="px-3 py-2 text-right tabular-nums text-teal-300">{r.balance.toLocaleString()}</td>
              </tr>
            ))}
            <tr className="border-t border-slate-700 bg-slate-900/80">
              <td className="px-3 py-2 font-semibold text-slate-200">소계</td>
              <td className="px-3 py-2 text-right tabular-nums font-semibold text-teal-300">{total.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <AccountingShell>
      <AccountingDateFilters asOf={asOf} onAsOfChange={setAsOf} showAsOf />
      {loading || !data ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-teal-400" /></div>
      ) : (
        <>
          <Section title="자산" rows={data.asset} total={data.totalAssets} />
          <Section title="부채" rows={data.liability} total={data.totalLiabilities} />
          <Section title="자본" rows={data.equity} total={data.totalEquity} />
          <p className="text-xs text-slate-400">
            부채+자본 { (data.totalLiabilities + data.totalEquity).toLocaleString() }
          </p>
        </>
      )}
    </AccountingShell>
  );
}

export function IncomeStatementPanel() {
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';
  const [data, setData] = useState<{
    revenue: LedgerRow[];
    expense: LedgerRow[];
    totalRevenue: number;
    totalExpense: number;
    netIncome: number;
  } | null>(null);
  const [startDate, setStartDate] = useState(monthStartYMD());
  const [endDate, setEndDate] = useState(todayYMD());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const headers = await getAuthJsonHeaders();
      const params = new URLSearchParams({ storeId, type: 'income-statement', startDate, endDate });
      const res = await fetch(`/api/accounting/closing?${params}`, { headers });
      setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [storeId, startDate, endDate]);

  useEffect(() => { load(); }, [load]);

  const Section = ({ title, rows, total }: { title: string; rows: LedgerRow[]; total: number }) => (
    <div className="mb-4">
      <h3 className="text-sm font-semibold text-slate-200 mb-2">{title}</h3>
      <div className="border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-xs">
          <tbody>
            {rows.map(r => (
              <tr key={r.accountCode} className="border-t border-slate-800/80 first:border-t-0">
                <td className="px-3 py-2 text-slate-300">{r.accountCode} · {r.accountName}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.balance.toLocaleString()}</td>
              </tr>
            ))}
            <tr className="border-t border-slate-700 bg-slate-900/80">
              <td className="px-3 py-2 font-semibold text-slate-200">소계</td>
              <td className="px-3 py-2 text-right tabular-nums font-semibold">{total.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <AccountingShell>
      <AccountingDateFilters startDate={startDate} endDate={endDate} onStartDateChange={setStartDate} onEndDateChange={setEndDate} />
      {loading || !data ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-teal-400" /></div>
      ) : (
        <>
          <Section title="수익" rows={data.revenue} total={data.totalRevenue} />
          <Section title="비용" rows={data.expense} total={data.totalExpense} />
          <p className="text-sm text-teal-300 font-semibold">당기순이익 {data.netIncome.toLocaleString()}원</p>
        </>
      )}
    </AccountingShell>
  );
}

export function VoucherTypesPanel() {
  return (
    <AccountingShell>
      <p className="text-xs text-slate-500 mb-4">Pitaya 회계에서 사용하는 표준 전표유형입니다.</p>
      <div className="border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-slate-800/80 text-slate-400">
            <tr>
              <th className="text-left px-3 py-2">코드</th>
              <th className="text-left px-3 py-2">명칭</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(VOUCHER_TYPE_LABELS).map(([code, label]) => (
              <tr key={code} className="border-t border-slate-800/80">
                <td className="px-3 py-2 font-mono text-slate-300">{code}</td>
                <td className="px-3 py-2 text-slate-200">{label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AccountingShell>
  );
}

export function FundBalancesPanel() {
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [asOf, setAsOf] = useState(todayYMD());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const headers = await getAuthJsonHeaders();
      const params = new URLSearchParams({ storeId, type: 'balances', asOf });
      const res = await fetch(`/api/accounting/fund?${params}`, { headers });
      const data = await res.json();
      setRows(data.rows || []);
    } finally {
      setLoading(false);
    }
  }, [storeId, asOf]);

  useEffect(() => { load(); }, [load]);

  return (
    <AccountingShell>
      <AccountingDateFilters asOf={asOf} onAsOfChange={setAsOf} showAsOf />
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-teal-400" /></div>
      ) : (
        <div className="border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-800/80 text-slate-400">
              <tr>
                <th className="text-left px-3 py-2">계정</th>
                <th className="text-right px-3 py-2">잔액</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.accountCode} className="border-t border-slate-800/80">
                  <td className="px-3 py-2 text-slate-200">{r.accountCode} · {r.accountName}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-teal-300">{r.balance.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AccountingShell>
  );
}

export function PaymentSchedulePanel() {
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!storeId) return;
    (async () => {
      setLoading(true);
      try {
        const headers = await getAuthJsonHeaders();
        const res = await fetch(`/api/accounting/fund?storeId=${encodeURIComponent(storeId)}&type=payment-schedule`, { headers });
        const data = await res.json();
        setRows(data.rows || []);
      } finally {
        setLoading(false);
      }
    })();
  }, [storeId]);

  return (
    <AccountingShell>
      <p className="text-xs text-slate-500 mb-3">매입일 +30일 기준 지급예정 (향후 60일)</p>
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-teal-400" /></div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-12">지급예정 내역이 없습니다.</p>
      ) : (
        <div className="border border-slate-800 rounded-xl overflow-x-auto">
          <table className="w-full text-xs min-w-[760px]">
            <thead className="bg-slate-800/80 text-slate-400">
              <tr>
                <th className="text-left px-3 py-2">지급예정일</th>
                <th className="text-left px-3 py-2">거래처</th>
                <th className="text-left px-3 py-2">매입일</th>
                <th className="text-right px-3 py-2">금액</th>
                <th className="text-center px-3 py-2">전표</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-slate-800/80">
                  <td className="px-3 py-2 text-amber-300">{String(r.dueDate)}</td>
                  <td className="px-3 py-2 text-slate-200">{String(r.supplierName || '—')}</td>
                  <td className="px-3 py-2 text-slate-400">{String(r.purchaseDate)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-teal-300">{Number(r.totalAmount || 0).toLocaleString()}</td>
                  <td className="px-3 py-2 text-center text-slate-400">{String(r.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AccountingShell>
  );
}
