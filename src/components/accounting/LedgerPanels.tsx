'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import AccountingShell from '@/components/accounting/AccountingShell';
import AccountingDateFilters from '@/components/accounting/AccountingDateFilters';
import { monthStartYMD, todayYMD } from '@/components/accounting/accountingDateUtils';
import { ACCOUNT_TYPE_LABELS, type AccountType } from '@/lib/accounting/types';

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

function LedgerSummaryTable({ rows, showType }: { rows: LedgerRow[]; showType?: boolean }) {
  return (
    <div className="border border-slate-800 rounded-xl overflow-x-auto">
      <table className="w-full text-xs min-w-[900px]">
        <thead className="bg-slate-800/80 text-slate-400">
          <tr>
            <th className="text-left px-3 py-2">계정코드</th>
            <th className="text-left px-3 py-2">계정명</th>
            {showType && <th className="text-left px-3 py-2">구분</th>}
            <th className="text-right px-3 py-2">전기차변</th>
            <th className="text-right px-3 py-2">전기대변</th>
            <th className="text-right px-3 py-2">당기차변</th>
            <th className="text-right px-3 py-2">당기대변</th>
            <th className="text-right px-3 py-2">잔액</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.accountCode} className="border-t border-slate-800/80">
              <td className="px-3 py-2 font-mono text-slate-300">{row.accountCode}</td>
              <td className="px-3 py-2 text-slate-200">{row.accountName}</td>
              {showType && <td className="px-3 py-2 text-slate-400">{ACCOUNT_TYPE_LABELS[row.accountType]}</td>}
              <td className="px-3 py-2 text-right tabular-nums">{row.openingDebit ? row.openingDebit.toLocaleString() : ''}</td>
              <td className="px-3 py-2 text-right tabular-nums">{row.openingCredit ? row.openingCredit.toLocaleString() : ''}</td>
              <td className="px-3 py-2 text-right tabular-nums">{row.periodDebit ? row.periodDebit.toLocaleString() : ''}</td>
              <td className="px-3 py-2 text-right tabular-nums">{row.periodCredit ? row.periodCredit.toLocaleString() : ''}</td>
              <td className="px-3 py-2 text-right tabular-nums text-teal-300">{row.balance.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function GeneralLedgerPanel() {
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(monthStartYMD());
  const [endDate, setEndDate] = useState(todayYMD());

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const headers = await getAuthJsonHeaders();
      const params = new URLSearchParams({ storeId, type: 'general', startDate, endDate });
      const res = await fetch(`/api/accounting/ledger?${params}`, { headers });
      const data = await res.json();
      setRows(data.rows || []);
    } finally {
      setLoading(false);
    }
  }, [storeId, startDate, endDate]);

  useEffect(() => { load(); }, [load]);

  return (
    <AccountingShell>
      <AccountingDateFilters startDate={startDate} endDate={endDate} onStartDateChange={setStartDate} onEndDateChange={setEndDate} />
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-teal-400" /></div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-12">집계 내역이 없습니다.</p>
      ) : (
        <LedgerSummaryTable rows={rows} />
      )}
    </AccountingShell>
  );
}

export function AccountBalancePanel() {
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [asOf, setAsOf] = useState(todayYMD());

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const headers = await getAuthJsonHeaders();
      const params = new URLSearchParams({ storeId, type: 'balance', asOf });
      const res = await fetch(`/api/accounting/ledger?${params}`, { headers });
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
        <LedgerSummaryTable rows={rows} showType />
      )}
    </AccountingShell>
  );
}

