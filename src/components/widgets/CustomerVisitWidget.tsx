'use client';

import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, TrendingDown, Minus, Users } from 'lucide-react';
import WidgetWrapper from './WidgetWrapper';
import WidgetEmptyReason from './WidgetEmptyReason';
import SalesEvidenceLine from './SalesEvidenceLine';
import { getAuthHeaders } from '@/lib/getAuthHeaders';
import type { CustomerVisitSummary } from '@/lib/customerVisitStats';

function ChangeBadge({
  value,
  suffix = '%',
  label,
}: {
  value: number | null;
  suffix?: string;
  label: string;
}) {
  if (value == null) {
    return (
      <p className="text-[10px] text-slate-500">{label} —</p>
    );
  }
  const up = value > 0;
  const down = value < 0;
  const Icon = up ? TrendingUp : down ? TrendingDown : Minus;
  const color = up ? 'text-green-400' : down ? 'text-red-400' : 'text-slate-400';
  return (
    <p className={`text-[10px] flex items-center gap-0.5 ${color}`}>
      <Icon className="w-3 h-3 shrink-0" />
      <span>{label} {up ? '+' : ''}{value}{suffix}</span>
    </p>
  );
}

export default function CustomerVisitWidget({
  editMode, onRemove, storeId,
}: {
  editMode: boolean;
  onRemove: () => void;
  storeId?: string;
}) {
  const [data, setData] = useState<CustomerVisitSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    if (!storeId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `/api/dashboard/customer-visit-summary?storeId=${encodeURIComponent(storeId)}`,
        { headers },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '조회 실패');
      setData(json);
      setUpdatedAt(new Date());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '방문 데이터를 불러오지 못했습니다');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const DirectionIcon = data?.direction === 'up'
    ? TrendingUp
    : data?.direction === 'down'
      ? TrendingDown
      : Minus;
  const directionColor = data?.direction === 'up'
    ? 'text-green-400'
    : data?.direction === 'down'
      ? 'text-red-400'
      : 'text-slate-400';

  return (
    <WidgetWrapper
      title="고객 방문 · 전월대비"
      editMode={editMode}
      onRemove={onRemove}
      onRefresh={fetchData}
      updatedAt={updatedAt}
      loading={loading}
      error={error}
    >
      {!storeId ? (
        <div className="p-3">
          <WidgetEmptyReason reason="매장이 선택되지 않았습니다." />
        </div>
      ) : data && data.totalCustomers === 0 && data.thisMonthVisitors === 0 ? (
        <div className="p-3">
          <WidgetEmptyReason
            reason="고객·방문 데이터가 없습니다."
            hints={['POS 고객 연동', 'pos_customer_sales 수집']}
          />
        </div>
      ) : data ? (
        <div className="h-full p-3 flex flex-col gap-3 justify-center">
          {data.evidenceSummary && (
            <SalesEvidenceLine
              summary={data.evidenceSummary}
              detail={data.evidenceDetail}
              salesLink={data.salesHint}
              compact
            />
          )}
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[10px] text-slate-500">{data.thisMonthLabel} 방문 고객</p>
              <p className="text-2xl font-bold text-slate-100 tabular-nums">
                {data.thisMonthVisitors.toLocaleString()}
                <span className="text-sm font-normal text-slate-500 ml-1">명</span>
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5">
                {data.prevMonthLabel} {data.prevMonthVisitors.toLocaleString()}명
              </p>
            </div>
            <div className={`flex flex-col items-end ${directionColor}`}>
              <DirectionIcon className="w-5 h-5" />
              <ChangeBadge
                value={data.visitorChangePct}
                label="전월대비"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="bg-slate-800/50 rounded-lg p-2 border border-slate-700/40">
              <p className="text-[9px] text-slate-500 flex items-center gap-1">
                <Users className="w-3 h-3" /> 방문률
              </p>
              <p className="text-lg font-bold text-teal-300 tabular-nums">
                {data.thisMonthVisitRate != null ? `${data.thisMonthVisitRate}%` : '-'}
              </p>
              <p className="text-[9px] text-slate-500">
                {data.prevMonthLabel} {data.prevMonthVisitRate != null ? `${data.prevMonthVisitRate}%` : '-'}
              </p>
              <ChangeBadge value={data.visitRateChangePct} label="전월" />
            </div>
            <div className="bg-slate-800/50 rounded-lg p-2 border border-slate-700/40">
              <p className="text-[9px] text-slate-500">방문 횟수</p>
              <p className="text-lg font-bold text-slate-200 tabular-nums">
                {data.thisMonthVisits.toLocaleString()}
              </p>
              <p className="text-[9px] text-slate-500">
                {data.prevMonthLabel} {data.prevMonthVisits.toLocaleString()}회
              </p>
              <ChangeBadge value={data.visitTxChangePct} label="전월" />
            </div>
          </div>

          {data.visitRateChange != null && (
            <p className={`text-xs text-center ${directionColor}`}>
              방문률 {data.visitRateChange > 0 ? '+' : ''}{data.visitRateChange}%p
              {' '}
              ({data.direction === 'up' ? '증가' : data.direction === 'down' ? '감소' : '유지'})
            </p>
          )}
        </div>
      ) : null}
    </WidgetWrapper>
  );
}
