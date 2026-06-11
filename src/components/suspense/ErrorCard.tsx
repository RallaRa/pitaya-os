'use client';

import { AlertCircle, RotateCcw } from 'lucide-react';
import ErrorFallback from '@/components/error-boundary/ErrorFallback';
import { classifyError } from '@/components/error-boundary/classifyError';

interface ErrorCardProps {
  error: Error;
  onRetry?: () => void;
  compact?: boolean;
}

/** Suspense + ErrorBoundary 조합용 위젯 에러 카드 */
export default function ErrorCard({ error, onRetry, compact = true }: ErrorCardProps) {
  const classified = classifyError(error);

  return (
    <div className={`flex flex-col bg-slate-900 rounded-2xl border border-red-500/20 overflow-hidden ${compact ? 'min-h-[8rem]' : 'min-h-[12rem]'}`}>
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-800/60">
        <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
        <span className="text-slate-300 text-xs font-semibold flex-1">데이터를 불러오지 못했습니다</span>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1 text-[10px] text-teal-400 hover:text-teal-300"
          >
            <RotateCcw className="w-3 h-3" />
            재시도
          </button>
        )}
      </div>
      <ErrorFallback error={classified} onRetry={onRetry} compact={compact} />
    </div>
  );
}
