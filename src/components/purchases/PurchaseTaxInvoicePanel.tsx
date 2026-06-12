'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Check, CheckSquare, FileCheck, Image as ImageIcon, Loader2, RefreshCw, Square, X,
} from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import PurchaseShell from '@/components/purchase/PurchaseShell';
import PurchaseDocumentViewer from '@/components/purchases/PurchaseDocumentViewer';
import type { PurchaseAttachment } from '@/lib/purchaseAttachments';
import {
  TAX_DOC_TYPE_LABELS,
  TAX_DOC_TYPE_OPTIONS,
  TAX_DOC_WORKFLOW_STATUS_LABELS,
  type TaxDocType,
  type TaxDocWorkflowStatus,
} from '@/lib/purchase/taxInvoiceWorkflow';

interface PurchaseTaxRow {
  id: string;
  purchaseDate: string;
  supplierName: string;
  invoiceNumber: string;
  supplyAmount: number;
  taxAmount: number;
  totalAmount: number;
  taxDocWorkflowStatus: TaxDocWorkflowStatus;
  taxDocType: TaxDocType;
  taxDocNumber: string;
  physicalMatchOk: boolean;
  physicalMatchNote: string;
  accountingAutoVoucherId: string;
  purchaseAttachments: PurchaseAttachment[];
}

type RowDraft = {
  taxDocType: TaxDocType;
  taxDocNumber: string;
  physicalMatchOk: boolean;
  physicalMatchNote: string;
};

