'use client';

interface Props {
  startDate?: string;
  endDate?: string;
  asOf?: string;
  onStartDateChange?: (v: string) => void;
  onEndDateChange?: (v: string) => void;
  onAsOfChange?: (v: string) => void;
  showAsOf?: boolean;
}

export default function AccountingDateFilters({
  startDate,
  endDate,
  asOf,
  onStartDateChange,
  onEndDateChange,
  onAsOfChange,
  showAsOf,
}: Props) {
  return (
    <div className="flex flex-wrap items-end gap-3 mb-4">
      {startDate !== undefined && onStartDateChange && (
        <label className="text-[10px] text-slate-500">
          시작일
          <input
            type="date"
            value={startDate}
            onChange={e => onStartDateChange(e.target.value)}
            className="block mt-1 px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white"
          />
        </label>
      )}
      {endDate !== undefined && onEndDateChange && (
        <label className="text-[10px] text-slate-500">
          종료일
          <input
            type="date"
            value={endDate}
            onChange={e => onEndDateChange(e.target.value)}
            className="block mt-1 px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white"
          />
        </label>
      )}
      {showAsOf && asOf !== undefined && onAsOfChange && (
        <label className="text-[10px] text-slate-500">
          기준일
          <input
            type="date"
            value={asOf}
            onChange={e => onAsOfChange(e.target.value)}
            className="block mt-1 px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white"
          />
        </label>
      )}
    </div>
  );
}
