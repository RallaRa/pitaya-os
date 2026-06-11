'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckSquare, Loader2, Square, FileCheck } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import VoucherPatternEditor from '@/components/accounting/VoucherPatternEditor';
import {
  DEFAULT_SALES_VOUCHER_PATTERN,
  resolveSalesAmounts,
} from '@/lib/accounting/salesVoucherPattern';
import type { AutoVoucherPattern } from '@/lib/accounting/autoVoucherPattern';
import { SALES_AMOUNT_KEYS } from '@/lib/accounting/autoVoucherPattern';

interface SalesRow {
  id: string;
  reportDate: string;
  netSales: number;
  totalSales: number;
  cashSale: number;
  cardSale: number;
  customerCount: number;
  supplyAmount: number;
  taxAmount: number;
  source: string;
  accountingVoucherId: string;
  accountingVoucherNo: string;
  accountingVoucherStatus: string;
}

interface Props {
  onActionsChange?: (actions: React.ReactNode) => void;
}

function monthStartYMD() {
  const d = new Date(Date.now() + 9 * 3600_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function todayYMD() {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}

export default function SalesVoucherIntegrationPanel({ onActionsChange }: Props) {
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';

  const [rows, setRows] = useState<SalesRow[]>([]);
  const [pattern, setPattern] = useState<AutoVoucherPattern>(DEFAULT_SALES_VOUCHER_PATTERN);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [startDate, setStartDate] = useState(monthStartYMD());
  const [endDate, setEndDate] = useState(todayYMD());
  const [linked, setLinked] = useState<'pending' | 'done' | 'all'>('pending');
  const [savePattern, setSavePattern] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    setMsg('');
    try {
      const headers = await getAuthJsonHeaders();
      const params = new URLSearchParams({ storeId, startDate, endDate, linked });
      const res = await fetch(`/api/accounting/integration/sales?${params}`, { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '조회 실패');
      setRows(data.sales || []);
      if (data.pattern) setPattern(data.pattern);
      setSelected(new Set());
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '조회 실패');
    } finally {
      setLoading(false);
    }
  }, [storeId, startDate, endDate, linked]);

  useEffect(() => { load(); }, [load]);

  const pendingRows = useMemo(
    () => rows.filter(r => !r.accountingVoucherId),
    [rows],
  );

  const toggleAll = () => {
    if (selected.size === pendingRows.length && pendingRows.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(pendingRows.map(r => r.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const processSelected = useCallback(async () => {
    if (!storeId || selected.size === 0 || processing) return;
    setProcessing(true);
    setMsg('');
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/accounting/integration/sales', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          storeId,
          salesIds: [...selected],
          pattern,
          savePattern,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '전표 처리 실패');
      setMsg(`${data.processed}건 전표 생성${data.failed ? ` · ${data.failed}건 실패` : ''}`);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '전표 처리 실패');
    } finally {
      setProcessing(false);
    }
  }, [storeId, selected, processing, pattern, savePattern, load]);

  useEffect(() => {
    onActionsChange?.(
      <button
        type="button"
        disabled={processing || selected.size === 0}
        onClick={processSelected}
        className="text-xs px-2.5 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-600 text-white inline-flex items-center gap-1 disabled:opacity-40"
      >
        {processing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileCheck className="w-3.5 h-3.5" />}
        선택 전표처리 ({selected.size})
      </button>,
    );
  }, [onActionsChange, processing, selected.size, processSelected]);

  const previewRow = (row: SalesRow) => {
    const amounts = resolveSalesAmounts({
      id: row.id,
      reportDate: row.reportDate,
      netSales: row.netSales,
      totalSales: row.totalSales,
      cashSale: row.cashSale,
      cardSale: row.cardSale,
      customerCount: row.customerCount,
    });
    return pattern.lines
      .filter(l => !pattern.splitVat ? l.amountKey !== 'tax' : true)
      .map(l => {
        const amt = l.amountKey === 'supply'
          ? amounts.supply
          : l.amountKey === 'tax'
            ? amounts.tax
            : l.amountKey === 'cash'
              ? amounts.cash || (amounts.card ? 0 : amounts.total)
              : l.amountKey === 'card'
                ? amounts.card
                : amounts.total;
        if (!amt) return null;
        return `${l.side === 'debit' ? '차' : '대'} ${l.accountName} ${amt.toLocaleString()}`;
      })
      .filter(Boolean)
      .join(' · ');
  };

  return (
    <>
      <VoucherPatternEditor
        title="매출 전표 분개 패턴"
        pattern={pattern}
        amountKeys={SALES_AMOUNT_KEYS}
        savePattern={savePattern}
        onPatternChange={setPattern}
        onSavePatternChange={setSavePattern}
      />

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <label className="text-[10px] text-slate-500">
          시작일
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="block mt-1 px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white" />
        </label>
        <label className="text-[10px] text-slate-500">
          종료일
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="block mt-1 px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white" />
        </label>
        <label className="text-[10px] text-slate-500">
          상태
          <select value={linked} onChange={e => setLinked(e.target.value as typeof linked)} className="block mt-1 px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white">
            <option value="pending">미전표</option>
            <option value="done">전표완료</option>
            <option value="all">전체</option>
          </select>
        </label>
      </div>

      {msg && <p className="text-xs text-teal-300 mb-3">{msg}</p>}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-teal-400" /></div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-12">매출 일보 대상이 없습니다.</p>
      ) : (
        <div className="border border-slate-800 rounded-xl overflow-x-auto">
          <table className="w-full text-xs min-w-[960px]">
            <thead className="bg-slate-800/80 text-slate-400">
              <tr>
                <th className="px-3 py-2 w-10">
                  {linked !== 'done' && (
                    <button type="button" onClick={toggleAll} className="text-slate-400 hover:text-teal-400" title="전체 선택">
                      {selected.size === pendingRows.length && pendingRows.length > 0
                        ? <CheckSquare className="w-4 h-4" />
                        : <Square className="w-4 h-4" />}
                    </button>
                  )}
                </th>
                <th className="text-left px-3 py-2">매출일</th>
                <th className="text-right px-3 py-2">순매출</th>
                <th className="text-right px-3 py-2">현금</th>
                <th className="text-right px-3 py-2">카드</th>
                <th className="text-right px-3 py-2">객수</th>
                <th className="text-left px-3 py-2">출처</th>
                <th className="text-left px-3 py-2">분개 미리보기</th>
                <th className="text-center px-3 py-2">회계전표</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const isLinked = !!row.accountingVoucherId;
                const preview = previewRow(row);

                return (
                  <tr key={row.id} className={`border-t border-slate-800/80 ${isLinked ? 'opacity-70' : ''}`}>
                    <td className="px-3 py-2">
                      {!isLinked && (
                        <button type="button" onClick={() => toggleOne(row.id)} className="text-slate-400 hover:text-teal-400">
                          {selected.has(row.id) ? <CheckSquare className="w-4 h-4 text-teal-400" /> : <Square className="w-4 h-4" />}
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-300">{row.reportDate}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-teal-300 font-medium">{row.netSales.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-300">{row.cashSale.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-300">{row.cardSale.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-400">{row.customerCount || '—'}</td>
                    <td className="px-3 py-2 text-slate-500">{row.source || '—'}</td>
                    <td className="px-3 py-2 text-slate-500 text-[10px] max-w-[220px] truncate" title={preview}>{preview || '—'}</td>
                    <td className="px-3 py-2 text-center">
                      {isLinked ? (
                        <span className="text-teal-400 font-mono text-[10px]">{row.accountingVoucherNo}</span>
                      ) : (
                        <span className="text-slate-600">미처리</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