function monthStartYMD() {
  const d = new Date(Date.now() + 9 * 3600_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function todayYMD() {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}

export default function PurchaseTaxInvoicePanel() {
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';

  const [rows, setRows] = useState<PurchaseTaxRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [startDate, setStartDate] = useState(monthStartYMD());
  const [endDate, setEndDate] = useState(todayYMD());
  const [status, setStatus] = useState<TaxDocWorkflowStatus | 'all'>('pending_review');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [viewDocs, setViewDocs] = useState<PurchaseAttachment[] | null>(null);

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    setError('');
    try {
      const headers = await getAuthJsonHeaders();
      const params = new URLSearchParams({ storeId, status, startDate, endDate });
      const res = await fetch(`/api/purchases/tax-invoice?${params}`, { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '조회 실패');
      const list: PurchaseTaxRow[] = data.purchases || [];
      setRows(list);
      setDrafts(Object.fromEntries(list.map(r => [r.id, {
        taxDocType: r.taxDocType === 'none' ? 'tax_invoice' : r.taxDocType,
        taxDocNumber: r.taxDocNumber || r.invoiceNumber || '',
        physicalMatchOk: r.physicalMatchOk,
        physicalMatchNote: r.physicalMatchNote || '',
      }])));
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
    () => rows.filter(r => r.taxDocWorkflowStatus === 'pending_review'),
    [rows],
  );

  const setDraft = (id: string, patch: Partial<RowDraft>) => {
    setDrafts(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

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

  const saveDraft = async (id: string) => {
    if (!storeId) return;
    const d = drafts[id];
    if (!d) return;
    const headers = await getAuthJsonHeaders();
    const res = await fetch('/api/purchases/tax-invoice', {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        storeId,
        purchaseId: id,
        taxDocType: d.taxDocType,
        taxDocNumber: d.taxDocNumber,
        physicalMatchOk: d.physicalMatchOk,
        physicalMatchNote: d.physicalMatchNote,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '저장 실패');
  };

  const releaseOne = async (id: string) => {
    if (!storeId || processing) return;
    const d = drafts[id];
    if (!d?.physicalMatchOk) {
      setError('실물·전자 증빙 대조 확인을 체크하세요.');
      return;
    }
    setProcessing(true);
    setMsg('');
    setError('');
    try {
      await saveDraft(id);
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/purchases/tax-invoice', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          storeId,
          purchaseId: id,
          action: 'release',
          taxDocType: d.taxDocType,
          taxDocNumber: d.taxDocNumber,
          physicalMatchOk: true,
          physicalMatchNote: d.physicalMatchNote,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '전송 실패');
      setMsg('자동전표처리 대기열로 이동했습니다.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '전송 실패');
    } finally {
      setProcessing(false);
    }
  };

  const releaseSelected = async () => {
    if (!storeId || selected.size === 0 || processing) return;
    setProcessing(true);
    setMsg('');
    setError('');
    try {
      for (const id of selected) await saveDraft(id);
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/purchases/tax-invoice', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          storeId,
          action: 'release_batch',
          purchaseIds: [...selected],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '일괄 전송 실패');
      setMsg(`${data.processed}건 자동전표처리로 이동${data.failed ? ` · ${data.failed}건 실패` : ''}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '일괄 전송 실패');
    } finally {
      setProcessing(false);
    }
  };

  const excludeOne = async (id: string) => {
    if (!storeId || !confirm('이 매입을 회계 전표에서 제외하시겠습니까?')) return;
    setProcessing(true);
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/purchases/tax-invoice', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ storeId, purchaseId: id, taxDocWorkflowStatus: 'excluded' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '처리 실패');
      setMsg('전표 제외 처리되었습니다.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '처리 실패');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <PurchaseShell
      title="(세금)계산서 처리"
      description="매입등록 건의 세금계산서·계산서·영수증을 확인하고 실물과 대조한 뒤 자동전표처리로 보냅니다."
      actions={(
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={load} className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 inline-flex items-center gap-1">
            <RefreshCw className="w-3.5 h-3.5" /> 조회
          </button>
          {status === 'pending_review' && (
            <button
              type="button"
              disabled={processing || selected.size === 0}
              onClick={releaseSelected}
              className="text-xs px-2.5 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-600 text-white inline-flex items-center gap-1 disabled:opacity-40"
            >
              {processing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileCheck className="w-3.5 h-3.5" />}
              선택 · 자동전표 전송 ({selected.size})
            </button>
          )}
          <Link
            href="/dashboard/report/purchases/reconciliation"
            className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800"
          >
            증빙 3자 대조
          </Link>
          <Link
            href="/dashboard/accounting/voucher/auto-process"
            className="text-xs px-2.5 py-1.5 rounded-lg border border-teal-500/30 text-teal-300 hover:bg-teal-950/40"
          >
            자동전표처리 →
          </Link>
        </div>
      )}
    >
      {viewDocs && viewDocs.length > 0 && (
        <PurchaseDocumentViewer attachments={viewDocs} onClose={() => setViewDocs(null)} />
      )}

      <div className="mb-4 p-3 rounded-xl border border-slate-800 bg-slate-900/40 text-[11px] text-slate-400 leading-relaxed">
        <p className="text-slate-300 font-medium mb-1">처리 흐름</p>
        <p>매입등록 → <span className="text-teal-400">(세금)계산서 처리</span> (증빙 유형·번호·실물 대조) → <span className="text-teal-400">자동전표처리</span> (분개 검토·승인) → 회계전표</p>
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
            <option value="pending_review">처리대기</option>
            <option value="verified">확정</option>
            <option value="released">전표대기</option>
            <option value="excluded">전표제외</option>
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
        <p className="text-sm text-slate-500 text-center py-12">해당 조건의 매입 건이 없습니다.</p>
      ) : (
        <div className="border border-slate-800 rounded-xl overflow-x-auto">
          <table className="w-full text-xs min-w-[1180px]">
            <thead className="bg-slate-800/80 text-slate-400">
              <tr>
                {status === 'pending_review' && (
                  <th className="px-2 py-2 w-10">
                    <button type="button" onClick={toggleAll} className="text-slate-400 hover:text-teal-400">
                      {selected.size === pendingRows.length && pendingRows.length > 0
                        ? <CheckSquare className="w-4 h-4" />
                        : <Square className="w-4 h-4" />}
                    </button>
                  </th>
                )}
                <th className="text-left px-3 py-2">매입일</th>
                <th className="text-left px-3 py-2">거래처</th>
                <th className="text-right px-3 py-2">공급가</th>
                <th className="text-right px-3 py-2">세액</th>
                <th className="text-right px-3 py-2">합계</th>
                <th className="text-left px-3 py-2">증빙유형</th>
                <th className="text-left px-3 py-2">계산서번호</th>
                <th className="text-center px-3 py-2">실물대조</th>
                <th className="text-center px-3 py-2">상태</th>
                <th className="text-center px-3 py-2 w-28">처리</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const d = drafts[row.id];
                const isPending = row.taxDocWorkflowStatus === 'pending_review';
                return (
                  <tr key={row.id} className="border-t border-slate-800/80">
                    {status === 'pending_review' && (
                      <td className="px-2 py-2">
                        {isPending && (
                          <button type="button" onClick={() => toggleOne(row.id)} className="text-slate-400 hover:text-teal-400">
                            {selected.has(row.id) ? <CheckSquare className="w-4 h-4 text-teal-400" /> : <Square className="w-4 h-4" />}
                          </button>
                        )}
                      </td>
                    )}
                    <td className="px-3 py-2 text-slate-300 tabular-nums">{row.purchaseDate}</td>
                    <td className="px-3 py-2 text-slate-200">{row.supplierName || '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-400">{row.supplyAmount.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-400">{row.taxAmount.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-teal-300 font-medium">{row.totalAmount.toLocaleString()}</td>
                    <td className="px-3 py-2">
                      {isPending && d ? (
                        <select
                          value={d.taxDocType}
                          onChange={e => setDraft(row.id, { taxDocType: e.target.value as TaxDocType })}
                          className="w-full min-w-[100px] px-1.5 py-1 bg-slate-800 border border-slate-700 rounded text-[11px] text-white"
                        >
                          {TAX_DOC_TYPE_OPTIONS.map(t => (
                            <option key={t} value={t}>{TAX_DOC_TYPE_LABELS[t]}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-slate-400">{TAX_DOC_TYPE_LABELS[row.taxDocType] || '—'}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {isPending && d ? (
                        <input
                          value={d.taxDocNumber}
                          onChange={e => setDraft(row.id, { taxDocNumber: e.target.value })}
                          className="w-full min-w-[120px] px-1.5 py-1 bg-slate-800 border border-slate-700 rounded text-[11px] text-white"
                          placeholder="세금계산서 번호"
                        />
                      ) : (
                        <span className="text-slate-400 font-mono text-[10px]">{row.taxDocNumber || row.invoiceNumber || '—'}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {isPending && d ? (
                        <label className="inline-flex items-center gap-1 text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={d.physicalMatchOk}
                            onChange={e => setDraft(row.id, { physicalMatchOk: e.target.checked })}
                            className="rounded border-slate-600"
                          />
                          OK
                        </label>
                      ) : (
                        <span className={row.physicalMatchOk ? 'text-teal-400' : 'text-slate-600'}>
                          {row.physicalMatchOk ? '일치' : '—'}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center text-slate-400">
                      {TAX_DOC_WORKFLOW_STATUS_LABELS[row.taxDocWorkflowStatus]}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-center gap-1">
                        {row.purchaseAttachments.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setViewDocs(row.purchaseAttachments)}
                            className="p-1.5 rounded bg-slate-700 hover:bg-slate-600 text-white"
                            title="원본 보기"
                          >
                            <ImageIcon className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {isPending && (
                          <>
                            <button
                              type="button"
                              disabled={processing}
                              onClick={() => releaseOne(row.id)}
                              className="p-1.5 rounded bg-teal-700/80 hover:bg-teal-600 text-white disabled:opacity-40"
                              title="자동전표 전송"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={processing}
                              onClick={() => excludeOne(row.id)}
                              className="p-1.5 rounded bg-slate-700 hover:bg-red-800 text-white disabled:opacity-40"
                              title="전표 제외"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                        {row.taxDocWorkflowStatus === 'released' && row.accountingAutoVoucherId && (
                          <Link
                            href="/dashboard/accounting/voucher/auto-process"
                            className="text-[10px] text-teal-400 hover:underline px-1"
                          >
                            전표
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </PurchaseShell>
  );
}
