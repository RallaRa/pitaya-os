'use client';

import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, TrendingDown, Minus, Users } from 'lucide-react';
import WidgetWrapper from './WidgetWrapper';
import SalesEvidenceLine from './SalesEvidenceLine';
import EmptyState from '@/components/suspense/EmptyState';
import SkeletonCard from '@/components/suspense/SkeletonCard';
import { useCustomerVisitSummary } from '@/lib/queries';
import WidgetAnalysisPanel from './WidgetAnalysisPanel';
import { useWidgetAnalysis } from '@/hooks/useWidgetAnalysis';

const WIDGET_TITLE = '고객 방문 · 전월·전년대비';

function ChangeBadge({
  value,
  suffix = '%',
  label,
  size = 'sm',
}: {
  value: number | null;
  suffix?: string;
  label: string;
  size?: 'sm' | 'xs';
}) {
  if (value == null) {
    return (
      <p className={`${size === 'xs' ? 'text-[9px]' : 'text-[10px]'} text-slate-500`}>{label} —</p>
    );
  }
  const up = value > 0;
  const down = value < 0;
  const Icon = up ? TrendingUp : down ? TrendingDown : Minus;
  const color = up ? 'text-green-400' : down ? 'text-red-400' : 'text-slate-400';
  return (
    <p className={`${size === 'xs' ? 'text-[9px]' : 'text-[10px]'} flex items-center gap-0.5 ${color}`}>
      <Icon className={`${size === 'xs' ? 'w-2.5 h-2.5' : 'w-3 h-3'} shrink-0`} />
      <span>{label} {up ? '+' : ''}{value}{suffix}</span>
    </p>
  );
}

