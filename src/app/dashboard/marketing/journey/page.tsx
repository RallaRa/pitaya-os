'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, Trash2, Route } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { getAuthHeaders, getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import { formatTimeAgoKST } from '@/lib/dateUtils';

type JourneyStep = 'STEP1' | 'STEP2' | 'STEP3' | 'STEP4';
type QueueStatus = 'pending' | 'sent' | 'failed' | 'cancelled';

interface QueueItem {
  id: string;
  customerId: string;
  customerName: string;
  phone: string;
  journeyStep: JourneyStep;
  message: string;
  status: QueueStatus;
  scheduledAt: string;
  createdAt: unknown;
}

const STEP_LABELS: Record<JourneyStep, string> = {
  STEP1: 'STEP1 · 첫 구매 감사 (3일)',
  STEP2: 'STEP2 · 재방문 쿠폰 (14일)',
  STEP3: 'STEP3 · 보고싶어요 (30일)',
  STEP4: 'STEP4 · 특별 혜택 (90일)',
};

const STATUS_LABELS: Record<QueueStatus, string> = {
  pending: '대기',
  sent: '발송완료',
  failed: '실패',
  cancelled: '취소',
};

export default function JourneyQueuePage() {
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [error, setError] = useState('');
  const [regrading, setRegrading] = useState(false);
  const [gradeStats, setGradeStats] = useState<{ grade: string; count: number }[]>([]);

  const load = useCallback(async () => {
    if (!storeId) { setLoading(false); return; }
    setLoading(true);
    setError('');
    try {
      const headers = await getAuthHeaders();
      const q = new URLSearchParams({ storeId, limit: '50' });
      if (statusFilter) q.set('status', statusFilter);
      const [queueRes, statsRes] = await Promise.all([
        fetch(`/api/marketing/journey?${q}`, { headers }),
        fetch(`/api/customers/grade-stats?storeId=${encodeURIComponent(storeId)}`, { headers }),
      ]);
      const queueData = await queueRes.json();
      const statsData = await statsRes.json();
      if (!queueRes.ok) throw new Error(queueData.error || '큐 로드 실패');
      setItems(queueData.items || []);
      setGradeStats(statsData.grades || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '불러오기 실패');
    } finally {
      setLoading(false);
    }
  }, [storeId, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const handleCancel = async (id: string) => {
    if (!storeId || !confirm('이 큐 항목을 취소/삭제할까요?')) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `/api/marketing/journey?storeId=${encodeURIComponent(storeId)}&id=${encodeURIComponent(id)}`,
        { method: 'DELETE', headers },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '삭제 실패');
      setItems(prev => prev.filter(i => i.id !== id));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : '삭제 실패');
    }
  };

  const handleRegrade = async () => {
    if (!storeId) return;
    setRegrading(true);
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/customers/grade-update', {
        method: 'POST',
        headers,
        body: JSON.stringify({ storeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '등급 재산정 실패');
      await load();
      alert(`등급 재산정 완료 (변경 ${data.updated}명 / 전체 ${data.total}명)`);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : '등급 재산정 실패');
    } finally {
      setRegrading(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Route className="w-5 h-5 text-teal-600" />
            고객 여정 · 발송 큐
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            알림톡 연동 전 — Firestore `notification_queue`에 예약만 생성됩니다.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-1 px-3 py-2 text-sm border rounded-lg hover:bg-slate-50"
          >
            <RefreshCw className="w-4 h-4" /> 새로고침
          </button>
          <button
            type="button"
            onClick={handleRegrade}
            disabled={regrading || !storeId}
            className="inline-flex items-center gap-1 px-3 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50"
          >
            {regrading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            등급 전체 재산정
          </button>
        </div>
      </div>

      {gradeStats.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {gradeStats.map(g => (
            <div key={g.grade} className="bg-white border rounded-xl p-3 text-center">
              <div className="text-xs text-slate-500">{g.grade}</div>
              <div className="text-lg font-semibold text-slate-800">{g.count.toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {['', 'pending', 'sent', 'failed', 'cancelled'].map(st => (
          <button
            key={st || 'all'}
            type="button"
            onClick={() => setStatusFilter(st)}
            className={`px-3 py-1.5 text-sm rounded-full border ${
              statusFilter === st ? 'bg-teal-50 border-teal-300 text-teal-800' : 'bg-white text-slate-600'
            }`}
          >
            {st ? STATUS_LABELS[st as QueueStatus] : '전체'}
          </button>
        ))}
      </div>

      {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-16 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-slate-400 border rounded-xl bg-white">
          발송 예약 큐가 없습니다.
        </div>
      ) : (
        <div className="bg-white border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left p-3">단계</th>
                <th className="text-left p-3">고객</th>
                <th className="text-left p-3 hidden md:table-cell">메시지</th>
                <th className="text-left p-3">예정</th>
                <th className="text-left p-3">상태</th>
                <th className="p-3 w-12" />
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} className="border-t hover:bg-slate-50/50">
                  <td className="p-3 whitespace-nowrap">{STEP_LABELS[item.journeyStep]}</td>
                  <td className="p-3">
                    <div className="font-medium">{item.customerName}</div>
                    <div className="text-xs text-slate-500">{item.customerId} · {item.phone || '-'}</div>
                  </td>
                  <td className="p-3 hidden md:table-cell max-w-xs truncate text-slate-600">{item.message}</td>
                  <td className="p-3 whitespace-nowrap text-xs text-slate-500">
                    {item.scheduledAt ? item.scheduledAt.slice(0, 16).replace('T', ' ') : '-'}
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      item.status === 'pending' ? 'bg-amber-50 text-amber-700'
                        : item.status === 'sent' ? 'bg-green-50 text-green-700'
                          : item.status === 'failed' ? 'bg-red-50 text-red-700'
                            : 'bg-slate-100 text-slate-600'
                    }`}>
                      {STATUS_LABELS[item.status]}
                    </span>
                    <div className="text-xs text-slate-400 mt-0.5">{formatTimeAgoKST(item.createdAt)}</div>
                  </td>
                  <td className="p-3">
                    {item.status === 'pending' && (
                      <button
                        type="button"
                        onClick={() => handleCancel(item.id)}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                        title="취소/삭제"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
