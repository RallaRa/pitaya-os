'use client';

import { useCallback, useEffect, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import WidgetWrapper from './WidgetWrapper';
import { getAuthHeaders } from '@/lib/getAuthHeaders';
import { getKSTTodayYMD } from '@/lib/dateUtils';

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
  const [chart, setChart] = useState<ChartRow[]>([]);
  const [totalAmount, setTotalAmount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [emptyReason, setEmptyReason] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!storeId) {
      setLoading(false);
      return;
    }
    try {
      const headers = await getAuthHeaders();
      const date = getKSTTodayYMD();
      const res = await fetch(
        `/api/dashboard/sales-categories?storeId=${encodeURIComponent(storeId)}&date=${date}`,
        { headers },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '조회 실패');
      setChart(data.chart || []);
      setTotalAmount(data.totalAmount || 0);
      setEmptyReason(data.emptyReason || null);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '카테고리 매출을 불러오지 못했습니다');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    setLoading(true);
    fetchData();
    const t = setInterval(fetchData, 60000);
    return () => clearInterval(t);
  }, [fetchData]);

  return (
    <WidgetWrapper
      title="카테고리별 매출"
      editMode={editMode}
      onRemove={onRemove}
      loading={loading}
      error={error}
      onRefresh={fetchData}
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
        </div>
      )}
    </WidgetWrapper>
  );
}
