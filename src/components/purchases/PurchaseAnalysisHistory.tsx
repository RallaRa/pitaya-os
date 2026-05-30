'use client';

import { useState, useEffect, useCallback } from 'react';
import { History, RefreshCw, Trash2, ChevronDown, ChevronRight, CheckCircle, XCircle } from 'lucide-react';
import { getAuthHeaders, getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import { formatAiTag, formatFileResultLine, type FileAnalysisMeta } from '@/lib/purchaseAiLabels';

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
}

interface Props {
  storeId: string;
  refreshKey?: number;
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
  onDelete,
}: {
  entry: AnalysisHistoryEntry;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const primary = entry.fileResults[0];

  return (
    <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-900/50">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full text-left px-3 py-2.5 hover:bg-slate-800/60 transition-colors"
      >
        <div className="flex items-start gap-2">
          {entry.success
            ? <CheckCircle className="w-3.5 h-3.5 text-teal-400 shrink-0 mt-0.5" />
            : <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] text-slate-500">{formatWhen(entry.createdAt)}</span>
              {open
                ? <ChevronDown className="w-3 h-3 text-slate-600 shrink-0" />
                : <ChevronRight className="w-3 h-3 text-slate-600 shrink-0" />}
            </div>
            <p className="text-xs text-slate-200 truncate mt-0.5" title={entry.fileNames.join(', ')}>
              {entry.fileNames.join(', ') || '파일 없음'}
            </p>
            {primary && (
              <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                {primary.ensemble?.length
                  ? `🎯 앙상블 ${primary.confidence ?? '?'}% · ${entry.invoiceCount > 0 ? `${entry.invoiceCount}건` : '실패'}`
                  : `${formatAiTag(primary.provider, primary.model, primary.attempt)}${entry.invoiceCount > 0 ? ` · ${entry.invoiceCount}건` : ' · 실패'}`}
              </span>
            )}
          </div>
        </div>
      </button>

      {open && (
        <div className="px-3 pb-2.5 pt-0 border-t border-slate-800/80 space-y-1.5">
          {entry.userMessage && entry.userMessage !== '파일을 분석해 주세요.' && (
            <p className="text-[10px] text-slate-500 pt-2">요청: {entry.userMessage}</p>
          )}
          {entry.suppliers.length > 0 && (
            <p className="text-[10px] text-slate-400">업체: {entry.suppliers.join(', ')}</p>
          )}
          {entry.fileResults.map((fr, i) => (
            <div key={i} className="text-[10px] text-slate-400 leading-relaxed space-y-0.5">
              <p className="whitespace-pre-wrap">{formatFileResultLine(fr)}</p>
              {fr.ensemble?.filter(e => !e.success && e.exclusionReason).map((e, j) => (
                <p key={j} className="text-red-400/70 pl-2">⛔ {e.exclusionReason}</p>
              ))}
            </div>
          ))}
          {entry.errors.length > 0 && (
            <p className="text-[10px] text-red-400/80">{entry.errors.join(' · ')}</p>
          )}
          <button
            type="button"
            onClick={() => onDelete(entry.id)}
            className="flex items-center gap-1 text-[10px] text-slate-600 hover:text-red-400 mt-1"
          >
            <Trash2 className="w-3 h-3" /> 삭제
          </button>
        </div>
      )}
    </div>
  );
}

export default function PurchaseAnalysisHistory({ storeId, refreshKey = 0 }: Props) {
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

  const handleDelete = async (id: string) => {
    if (!confirm('이 분석 기록을 삭제할까요?')) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/purchases/analysis-history?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '삭제 실패');
      }
      setEntries(prev => prev.filter(e => e.id !== id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const successCount = entries.filter(e => e.success).length;

  return (
    <div className="flex flex-col h-full bg-slate-950 border-r border-slate-800">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <History className="w-4 h-4 text-teal-400 shrink-0" />
          <div className="min-w-0">
            <h2 className="text-xs font-bold text-slate-200">분석 히스토리</h2>
            <p className="text-[10px] text-slate-500 truncate">
              {entries.length > 0 ? `성공 ${successCount}/${entries.length}` : 'AI별 비교 기록'}
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

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {!storeId && (
          <p className="text-xs text-slate-600 text-center py-8">매장을 선택해 주세요.</p>
        )}
        {error && (
          <p className="text-[10px] text-red-400 px-1">{error}</p>
        )}
        {storeId && !loading && entries.length === 0 && !error && (
          <p className="text-[11px] text-slate-600 text-center py-8 leading-relaxed px-2">
            분석할 때마다<br />사용 AI·결과가<br />여기에 쌓입니다.
          </p>
        )}
        {entries.map(entry => (
          <HistoryItem key={entry.id} entry={entry} onDelete={handleDelete} />
        ))}
      </div>
    </div>
  );
}

/** 분석 완료 후 Firestore에 기록 */
export async function logPurchaseAnalysis(params: {
  storeId: string;
  userMessage: string;
  fileNames: string[];
  fileResults: FileAnalysisMeta[];
  invoiceCount: number;
  suppliers: string[];
  success: boolean;
  errors?: string[];
}) {
  if (!params.storeId) return;
  try {
    const headers = await getAuthJsonHeaders();
    await fetch('/api/purchases/analysis-history', {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    });
  } catch {
    /* non-blocking */
  }
}
