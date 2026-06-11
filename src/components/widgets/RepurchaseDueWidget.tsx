'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import WidgetWrapper from './WidgetWrapper';
import { getAuthHeaders } from '@/lib/getAuthHeaders';

interface DueCustomer {
  cusCode: string;
  name: string;
  avgCycleDays: number;
  daysSinceLastVisit: number;
  overdueDays: number;
  pitayaGrade: string;
}

export default function RepurchaseDueWidget({
  editMode, onRemove, storeId,
}: { editMode: boolean; onRemove: () => void; storeId?: string }) {
  const [customers, setCustomers] = useState<DueCustomer[]>([]);
  const [count, setCount] = useState(0);
  const [date, setDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!storeId) { setLoading(false); return; }
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/dashboard/repurchase-due?storeId=${encodeURIComponent(storeId)}`, { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '조회 실패');
      setCustomers(data.customers || []);
      setCount(data.count || 0);
      setDate(data.date || '');
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '조회 실패');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    setLoading(true);
    fetchData();
    const t = setInterval(fetchData, 300000);
    return () => clearInterval(t);
  }, [fetchData]);

  return (
    <WidgetWrapper title="재구매 주기 임박" editMode={editMode} onRemove={onRemove} loading={loading} error={error} onRefresh={fetchData}>
      {count === 0 ? (
        <p className="text-slate-500 text-xs">평균 주기+2일 초과 고객 없음 ({date || '오늘'})</p>
      ) : (
        <div className="space-y-2">
          <p className="text-amber-400/90 text-xs">{count}명 · 알림톡 큐 등록 대상 (notification_queue)</p>
          <ul className="space-y-1.5 max-h-48 overflow-y-auto">
            {customers.slice(0, 8).map(c => (
              <li key={c.cusCode} className="flex justify-between gap-2 text-xs border-b border-slate-800/80 pb-1">
                <span className="text-slate-200 truncate">{c.name || c.cusCode}</span>
                <span className="text-slate-500 shrink-0">{c.daysSinceLastVisit}일 · +{c.overdueDays}일</span>
              </li>
            ))}
          </ul>
          <Link href="/dashboard/marketing/journey" className="text-teal-400 text-xs hover:underline">
            알림 큐 확인 →
          </Link>
        </div>
      )}
    </WidgetWrapper>
  );
}
