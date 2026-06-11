'use client';

import { RefObject, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { RefreshCw, X, AlertCircle, Maximize2 } from 'lucide-react';

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
  autoHeight?: boolean;
  rootRef?: RefObject<HTMLDivElement | null>;
  allowFullscreen?: boolean;
}

export default function WidgetWrapper({
  title, editMode, onRemove, onRefresh, updatedAt,
  loading, error, children, className = '', autoHeight = false, rootRef,
  allowFullscreen = true,
}: Props) {
  const [fullscreen, setFullscreen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  const timeLabel = updatedAt
    ? `${updatedAt.getFullYear()}.${String(updatedAt.getMonth() + 1).padStart(2, '0')}.${String(updatedAt.getDate()).padStart(2, '0')} ${updatedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`
    : '';

  const card = (
    <div
      ref={rootRef}
      className={`flex flex-col bg-slate-900 rounded-2xl border transition-colors ${
        autoHeight ? 'h-auto min-h-0' : 'h-full overflow-hidden'
      } ${editMode ? 'border-dashed border-slate-600' : 'border-slate-800/60'} ${className}`}
    >
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-800/60 shrink-0">
        <span className="text-slate-300 text-xs font-semibold flex-1 truncate">{title}</span>
        {timeLabel && <span className="text-slate-600 text-[9px] shrink-0">{timeLabel}</span>}
        {onRefresh && !editMode && (
          <button onClick={onRefresh} disabled={loading} className="p-1 text-slate-600 hover:text-teal-400 transition-colors shrink-0">
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin text-teal-400' : ''}`} />
          </button>
        )}
        {allowFullscreen && !editMode && !loading && !error && (
          <button onClick={() => setFullscreen(true)} className="p-1 text-slate-600 hover:text-teal-400 transition-colors shrink-0" title="전체화면">
            <Maximize2 className="w-3 h-3" />
          </button>
        )}
        {editMode && (
          <button onClick={onRemove} className="p-1 text-slate-600 hover:text-red-400 transition-colors shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <div className={`relative min-h-0 ${autoHeight ? 'flex-none' : 'flex-1 overflow-hidden flex flex-col'}`}>
        {loading ? (
          <div className={`p-3 space-y-2 ${autoHeight ? 'min-h-[5rem]' : 'h-full'}`}>
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-4 bg-slate-800 rounded animate-pulse" style={{ width: `${70 + i * 5}%` }} />
            ))}
          </div>
        ) : error ? (
          <div className={`flex flex-col items-center justify-center gap-2 text-slate-500 p-4 ${autoHeight ? 'min-h-[5rem]' : 'h-full'}`}>
            <AlertCircle className="w-5 h-5 text-red-500/70" />
            <p className="text-xs text-center">{error}</p>
            {onRefresh && <button onClick={onRefresh} className="text-xs text-teal-400 hover:text-teal-300">재시도</button>}
          </div>
        ) : (
          <div className={autoHeight ? 'flex flex-col' : 'h-full min-h-0 flex flex-col'}>{children}</div>
        )}
      </div>
    </div>
  );

  if (fullscreen && mounted) {
    return (
      <>
        <div className="opacity-0 pointer-events-none h-full">{card}</div>
        {createPortal(
          <div className="fixed inset-0 z-[200] flex flex-col bg-slate-950 p-3 sm:p-6">
            <div className="flex items-center gap-2 mb-3 shrink-0">
              <span className="text-slate-200 text-sm font-semibold flex-1">{title}</span>
              <button onClick={() => setFullscreen(false)} className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg">닫기 (Esc)</button>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">{card}</div>
          </div>,
          document.body,
        )}
      </>
    );
  }

  return card;
}
