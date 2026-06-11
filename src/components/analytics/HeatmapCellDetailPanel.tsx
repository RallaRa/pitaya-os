'use client';

import { X } from 'lucide-react';
import { formatManwon, type HeatmapCellDetail } from '@/lib/salesHeatmapCalc';

export default function HeatmapCellDetailPanel({
  detail,
  onClose,
}: {
  detail: HeatmapCellDetail;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-sm bg-slate-900 border-l border-slate-800 shadow-2xl z-50 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <h3 className="text-sm font-semibold text-slate-100">
          {detail.dowLabel}요일 {detail.hour}~{detail.hour + 1}시
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="평균 매출" value={formatManwon(detail.avgSales)} highlight />
          <Stat label="누적 매출" value={formatManwon(detail.totalSales)} />
          <Stat label="표본 일수" value={`${detail.dayCount}일`} />
          <Stat label="거래 건수" value={`${detail.tranCount.toLocaleString()}건`} />
        </div>

        <div className="bg-slate-800/50 rounded-xl p-3 space-y-2 text-xs">
          <p className="text-slate-500">비교</p>
          <p className="text-slate-300">
            동 시간대 요일 평균 대비{' '}
            <span className={detail.vsHourAvgPct >= 0 ? 'text-teal-400' : 'text-red-400'}>
              {detail.vsHourAvgPct >= 0 ? '+' : ''}{detail.vsHourAvgPct}%
            </span>
          </p>
          <p className="text-slate-300">
            전체 시간대 평균 대비{' '}
            <span className={detail.vsOverallAvgPct >= 0 ? 'text-teal-400' : 'text-red-400'}>
              {detail.vsOverallAvgPct >= 0 ? '+' : ''}{detail.vsOverallAvgPct}%
            </span>
          </p>
        </div>

        {detail.peakDates.length > 0 && (
          <div>
            <p className="text-xs text-slate-500 mb-2">매출 TOP 일자</p>
            <ul className="space-y-1">
              {detail.peakDates.map(p => (
                <li key={p.date} className="flex justify-between text-xs text-slate-300 bg-slate-800/40 rounded-lg px-3 py-2">
                  <span>{p.date}</span>
                  <span className="text-teal-300">{formatManwon(p.sales)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="bg-slate-800/40 rounded-xl p-3">
      <p className="text-[10px] text-slate-500 mb-0.5">{label}</p>
      <p className={`font-semibold ${highlight ? 'text-teal-300' : 'text-slate-200'}`}>{value}</p>
    </div>
  );
}
