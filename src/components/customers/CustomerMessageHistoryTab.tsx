'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, ChevronLeft, ChevronRight, Send, AlertCircle } from 'lucide-react';
import { getAuthHeaders } from '@/lib/getAuthHeaders';

interface MessageLogRow {
  id: string;
  templateCode: string;
  campaignKey: string;
  requestedByEmail: string;
  totalMatched: number;
  sent: number;
  failed: number;
  skipped: number;
  skipReasons: Record<string, number>;
  filters: Record<string, string> | null;
  variables?: { add1?: string; add2?: string; add3?: string };
  createdAt: string;
}

interface Props {
  storeId: string;
  onOpenSend?: () => void;
}

const LIMIT = 20;

function formatFilterSummary(filters: Record<string, string> | null) {
  if (!filters) return '전체';
  const parts: string[] = [];
  if (filters.grade) parts.push(`등급:${filters.grade}`);
  if (filters.search) parts.push(`검색:${filters.search}`);
  if (filters.cycleStatus) parts.push(`상태:${filters.cycleStatus}`);
  if (filters.joinFrom || filters.joinTo) parts.push(`가입 ${filters.joinFrom || '…'}~${filters.joinTo || '…'}`);
  if (filters.visitFrom || filters.visitTo) parts.push(`방문 ${filters.visitFrom || '…'}~${filters.visitTo || '…'}`);
  return parts.length ? parts.join(' · ') : '전체';
}

function formatSkipReasons(reasons: Record<string, number>) {
  const labels: Record<string, string> = {
    already_sent: '이미 발송',
    invalid_phone: '번호 없음',
    duplicate_phone: '번호 중복',
    no_pii: 'PII 없음',
    masked_phone: '마스킹 번호',
  };
  return Object.entries(reasons)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${labels[k] || k} ${n}`)
    .join(', ');
}

export default function CustomerMessageHistoryTab({ storeId, onOpenSend }: Props) {
  const [logs, setLogs] = useState<MessageLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [provider, setProvider] = useState('');

  const loadLogs = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `/api/customers/message?storeId=${encodeURIComponent(storeId)}&page=${page}&limit=${LIMIT}`,
        { headers },
      );
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setLogs(d.logs || []);
      setTotal(d.total ?? 0);
      setConfigured(!!d.configured);
      setProvider(String(d.provider || ''));
    } catch (e) {
      console.error('[message history]', e);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [storeId, page]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-300">알림톡 발송 이력</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            캠페인 키·쿠폰코드(추가정보1)·필터·성공/실패 건수를 확인합니다.
            {provider ? ` · ${provider.toUpperCase()}` : ''}
          </p>
        </div>
        {onOpenSend && (
          <button
            type="button"
            onClick={onOpenSend}
            className="flex items-center gap-1.5 px-3 py-2 bg-teal-700/40 hover:bg-teal-600/50 border border-teal-600/40 text-teal-300 rounded-lg text-xs font-medium"
          >
            <Send className="w-3.5 h-3.5" />
            고객 목록에서 발송
          </button>
        )}
      </div>

      {configured === false && (
        <div className="flex gap-2 p-3 bg-amber-950/40 border border-amber-800/50 rounded-lg text-xs text-amber-200">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>SOLAPI/DHN 미설정 — 발송은 불가하지만 과거 이력은 조회됩니다.</div>
        </div>
      )}

      <div className="bg-slate-900/60 rounded-xl border border-slate-800 overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            불러오는 중…
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-500">
                <th className="text-left px-3 py-2.5 font-medium">일시</th>
                <th className="text-left px-3 py-2.5 font-medium">캠페인</th>
                <th className="text-left px-3 py-2.5 font-medium">쿠폰/추가1</th>
                <th className="text-right px-3 py-2.5 font-medium">발송</th>
                <th className="text-right px-3 py-2.5 font-medium">실패</th>
                <th className="text-right px-3 py-2.5 font-medium">제외</th>
                <th className="text-left px-3 py-2.5 font-medium">발송자</th>
                <th className="text-left px-3 py-2.5 font-medium">대상 필터</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-slate-600">
                    발송 이력이 없습니다. 고객 목록에서 필터 후 「알림톡 발송」을 사용하세요.
                  </td>
                </tr>
              ) : logs.map(log => (
                <tr key={log.id} className="border-b border-slate-800/50 hover:bg-slate-800/20 align-top">
                  <td className="px-3 py-2 text-slate-400 whitespace-nowrap">
                    {log.createdAt ? new Date(log.createdAt).toLocaleString('ko-KR') : '-'}
                  </td>
                  <td className="px-3 py-2 text-slate-300">
                    <div>{log.campaignKey || '-'}</div>
                    {log.templateCode && (
                      <div className="text-[10px] text-slate-600 truncate max-w-[120px]" title={log.templateCode}>
                        {log.templateCode}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-amber-300/90 font-medium">
                    {log.variables?.add1 || '-'}
                    {log.variables?.add2 && (
                      <div className="text-[10px] text-slate-500 font-normal">{log.variables.add2}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-teal-300 font-medium">
                    {log.sent.toLocaleString()}
                    <div className="text-[10px] text-slate-600 font-normal">/ {log.totalMatched.toLocaleString()}명</div>
                  </td>
                  <td className="px-3 py-2 text-right text-rose-400">{log.failed.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-slate-500">
                    {log.skipped.toLocaleString()}
                    {Object.keys(log.skipReasons || {}).length > 0 && (
                      <div className="text-[10px] text-slate-600 font-normal max-w-[140px] ml-auto">
                        {formatSkipReasons(log.skipReasons)}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-400">{log.requestedByEmail || '-'}</td>
                  <td className="px-3 py-2 text-slate-500">{formatFilterSummary(log.filters)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>{total.toLocaleString()}건</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1 rounded hover:bg-slate-800 disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span>{page} / {totalPages}</span>
            <button
              type="button"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1 rounded hover:bg-slate-800 disabled:opacity-30"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
