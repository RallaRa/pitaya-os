'use client';

import { useState, useEffect, useCallback } from 'react';
import { History, RefreshCw, CheckCircle, XCircle } from 'lucide-react';
import { getAuthHeaders, getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import { formatAiTag, type FileAnalysisMeta } from '@/lib/purchaseAiLabels';

import type { Invoice } from '@/components/purchases/PurchaseSheet';

export interface AnalysisHistoryEntry {
  id: string;
  storeId: string;
  userMessage: string;
  fileNames: string[];
  fileResults: FileAnalysisMeta[];
  invoiceCount: number;
  suppliers: string[];
  success: boolean;
  errors: string[];
  createdAt: string | null;
  /** 분석 시 추출된 매입 명세 (신규 기록부터 저장) */
  invoices?: Invoice[];
  /** draft=작업중, completed=확정 */
  status?: 'draft' | 'completed';
  updatedAt?: string | null;
}

interface Props {
  storeId: string;
  refreshKey?: number;
  selectedId?: string | null;
  onSelectEntry?: (entry: AnalysisHistoryEntry | null) => void;
}

function formatWhen(iso: string | null) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `오늘 ${time}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${time}`;
}

function HistoryItem({
  entry,
  selected,
  onSelect,
}: {
  entry: AnalysisHistoryEntry;
  selected: boolean;
  onSelect: (entry: AnalysisHistoryEntry) => void;
}) {
  const primary = entry.fileResults[0];

  return (
    <button
      type="button"
      onClick={() => onSelect(entry)}
      className={`w-full text-left border rounded-lg overflow-hidden transition-colors ${
        selected
          ? 'border-teal-500/60 bg-teal-950/40 ring-1 ring-teal-600/30'
          : 'border-slate-800 bg-slate-900/50 hover:bg-slate-800/60 hover:border-slate-700'
      }`}
    >
      <div className="px-2 py-2">
        <div className="flex items-start gap-1.5">
          {entry.success
            ? <CheckCircle className="w-3 h-3 text-teal-400 shrink-0 mt-0.5" />
            : <XCircle className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-0.5">
              <span className="text-[9px] text-slate-500">{formatWhen(entry.createdAt)}</span>
              <div className="flex items-center gap-1 shrink-0">
                {entry.status === 'draft' && (
                  <span className="text-[8px] px-1 py-0.5 rounded bg-amber-900/40 text-amber-300 border border-amber-800/50">
                    작업중
                  </span>
                )}
                {entry.invoiceCount > 0 && (
                  <span className="text-[8px] text-teal-400/80">{entry.invoiceCount}건</span>
                )}
              </div>
            </div>
            <p className="text-[10px] text-slate-200 truncate mt-0.5" title={entry.fileNames.join(', ')}>
              {entry.fileNames.join(', ') || '파일 없음'}
            </p>
            {primary && (
              <span className="inline-block mt-0.5 text-[8px] px-1 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 max-w-full truncate">
                {primary.ensemble?.length
                  ? `🎯 ${primary.confidence ?? '?'}%`
                  : formatAiTag(primary.provider, primary.model, primary.attempt)}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

export default function PurchaseAnalysisHistory({
  storeId,
  refreshKey = 0,
  selectedId = null,
  onSelectEntry,
}: Props) {
  const [entries, setEntries] = useState<AnalysisHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!storeId) {
      setEntries([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `/api/purchases/analysis-history?storeId=${encodeURIComponent(storeId)}&limit=50`,
        { headers },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '조회 실패');
      setEntries(data.entries || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const successCount = entries.filter(e => e.success).length;

  return (
    <div className="flex flex-col h-full bg-slate-950 border-r border-slate-800 min-w-0">
      <div className="flex items-center justify-between px-2 py-2 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <History className="w-3.5 h-3.5 text-teal-400 shrink-0" />
          <div className="min-w-0">
            <h2 className="text-[10px] font-bold text-slate-200">분석 기록</h2>
            <p className="text-[8px] text-slate-500 truncate">
              {entries.length > 0 ? `${successCount}/${entries.length} · 클릭→상세` : 'AI 비교'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading || !storeId}
          className="p-1.5 text-slate-500 hover:text-teal-400 rounded-lg hover:bg-slate-800 disabled:opacity-40"
          title="새로고침"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-1.5 space-y-1.5">
        {!storeId && (
          <p className="text-[10px] text-slate-600 text-center py-6">매장 선택</p>
        )}
        {error && (
          <p className="text-[9px] text-red-400 px-1">{error}</p>
        )}
        {storeId && !loading && entries.length === 0 && !error && (
          <p className="text-[9px] text-slate-600 text-center py-6 leading-relaxed px-1">
            AI 분석 후<br />기록이 여기 표시됩니다
          </p>
        )}
        {entries.map(entry => (
          <HistoryItem
            key={entry.id}
            entry={entry}
            selected={selectedId === entry.id}
            onSelect={e => onSelectEntry?.(selectedId === e.id ? null : e)}
          />
        ))}
      </div>
    </div>
  );
}

/** 분석 완료 후 Firestore에 기록 */
export function sanitizeInvoicesForHistory(invoices: Invoice[]): Invoice[] {
  return invoices.slice(0, 15).map(inv => {
    const { _originalAiResult, ...rest } = inv;
    return {
      ...rest,
      items: (rest.items || []).slice(0, 200),
    };
  });
}

export async function logPurchaseAnalysis(params: {
  storeId: string;
  userMessage: string;
  fileNames: string[];
  fileResults: FileAnalysisMeta[];
  invoiceCount: number;
  suppliers: string[];
  success: boolean;
  errors?: string[];
  invoices?: Invoice[];
  analysisId?: string | null;
  merge?: boolean;
  status?: 'draft' | 'completed';
}): Promise<string | null> {
  if (!params.storeId) return null;
  try {
    const headers = await getAuthJsonHeaders();
    const payload = {
      ...params,
      invoices: params.invoices ? sanitizeInvoicesForHistory(params.invoices) : undefined,
      status: params.status ?? 'draft',
    };
    const res = await fetch('/api/purchases/analysis-history', {
      method: params.analysisId && params.merge ? 'PUT' : 'POST',
      headers,
      body: JSON.stringify(
        params.analysisId && params.merge
          ? {
              id: params.analysisId,
              storeId: params.storeId,
              userMessage: params.userMessage,
              fileNames: params.fileNames,
              fileResults: params.fileResults,
              invoiceCount: params.invoiceCount,
              suppliers: params.suppliers,
              success: params.success,
              errors: params.errors,
              invoices: payload.invoices,
              status: payload.status,
              mergeFileNames: true,
              mergeFileResults: true,
            }
          : payload,
      ),
    });
    const data = await res.json();
    return data.id || params.analysisId || null;
  } catch {
    return params.analysisId || null;
  }
}

export async function completePurchaseAnalysis(
  storeId: string,
  analysisId: string,
): Promise<void> {
  if (!storeId || !analysisId) return;
  try {
    const headers = await getAuthJsonHeaders();
    await fetch('/api/purchases/analysis-history', {
      method: 'PUT',
      headers,
      body: JSON.stringify({ id: analysisId, storeId, status: 'completed' }),
    });
  } catch {
    /* ignore */
  }
}