export function AccountLedgerPanel() {
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';
  const [accounts, setAccounts] = useState<Array<{ code: string; name: string }>>([]);
  const [accountCode, setAccountCode] = useState('');
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState(monthStartYMD());
  const [endDate, setEndDate] = useState(todayYMD());

  useEffect(() => {
    if (!storeId) return;
    (async () => {
      const headers = await getAuthJsonHeaders();
      const res = await fetch(`/api/accounting/accounts?storeId=${encodeURIComponent(storeId)}`, { headers });
      const data = await res.json();
      const list = (data.accounts || []).map((a: { code: string; name: string }) => ({ code: a.code, name: a.name }));
      setAccounts(list);
      if (list[0]) setAccountCode(list[0].code);
    })();
  }, [storeId]);

  const load = useCallback(async () => {
    if (!storeId || !accountCode) return;
    setLoading(true);
    try {
      const headers = await getAuthJsonHeaders();
      const params = new URLSearchParams({ storeId, type: 'by-account', accountCode, startDate, endDate });
      const res = await fetch(`/api/accounting/ledger?${params}`, { headers });
      const data = await res.json();
      setRows(data.rows || []);
      setBalance(Number(data.balance || 0));
    } finally {
      setLoading(false);
    }
  }, [storeId, accountCode, startDate, endDate]);

  useEffect(() => { load(); }, [load]);

  return (
    <AccountingShell>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <label className="text-[10px] text-slate-500">
          계정
          <select value={accountCode} onChange={e => setAccountCode(e.target.value)} className="block mt-1 px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white min-w-[180px]">
            {accounts.map(a => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}
          </select>
        </label>
        <AccountingDateFilters startDate={startDate} endDate={endDate} onStartDateChange={setStartDate} onEndDateChange={setEndDate} />
      </div>
      <p className="text-xs text-slate-400 mb-3">기말 잔액: <span className="text-teal-300 tabular-nums">{balance.toLocaleString()}</span></p>
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-teal-400" /></div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-12">거래 내역이 없습니다.</p>
      ) : (
        <div className="border border-slate-800 rounded-xl overflow-x-auto">
          <table className="w-full text-xs min-w-[900px]">
            <thead className="bg-slate-800/80 text-slate-400">
              <tr>
                <th className="text-left px-3 py-2">일자</th>
                <th className="text-left px-3 py-2">전표번호</th>
                <th className="text-left px-3 py-2">거래처</th>
                <th className="text-right px-3 py-2">차변</th>
                <th className="text-right px-3 py-2">대변</th>
                <th className="text-right px-3 py-2">잔액</th>
                <th className="text-left px-3 py-2">적요</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-t border-slate-800/80">
                  <td className="px-3 py-2 text-slate-300">{String(row.voucherDate)}</td>
                  <td className="px-3 py-2 font-mono text-teal-300/90">{String(row.voucherNo)}</td>
                  <td className="px-3 py-2 text-slate-400">{String(row.partnerName || '—')}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{Number(row.debit || 0) ? Number(row.debit).toLocaleString() : ''}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{Number(row.credit || 0) ? Number(row.credit).toLocaleString() : ''}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-200">{Number(row.balance || 0).toLocaleString()}</td>
                  <td className="px-3 py-2 text-slate-400 truncate max-w-[180px]">{String(row.memo || '—')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AccountingShell>
  );
}

export function PartnerLedgerPanel() {
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';
  const [partner, setPartner] = useState('');
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(monthStartYMD());
  const [endDate, setEndDate] = useState(todayYMD());

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const headers = await getAuthJsonHeaders();
      const params = new URLSearchParams({ storeId, type: 'by-partner', partner, startDate, endDate });
      const res = await fetch(`/api/accounting/ledger?${params}`, { headers });
      const data = await res.json();
      setRows(data.rows || []);
    } finally {
      setLoading(false);
    }
  }, [storeId, partner, startDate, endDate]);

  useEffect(() => { load(); }, [load]);

  return (
    <AccountingShell>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <label className="text-[10px] text-slate-500">
          거래처 검색
          <input value={partner} onChange={e => setPartner(e.target.value)} placeholder="거래처명" className="block mt-1 px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white min-w-[180px]" />
        </label>
        <AccountingDateFilters startDate={startDate} endDate={endDate} onStartDateChange={setStartDate} onEndDateChange={setEndDate} />
      </div>
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-teal-400" /></div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-12">거래처 원장 내역이 없습니다.</p>
      ) : (
        <div className="border border-slate-800 rounded-xl overflow-x-auto">
          <table className="w-full text-xs min-w-[900px]">
            <thead className="bg-slate-800/80 text-slate-400">
              <tr>
                <th className="text-left px-3 py-2">일자</th>
                <th className="text-left px-3 py-2">전표번호</th>
                <th className="text-left px-3 py-2">거래처</th>
                <th className="text-left px-3 py-2">계정</th>
                <th className="text-right px-3 py-2">차변</th>
                <th className="text-right px-3 py-2">대변</th>
                <th className="text-left px-3 py-2">적요</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-t border-slate-800/80">
                  <td className="px-3 py-2 text-slate-300">{String(row.voucherDate)}</td>
                  <td className="px-3 py-2 font-mono text-teal-300/90">{String(row.voucherNo)}</td>
                  <td className="px-3 py-2 text-slate-200">{String(row.partnerName)}</td>
                  <td className="px-3 py-2 text-slate-400">{String(row.accountCode)} {String(row.accountName)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{Number(row.debit || 0) ? Number(row.debit).toLocaleString() : ''}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{Number(row.credit || 0) ? Number(row.credit).toLocaleString() : ''}</td>
                  <td className="px-3 py-2 text-slate-400 truncate max-w-[180px]">{String(row.memo || '—')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AccountingShell>
  );
}
