'use client';

import { RefreshCw, X, AlertCircle } from 'lucide-react';

interface Props {
  title: string;
  editMode: boolean;
  onRemove: () => void;
  onRefresh?: () => void;
  updatedAt?: Date | null;
  loading?: boolean;
  error?: string | null;
  children: React.ReactNode;
  className?: string;
  /** false면 고정 높이 대신 내용만큼 늘어남 (모바일 AI 예측 등) */
  autoHeight?: boolean;
}

export default function WidgetWrapper({
  title, editMode, onRemove, onRefresh, updatedAt,
  loading, error, children, className = '', autoHeight = false,
}: Props) {
  const timeLabel = updatedAt
    ? `${updatedAt.getFullYear()}.${String(updatedAt.getMonth() + 1).padStart(2, '0')}.${String(updatedAt.getDate()).padStart(2, '0')} ${updatedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`
    : '';

  return (
    <div
      className={`flex flex-col bg-slate-900 rounded-2xl border transition-colors ${
        autoHeight ? 'h-auto min-h-0' : 'h-full overflow-hidden'
      } ${
        editMode ? 'border-dashed border-slate-600' : 'border-slate-800/60'
      } ${className}`}
    >
      {/* 헤더 */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-800/60 shrink-0">
        <span className="text-slate-300 text-xs font-semibold flex-1 truncate">{title}</span>
        {timeLabel && <span className="text-slate-600 text-[9px] shrink-0">{timeLabel}</span>}
        {onRefresh && !editMode && (
          <button
            onClick={onRefresh}
            disabled={loading}
            className="p-1 text-slate-600 hover:text-teal-400 transition-colors shrink-0"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin text-teal-400' : ''}`} />
          </button>
        )}
        {editMode && (
          <button
            onClick={onRemove}
            className="p-1 text-slate-600 hover:text-red-400 transition-colors shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* 본문 */}
      <div className={`relative ${autoHeight ? 'flex-none' : 'flex-1 overflow-hidden'}`}>
        {loading ? (
          <div className="p-3 space-y-2 h-full">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-4 bg-slate-800 rounded animate-pulse" style={{ width: `${70 + i * 5}%` }} />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-500 p-4">
            <AlertCircle className="w-5 h-5 text-red-500/70" />
            <p className="text-xs text-center">{error}</p>
            {onRefresh && (
              <button onClick={onRefresh} className="text-xs text-teal-400 hover:text-teal-300">
                재시도
              </button>
            )}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
