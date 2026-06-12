'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import WidgetWrapper from './WidgetWrapper';
import { getKSTTodayYMD } from '@/lib/dateUtils';
import { useSalesCategories } from '@/lib/queries';
import WidgetAnalysisPanel from './WidgetAnalysisPanel';
import { useWidgetAnalysis } from '@/hooks/useWidgetAnalysis';

interface ChartRow {
  key: string;
  label: string;
  color: string;
  amount: number;
  pct: number;
}

export default function SalesCategoryWidget({
  editMode, onRemove, storeId,
}: {
  editMode: boolean;
  onRemove: () => void;
  storeId?: string;
}) {
  const date = getKSTTodayYMD();
  const { data, isLoading, isError, refetch, error } = useSalesCategories(storeId || '', date, !!storeId);
  const chart = (data?.chart || []) as ChartRow[];
  const totalAmount = data?.totalAmount || 0;
  const emptyReason = data?.emptyReason || null;
  const analysis = useWidgetAnalysis('sales_category', storeId || undefined, data ? { chart, totalAmount } : undefined);

  return (
    <WidgetWrapper
      title="카테고리별 매출"
      editMode={editMode}
      onRemove={onRemove}
      loading={isLoading}
      error={isError ? (error instanceof Error ? error.message : '카테고리 매출을 불러오지 못했습니다') : null}
      onRefresh={() => void refetch()}
    >
      {emptyReason ? (
        <p className="text-slate-500 text-xs px-1">{emptyReason}</p>
      ) : chart.length === 0 ? (
        <p className="text-slate-500 text-xs px-1">당일 분류 가능한 매출이 없습니다</p>
      ) : (
        <div className="flex flex-col gap-2 h-full min-h-[140px]">
          <div className="flex-1 min-h-[100px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chart}
                  dataKey="amount"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  innerRadius={28}
                  outerRadius={48}
                  paddingAngle={2}
                >
                  {chart.map(row => (
                    <Cell key={row.key} fill={row.color} stroke="#0f172a" strokeWidth={1} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number, _name, props) => [
                    `${Number(value).toLocaleString()}원 (${(props?.payload as ChartRow)?.pct ?? 0}%)`,
                    (props?.payload as ChartRow)?.label,
                  ]}
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-400">
            {chart.map(row => (
              <span key={row.key} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ background: row.color }} />
                {row.label} {row.pct}%
              </span>
            ))}
          </div>
          <p className="text-xs text-slate-500 border-t border-slate-800 pt-1">
            합계 {totalAmount.toLocaleString()}원
          </p>
          <WidgetAnalysisPanel analysis={analysis} />
        </div>
      )}
    </WidgetWrapper>
  );
}