function CustomerVisitWidgetContent({
  editMode, onRemove, storeId,
}: {
  editMode: boolean;
  onRemove: () => void;
  storeId: string;
}) {
  const { data, isLoading, isError, refetch, dataUpdatedAt } = useCustomerVisitSummary(storeId);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(new Date());

  useEffect(() => {
    if (dataUpdatedAt) setUpdatedAt(new Date(dataUpdatedAt));
  }, [dataUpdatedAt]);

  const refresh = useCallback(() => {
    void refetch();
  }, [refetch]);
  const analysis = useWidgetAnalysis('customer_visit', storeId, data);

  if (isLoading && !data) {
    return (
      <WidgetWrapper title={WIDGET_TITLE} editMode={editMode} onRemove={onRemove}>
        <div className="p-3"><SkeletonCard /></div>
      </WidgetWrapper>
    );
  }

  if (isError || !data) {
    return (
      <WidgetWrapper title={WIDGET_TITLE} editMode={editMode} onRemove={onRemove} onRefresh={refresh}>
        <div className="p-3"><EmptyState reason="고객 방문 데이터를 불러오지 못했습니다." /></div>
      </WidgetWrapper>
    );
  }

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
      title={WIDGET_TITLE}
      editMode={editMode}
      onRemove={onRemove}
      onRefresh={refresh}
      updatedAt={updatedAt}
    >
      {data.totalCustomers === 0 && data.thisMonthVisitors === 0 ? (
        <div className="p-3">
          <EmptyState
            reason="고객·방문 데이터가 없습니다."
            hints={['POS 고객 연동', 'pos_customer_sales 수집']}
          />
        </div>
      ) : data ? (
        <div className="h-full p-3 flex flex-col gap-2.5 justify-center">
          {data.evidenceSummary && (
            <SalesEvidenceLine
              summary={data.evidenceSummary}
              detail={data.evidenceDetail}
              salesLink={data.salesHint}
              compact
            />
          )}

          {/* 주 비교: 당월·전월·전년 동월 동일 기간 객수 */}
          <div className="rounded-xl border border-teal-500/30 bg-teal-950/20 p-3">
            <p className="text-[10px] font-semibold text-teal-300/90 mb-2">
              동일 기간 객수 ({data.mtdPeriodLabel})
            </p>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[10px] text-slate-500">
                  {data.thisMonthLabel} {data.mtdPeriodLabel}
                </p>
                <p className="text-2xl font-bold text-slate-100 tabular-nums">
                  {data.thisMonthVisitors.toLocaleString()}
                  <span className="text-sm font-normal text-slate-500 ml-1">명</span>
                </p>
                <p className="text-[10px] text-slate-400 mt-1">
                  {data.prevMonthLabel} {data.mtdPeriodLabel}{' '}
                  <strong className="text-slate-300 tabular-nums">
                    {data.prevMonthSamePeriodVisitors.toLocaleString()}명
                  </strong>
                </p>
                <p className="text-[10px] text-slate-400">
                  {data.prevYearMonthLabel} {data.mtdPeriodLabel}{' '}
                  <strong className="text-slate-300 tabular-nums">
                    {data.prevYearSamePeriodVisitors.toLocaleString()}명
                  </strong>
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <div className={`flex flex-col items-end ${directionColor}`}>
                  <DirectionIcon className="w-5 h-5" />
                  <ChangeBadge
                    value={data.visitorChangePct}
                    label="전월"
                  />
                </div>
                <ChangeBadge
                  value={data.visitorYoYChangePct}
                  label="전년"
                />
              </div>
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
                {data.prevMonthLabel} 동일 {data.prevMonthSamePeriodVisitRate != null ? `${data.prevMonthSamePeriodVisitRate}%` : '-'}
              </p>
              <p className="text-[9px] text-slate-500">
                {data.prevYearMonthLabel} 동일 {data.prevYearSamePeriodVisitRate != null ? `${data.prevYearSamePeriodVisitRate}%` : '-'}
              </p>
              <ChangeBadge value={data.visitRateChangePct} label="전월" size="xs" />
              <ChangeBadge value={data.visitRateYoYChangePct} label="전년" size="xs" />
            </div>
            <div className="bg-slate-800/50 rounded-lg p-2 border border-slate-700/40">
              <p className="text-[9px] text-slate-500">방문 횟수</p>
              <p className="text-lg font-bold text-slate-200 tabular-nums">
                {data.thisMonthVisits.toLocaleString()}
              </p>
              <p className="text-[9px] text-slate-500">
                {data.prevMonthLabel} 동일 {data.prevMonthSamePeriodVisits.toLocaleString()}회
              </p>
              <p className="text-[9px] text-slate-500">
                {data.prevYearMonthLabel} 동일 {data.prevYearSamePeriodVisits.toLocaleString()}회
              </p>
              <ChangeBadge value={data.visitTxChangePct} label="전월" size="xs" />
              <ChangeBadge value={data.visitTxYoYChangePct} label="전년" size="xs" />
            </div>
          </div>

          {/* 보조: 전월·전년 동월 전체 (작게) */}
          <div className="rounded-lg border border-slate-700/30 bg-slate-900/40 px-2.5 py-2 space-y-1.5">
            <p className="text-[9px] text-slate-500 mb-1">참고 · 전월·전년 동월 전체</p>
            <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500">
              <span>
                {data.thisMonthLabel} {data.mtdPeriodLabel}{' '}
                <span className="text-slate-400 tabular-nums">{data.thisMonthVisitors.toLocaleString()}명</span>
              </span>
              <span className="text-slate-600">vs</span>
              <span>
                {data.prevMonthLabel} 전체{' '}
                <span className="text-slate-400 tabular-nums">{data.prevMonthFullVisitors.toLocaleString()}명</span>
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500">
              <span>
                {data.thisMonthLabel} {data.mtdPeriodLabel}{' '}
                <span className="text-slate-400 tabular-nums">{data.thisMonthVisitors.toLocaleString()}명</span>
              </span>
              <span className="text-slate-600">vs</span>
              <span>
                {data.prevYearMonthLabel} 전체{' '}
                <span className="text-slate-400 tabular-nums">{data.prevYearFullVisitors.toLocaleString()}명</span>
              </span>
            </div>
          </div>

          {(data.visitRateChange != null || data.visitRateYoYChange != null) && (
            <div className="text-[10px] text-center space-y-0.5">
              {data.visitRateChange != null && (
                <p className={directionColor}>
                  전월 동일기간 방문률 {data.visitRateChange > 0 ? '+' : ''}{data.visitRateChange}%p
                  {' '}
                  ({data.direction === 'up' ? '증가' : data.direction === 'down' ? '감소' : '유지'})
                </p>
              )}
              {data.visitRateYoYChange != null && (
                <p className="text-slate-400">
                  전년 동월 동일기간 방문률 {data.visitRateYoYChange > 0 ? '+' : ''}{data.visitRateYoYChange}%p
                </p>
              )}
            </div>
          )}
          <WidgetAnalysisPanel analysis={analysis} />
        </div>
      ) : null}
    </WidgetWrapper>
  );
}

export default function CustomerVisitWidget({
  editMode, onRemove, storeId,
}: {
  editMode: boolean;
  onRemove: () => void;
  storeId?: string;
}) {
  if (!storeId) {
    return (
      <WidgetWrapper title={WIDGET_TITLE} editMode={editMode} onRemove={onRemove}>
        <div className="p-3">
          <EmptyState reason="매장이 선택되지 않았습니다." />
        </div>
      </WidgetWrapper>
    );
  }

  return <CustomerVisitWidgetContent editMode={editMode} onRemove={onRemove} storeId={storeId} />;
}
