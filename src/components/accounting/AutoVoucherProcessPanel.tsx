'use client';

import { useCallback, useEffect, useMemo, useState, Fragment } from 'react';
import Link from 'next/link';
import {
  Check, CheckSquare, ChevronDown, ChevronRight, Loader2, RefreshCw, Square, X, Zap,
} from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import AccountingShell from '@/components/accounting/AccountingShell';
import {
  AUTO_VOUCHER_QUEUE_STATUS_LABELS,
  type AccountingAutoVoucher,
  type AutoVoucherQueueStatus,
  type VoucherLine,
} from '@/lib/accounting/types';

function monthStartYMD() {
  const d = new Date(Date.now() + 9 * 3600_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function todayYMD() {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}

function formatLinesSummary(lines: VoucherLine[]) {
  return lines.map(l => {
    const side = l.debit > 0 ? '차' : '대';
    const amt = l.debit > 0 ? l.debit : l.credit;
    const partner = l.partnerName ? ` · ${l.partnerName}` : '';
    return `${side} ${l.accountCode} ${l.accountName || ''} ${amt.toLocaleString()}${partner}`;
  }).join(' / ');
}

export default function AutoVoucherProcessPanel() {
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';

  const [rows, setRows] = useState<AccountingAutoVoucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [startDate, setStartDate] = useState(monthStartYMD());
  const [endDate, setEndDate] = useState(todayYMD());
  const [status, setStatus] = useState<AutoVoucherQueueStatus | 'all'>('pending');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    setError('');
    try {
      const headers = await getAuthJsonHeaders();
      const params = new URLSearchParams({ storeId, status, startDate, endDate });
      const res = await fetch(`/api/accounting/auto-vouchers?${params}`, { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '조회 실패');
      setRows(data.autoVouchers || []);
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : '조회 실패');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [storeId, status, startDate, endDate]);

  useEffect(() => { load(); }, [load]);

  const pendingRows = useMemo(
    () => rows.filter(r => r.status === 'pending'),
    [rows],
  );

  const toggleAll = () => {
    if (selected.size === pendingRows.length && pendingRows.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(pendingRows.map(r => String(r.id))));
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

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const syncPending = async () => {
    if (!storeId || syncing) return;
    setSyncing(true);
    setMsg('');
    setError('');
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/accounting/auto-vouchers', {
        method: 'POST',
        headers,
        body: JSON.stringify({ storeId, action: 'sync_all', startDate, endDate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '동기화 실패');
      setMsg(
        `매입 ${data.purchases?.synced ?? 0}건 · 매출 ${data.sales?.synced ?? 0}건 대기열 등록`
        + (data.errors?.length ? ` (오류 ${data.errors.length}건)` : ''),
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '동기화 실패');
    } finally {
      setSyncing(false);
    }
  };

  const processSelected = async (action: 'approve' | 'reject') => {
    if (!storeId || selected.size === 0 || processing) return;
    if (action === 'reject' && !confirm(`선택 ${selected.size}건을 반려하시겠습니까?`)) return;
    if (action === 'approve' && !confirm(`선택 ${selected.size}건을 승인하여 회계전표로 반영하시겠습니까?`)) return;

    setProcessing(true);
    setMsg('');
    setError('');
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/accounting/auto-vouchers', {
        method: 'POST',
        headers,
        body: JSON.stringify({ storeId, action, ids: [...selected] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '처리 실패');
      setMsg(
        action === 'approve'
          ? `${data.processed}건 승인 · 회계전표 반영${data.failed ? ` (${data.failed}건 실패)` : ''}`
          : `${data.processed}건 반려${data.failed ? ` (${data.failed}건 실패)` : ''}`,
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '처리 실패');
    } finally {
      setProcessing(false);
    }
  };

  const actOne = async (id: string, action: 'approve' | 'reject') => {
    if (!storeId || processing) return;
    setProcessing(true);
    setMsg('');
    setError('');
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/accounting/auto-vouchers', {
        method: 'POST',
        headers,
        body: JSON.stringify({ storeId, action, ids: [id] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '처리 실패');
      const result = data.results?.[0];
      if (result?.ok && action === 'approve') {
        setMsg(`승인 완료 · 전표번호 ${result.voucherNo}`);
      } else if (result?.ok) {
        setMsg('반려되었습니다.');
      } else {
        throw new Error(result?.error || '처리 실패');
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '처리 실패');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <AccountingShell
      title="자동전표처리"
      description="매입입력 등 원천 화면에서 넘어온 분개를 검토·승인하면 회계전표로 반영됩니다."
      actions={(
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={load} className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 inline-flex items-center gap-1">
            <RefreshCw className="w-3.5 h-3.5" /> 조회
          </button>
          <button type="button" onClick={syncPending} disabled={syncing} className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 inline-flex items-center gap-1 disabled:opacity-40">
            {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
            미전표 가져오기
          </button>
          {status === 'pending' && (
            <>
              <button
                type="button"
                disabled={processing || selected.size === 0}
                onClick={() => processSelected('approve')}
                className="text-xs px-2.5 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-600 text-white inline-flex items-center gap-1 disabled:opacity-40"
              >
                {processing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                선택 승인 ({selected.size})
              </button>
              <button
                type="button"
                disabled={processing || selected.size === 0}
                onClick={() => processSelected('reject')}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-red-500/30 text-red-300 hover:bg-red-950/40 inline-flex items-center gap-1 disabled:opacity-40"
              >
                <X className="w-3.5 h-3.5" /> 선택 반려
              </button>
            </>
          )}
        </div>
      )}
    >
      <div className="mb-4 p-3 rounded-xl border border-slate-800 bg-slate-900/40 text-[11px] text-slate-400 leading-relaxed space-y-1">
        <p>
          <span className="text-teal-400 font-medium">매입입력</span> — 차변 <span className="text-slate-300">146 상품</span> · 135 부가세대급금 / 대변 251 외상매입금 (거래처 자동)
        </p>
        <p>
          <span className="text-teal-400 font-medium">일별매출집계</span> — 매일 KST 00:30 전일 매출 자동 등록 · 차변 <span className="text-slate-300">101 현금 / 103 보통예금(카드)</span> / 대변 401 상품매출 · 255 부가세예수금
        </p>
      </div>

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
          <select value={status} onChange={e => setStatus(e.target.value as typeof status)} className="block mt-1 px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white">
            <option value="pending">승인대기</option>
            <option value="approved">전표반영</option>
            <option value="rejected">반려</option>
            <option value="all">전체</option>
          </select>
        </label>
      </div>

      {(error || msg) && (
        <p className={`text-xs mb-3 px-3 py-2 rounded-lg border ${error ? 'text-red-300 bg-red-950/30 border-red-500/20' : 'text-teal-300 bg-teal-950/20 border-teal-500/20'}`}>
          {error || msg}
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-teal-400" /></div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-12">
          자동전표 대기 건이 없습니다.
          <br />
          <span className="text-xs text-slate-600">매입입력·일별매출집계에서 자동 등록되거나 「미전표 가져오기」를 사용하세요.</span>
        </p>
      ) : (
        <div className="border border-slate-800 rounded-xl overflow-x-auto">
          <table className="w-full text-xs min-w-[1100px]">
            <thead className="bg-slate-800/80 text-slate-400">
              <tr>
                <th className="px-2 py-2 w-8" />
                {status === 'pending' && (
                  <th className="px-2 py-2 w-10">
                    <button type="button" onClick={toggleAll} className="text-slate-400 hover:text-teal-400" title="전체 선택">
                      {selected.size === pendingRows.length && pendingRows.length > 0
                        ? <CheckSquare className="w-4 h-4" />
                        : <Square className="w-4 h-4" />}
                    </button>
                  </th>
                )}
                <th className="text-left px-3 py-2 whitespace-nowrap">출처</th>
                <th className="text-left px-3 py-2">전표일</th>
                <th className="text-left px-3 py-2">관리·결제</th>
                <th className="text-left px-3 py-2">적요</th>
                <th className="text-left px-3 py-2 min-w-[280px]">분개</th>
                <th className="text-right px-3 py-2">합계</th>
                <th className="text-center px-3 py-2">상태</th>
                <th className="text-center px-3 py-2">회계전표</th>
                {status === 'pending' && <th className="text-center px-3 py-2 w-20">처리</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const id = String(row.id);
                const isPending = row.status === 'pending';
                const partner = row.sourceType === 'sales'
                  ? [
                      row.sourceSummary?.cashSale ? `현금 ${Number(row.sourceSummary.cashSale).toLocaleString()}` : '',
                      row.sourceSummary?.cardSale ? `카드 ${Number(row.sourceSummary.cardSale).toLocaleString()}` : '',
                    ].filter(Boolean).join(' · ') || '—'
                  : row.lines.find(l => l.partnerName)?.partnerName
                    || row.sourceSummary?.supplierName
                    || '—';
                const isOpen = expanded.has(id);

                return (
                  <Fragment key={id}>
                    <tr className="border-t border-slate-800/80">
                      <td className="px-2 py-2">
                        <button type="button" onClick={() => toggleExpand(id)} className="text-slate-500 hover:text-teal-400">
                          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                      </td>
                      {status === 'pending' && (
                        <td className="px-2 py-2">
                          {isPending && (
                            <button type="button" onClick={() => toggleOne(id)} className="text-slate-400 hover:text-teal-400">
                              {selected.has(id) ? <CheckSquare className="w-4 h-4 text-teal-400" /> : <Square className="w-4 h-4" />}
                            </button>
                          )}
                        </td>
                      )}
                      <td className="px-3 py-2">
                        <span className="inline-flex px-2 py-0.5 rounded-full bg-teal-950/50 border border-teal-500/20 text-teal-300 font-medium whitespace-nowrap">
                          {row.sourceScreen}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-300 tabular-nums">{row.voucherDate}</td>
                      <td className="px-3 py-2 text-blue-300/90">{partner}</td>
                      <td className="px-3 py-2 text-slate-300 max-w-[160px] truncate" title={row.description}>{row.description || '—'}</td>
                      <td className="px-3 py-2 text-slate-500 text-[10px]">{formatLinesSummary(row.lines)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-teal-300 font-medium">{Number(row.totalDebit || 0).toLocaleString()}</td>
                      <td className="px-3 py-2 text-center text-slate-400">{AUTO_VOUCHER_QUEUE_STATUS_LABELS[row.status]}</td>
                      <td className="px-3 py-2 text-center">
                        {row.voucherNo ? (
                          <Link href={`/dashboard/accounting/voucher/entry/${row.voucherId}`} className="text-teal-400 font-mono text-[10px] hover:underline">
                            {row.voucherNo}
                          </Link>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      {status === 'pending' && (
                        <td className="px-3 py-2">
                          {isPending && (
                            <div className="flex justify-center gap-1">
                              <button
                                type="button"
                                disabled={processing}
                                onClick={() => actOne(id, 'approve')}
                                className="p-1.5 rounded bg-teal-700/80 hover:bg-teal-600 text-white disabled:opacity-40"
                                title="승인"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={processing}
                                onClick={() => actOne(id, 'reject')}
                                className="p-1.5 rounded bg-slate-700 hover:bg-red-700 text-white disabled:opacity-40"
                                title="반려"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                    {isOpen && (
                      <tr className="border-t border-slate-800/40 bg-slate-900/30">
                        <td colSpan={status === 'pending' ? 11 : 9} className="px-4 py-3">
                          <table className="w-full text-[10px] max-w-3xl">
                            <thead>
                              <tr className="text-slate-500">
                                <th className="text-left py-1 pr-3">구분</th>
                                <th className="text-left py-1 pr-3">계정</th>
                                <th className="text-left py-1 pr-3">관리항목</th>
                                <th className="text-right py-1 pr-3">차변</th>
                                <th className="text-right py-1">대변</th>
                              </tr>
                            </thead>
                            <tbody>
                              {row.lines.map(line => (
                                <tr key={line.lineNo} className="border-t border-slate-800/50">
                                  <td className="py-1.5 pr-3 text-slate-400">{line.debit > 0 ? '차변' : '대변'}</td>
                                  <td className="py-1.5 pr-3 text-slate-200">{line.accountCode} {line.accountName}</td>
                                  <td className="py-1.5 pr-3 text-blue-300/80">{line.partnerName || '—'}</td>
                                  <td className="py-1.5 pr-3 text-right tabular-nums text-slate-300">{line.debit > 0 ? line.debit.toLocaleString() : '—'}</td>
                                  <td className="py-1.5 text-right tabular-nums text-slate-300">{line.credit > 0 ? line.credit.toLocaleString() : '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AccountingShell>
  );
}
