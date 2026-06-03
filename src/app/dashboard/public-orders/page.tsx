'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import {
  Copy, ExternalLink, Loader2, Trash2, ChevronLeft, ChevronRight,
  GripVertical, Link2, Play, Pause,
} from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { getAuthHeaders } from '@/lib/getAuthHeaders';
import type { PublicOrderLine, PublicOrderEntryStatus } from '@/lib/publicOrders';
import {
  PUBLIC_ORDER_ENTRY_STATUSES,
  PUBLIC_ORDER_ENTRY_STATUS_LABELS,
} from '@/lib/publicOrders';

const PublicOrderAIChat = dynamic(
  () => import('@/components/public-orders/PublicOrderAIChat'),
  { ssr: false },
);
const PublicOrderKakaoHookSettings = dynamic(
  () => import('@/components/public-orders/PublicOrderKakaoHookSettings'),
  { ssr: false },
);

interface SessionSummary {
  id: string;
  title: string;
  status: string;
  publicToken: string;
  orderDeadline: string | null;
  createdAt: string | null;
}

export default function PublicOrdersAdminPage() {
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';
  const searchParams = useSearchParams();
  const sessionFromUrl = searchParams.get('session');

  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lines, setLines] = useState<PublicOrderLine[]>([]);
  const [entries, setEntries] = useState<Array<{
    id: string;
    ordererName: string;
    ordererPhoneMasked: string;
    lines: { name: string; qty: number; unit?: string }[];
    note?: string;
    status: PublicOrderEntryStatus;
    totalAmount: number;
    createdAt: string | null;
  }>>([]);
  const [sessionMeta, setSessionMeta] = useState({
    title: '', description: '', status: 'draft', orderDeadline: '', publicToken: '',
  });
  const [loading, setLoading] = useState(false);
  const [aiOpen, setAiOpen] = useState(true);
  const [aiWidth, setAiWidth] = useState(320);
  const resizingRef = useRef(false);

  const loadSessions = useCallback(async () => {
    if (!storeId) return;
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/public-orders/sessions?storeId=${storeId}`, { headers });
    const data = await res.json();
    if (res.ok) setSessions(data.sessions || []);
  }, [storeId]);

  const loadDetail = useCallback(async (sessionId: string) => {
    if (!storeId) return;
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `/api/public-orders/sessions/${sessionId}?storeId=${storeId}`,
        { headers },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSessionMeta({
        title: data.session.title,
        description: data.session.description || '',
        status: data.session.status,
        orderDeadline: data.session.orderDeadline || '',
        publicToken: data.session.publicToken,
      });
      setLines(data.lines || []);
      setEntries(data.entries || []);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  const refreshAll = useCallback(async () => {
    await loadSessions();
    if (selectedId) await loadDetail(selectedId);
  }, [loadSessions, loadDetail, selectedId]);

  useEffect(() => { loadSessions(); }, [loadSessions]);
  useEffect(() => {
    if (sessionFromUrl) setSelectedId(sessionFromUrl);
  }, [sessionFromUrl]);
  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
  }, [selectedId, loadDetail]);
  useEffect(() => {
    if (!selectedId) return;
    const timer = setInterval(() => loadDetail(selectedId), 30000);
    return () => clearInterval(timer);
  }, [selectedId, loadDetail]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      setAiWidth(Math.min(520, Math.max(260, window.innerWidth - e.clientX)));
    };
    const onUp = () => {
      resizingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const copyPublicLink = () => {
    const url = `${window.location.origin}/order/${sessionMeta.publicToken}`;
    navigator.clipboard.writeText(url);
  };

  const updateEntryStatus = async (entryId: string, status: PublicOrderEntryStatus) => {
    const headers = await getAuthHeaders();
    const res = await fetch(
      `/api/public-orders/entries/${entryId}?storeId=${encodeURIComponent(storeId)}`,
      {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      },
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '상태 변경 실패');
    setEntries(prev => prev.map(e => (e.id === entryId ? { ...e, status } : e)));
  };

  const deleteSession = async (id: string) => {
    if (!confirm('이 회차를 삭제하시겠습니까?')) return;
    const headers = await getAuthHeaders();
    await fetch(`/api/public-orders/sessions/${id}?storeId=${storeId}`, {
      method: 'DELETE',
      headers,
    });
    if (selectedId === id) setSelectedId(null);
    await refreshAll();
  };

  if (!storeId) {
    return <div className="p-6 text-slate-500 text-sm">매장을 선택해 주세요</div>;
  }

  const publicUrl = sessionMeta.publicToken
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/order/${sessionMeta.publicToken}`
    : '';

  const statusLabel = (s: string) =>
    s === 'open' ? '접수중' : s === 'closed' ? '마감' : '준비';

  const entryStatusClass = (status: PublicOrderEntryStatus) => {
    switch (status) {
      case 'accepted':
        return 'bg-blue-900/40 text-blue-300';
      case 'ready':
        return 'bg-violet-900/40 text-violet-300';
      case 'completed':
        return 'bg-slate-700/60 text-slate-300';
      default:
        return 'bg-amber-900/40 text-amber-300';
    }
  };

  return (
    <div className="flex h-full min-h-[calc(100vh-4rem)] bg-slate-950 text-slate-100 overflow-hidden">
      {/* 회차 목록 */}
      <aside className="w-full lg:w-56 shrink-0 border-r border-slate-800 bg-slate-900/40 p-3 flex flex-col">
        <h1 className="text-sm font-bold text-white mb-0.5">공개 주문</h1>
        <p className="text-[10px] text-slate-500 mb-3 leading-snug">
          AI 채팅으로 회차·품목 생성 · 손님은 링크로만 주문
        </p>
        <div className="space-y-1 flex-1 overflow-y-auto">
          {sessions.length === 0 ? (
            <p className="text-[10px] text-slate-600 py-4 text-center">
              회차 없음<br />우측 AI에 말해 보세요
            </p>
          ) : (
            sessions.map(s => (
              <div
                key={s.id}
                className={`flex items-center gap-1 rounded-xl transition-colors ${
                  selectedId === s.id
                    ? 'bg-teal-600/20 border border-teal-500/30'
                    : 'hover:bg-slate-800 border border-transparent'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedId(s.id)}
                  className="flex-1 text-left px-2.5 py-2 min-w-0"
                >
                  <p className="text-xs font-medium truncate text-slate-200">{s.title}</p>
                  <p className={`text-[9px] mt-0.5 ${
                    s.status === 'open' ? 'text-emerald-400'
                      : s.status === 'closed' ? 'text-red-400' : 'text-slate-500'
                  }`}>
                    {statusLabel(s.status)}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => deleteSession(s.id)}
                  className="p-1.5 text-slate-700 hover:text-red-400 shrink-0"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* 미리보기 */}
      <main className="flex-1 min-w-0 overflow-y-auto p-4 pb-[48vh] md:pb-4">
        <div className="max-w-2xl mb-4">
          <PublicOrderKakaoHookSettings storeId={storeId} />
        </div>
        {!selectedId ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[320px] text-center px-4">
            <p className="text-slate-400 text-sm mb-2">AI에게 말해서 주문 회차를 만드세요</p>
            <p className="text-[11px] text-slate-600 max-w-md leading-relaxed">
              예: 「5월 한우 특판 회차 만들고 등심 50kg 89000원, 갈비 30kg 65000원 넣고 접수 시작해줘」
            </p>
          </div>
        ) : loading ? (
          <Loader2 className="w-6 h-6 animate-spin text-teal-400" />
        ) : (
          <div className="space-y-4 max-w-2xl">
            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-semibold text-white">{sessionMeta.title}</h2>
                  {sessionMeta.description && (
                    <p className="text-xs text-slate-400 mt-1">{sessionMeta.description}</p>
                  )}
                  <div className="flex flex-wrap gap-2 mt-2 text-[10px]">
                    <span className={`px-2 py-0.5 rounded-full ${
                      sessionMeta.status === 'open'
                        ? 'bg-emerald-900/40 text-emerald-300'
                        : sessionMeta.status === 'closed'
                          ? 'bg-red-900/40 text-red-300'
                          : 'bg-slate-800 text-slate-400'
                    }`}>
                      {sessionMeta.status === 'open' && <Play className="w-2.5 h-2.5 inline mr-0.5" />}
                      {sessionMeta.status === 'closed' && <Pause className="w-2.5 h-2.5 inline mr-0.5" />}
                      {statusLabel(sessionMeta.status)}
                    </span>
                    {sessionMeta.orderDeadline && (
                      <span className="text-slate-500">마감 {sessionMeta.orderDeadline}</span>
                    )}
                  </div>
                </div>
              </div>
              {publicUrl && (
                <div className="flex flex-wrap gap-2 items-center mt-3 pt-3 border-t border-slate-800">
                  <Link2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <code className="text-[10px] text-slate-400 flex-1 truncate">{publicUrl}</code>
                  <button type="button" onClick={copyPublicLink} className="p-1 text-slate-400 hover:text-white">
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="p-1 text-slate-400 hover:text-white">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
            </section>

            <section>
              <h3 className="text-xs font-semibold text-slate-400 mb-2">품목 ({lines.length})</h3>
              <div className="space-y-2">
                {lines.length === 0 ? (
                  <p className="text-[11px] text-slate-600">AI에게 품목을 추가해 달라고 하세요</p>
                ) : (
                  lines.map(line => (
                    <div
                      key={line.id}
                      className="flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-xl p-3"
                    >
                      {line.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={line.photoUrl} alt="" className="w-12 h-12 rounded-lg object-cover" />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-slate-800" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-white text-sm">{line.name}</p>
                        <p className="text-[10px] text-slate-500">
                          {(line.discountPrice || line.normalPrice).toLocaleString()}원/{line.unit}
                          · 잔량 {line.remainingQty}/{line.totalQty}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section>
              <h3 className="text-xs font-semibold text-slate-400 mb-1">
                주문 접수 ({entries.length}) · 30초마다 갱신
              </h3>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {entries.length === 0 ? (
                  <p className="text-[11px] text-slate-600">아직 접수된 주문이 없습니다</p>
                ) : (
                  entries.map(e => (
                    <div key={e.id} className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-sm">
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0">
                          <span className="text-white font-medium">{e.ordererName}</span>
                          <p className="text-[10px] text-slate-500 mt-0.5">{e.ordererPhoneMasked}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-teal-300 block">{e.totalAmount?.toLocaleString()}원</span>
                          {e.createdAt && (
                            <span className="text-[9px] text-slate-600">
                              {new Date(e.createdAt).toLocaleString('ko-KR', {
                                month: 'numeric',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          )}
                        </div>
                      </div>
                      <ul className="mt-2 text-xs text-slate-400 space-y-0.5">
                        {e.lines.map((l, i) => (
                          <li key={i}>
                            {l.name} × {l.qty}{l.unit || ''}
                          </li>
                        ))}
                      </ul>
                      {e.note ? (
                        <p className="mt-2 text-xs text-amber-200/90 bg-amber-950/30 border border-amber-800/40 rounded-lg px-2.5 py-2">
                          <span className="text-[10px] text-amber-400/80 font-semibold">요청사항 </span>
                          {e.note}
                        </p>
                      ) : null}
                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${entryStatusClass(e.status)}`}>
                          {PUBLIC_ORDER_ENTRY_STATUS_LABELS[e.status]}
                        </span>
                        <select
                          value={e.status}
                          onChange={ev => {
                            const next = ev.target.value as PublicOrderEntryStatus;
                            updateEntryStatus(e.id, next).catch(err => {
                              alert(err instanceof Error ? err.message : '상태 변경 실패');
                            });
                          }}
                          className="text-[10px] bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-slate-300"
                        >
                          {PUBLIC_ORDER_ENTRY_STATUSES.map(s => (
                            <option key={s} value={s}>
                              {PUBLIC_ORDER_ENTRY_STATUS_LABELS[s]}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        )}
      </main>

      {/* AI 채팅 — 데스크탑 우측 */}
      {aiOpen ? (
        <div className="hidden md:flex shrink-0 h-full relative" style={{ width: aiWidth }}>
          <div
            role="separator"
            onMouseDown={() => {
              resizingRef.current = true;
              document.body.style.cursor = 'col-resize';
              document.body.style.userSelect = 'none';
            }}
            className="absolute left-0 top-0 bottom-0 w-1.5 -ml-0.5 z-20 cursor-col-resize hover:bg-teal-500/20"
          />
          <button
            type="button"
            onClick={() => setAiOpen(false)}
            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-full z-10 w-4 h-8 bg-slate-800 border border-slate-700 rounded-l-md flex items-center justify-center text-slate-500 hover:text-teal-400"
          >
            <ChevronRight className="w-3 h-3" />
          </button>
          <div className="flex flex-col w-full h-full min-w-0">
            <PublicOrderAIChat
              storeId={storeId}
              sessionId={selectedId}
              onSessionChange={setSelectedId}
              onRefresh={refreshAll}
            />
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAiOpen(true)}
          className="hidden md:flex flex-col items-center justify-center w-8 shrink-0 border-l border-slate-800 text-slate-500 hover:text-teal-400 hover:bg-slate-800/80"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      )}

      {/* AI 채팅 — 모바일 하단 */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 h-[45vh] border-t border-slate-800 bg-slate-900">
        <PublicOrderAIChat
          storeId={storeId}
          sessionId={selectedId}
          onSessionChange={setSelectedId}
          onRefresh={refreshAll}
        />
      </div>
    </div>
  );
}
