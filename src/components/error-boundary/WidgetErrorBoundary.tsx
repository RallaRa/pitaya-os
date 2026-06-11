'use client';

import { AlertCircle, RotateCcw } from 'lucide-react';
import ErrorBoundary from './ErrorBoundary';
import ErrorFallback from './ErrorFallback';
import type { ClassifiedError } from './types';

interface WidgetErrorBoundaryProps {
  children: React.ReactNode;
  widgetName?: string;
  userId?: string | null;
}

export default function WidgetErrorBoundary({
  children,
  widgetName,
  userId,
}: WidgetErrorBoundaryProps) {
  return (
    <ErrorBoundary
      userId={userId}
      compact
      fallback={(error: ClassifiedError, retry) => (
        <div className="flex flex-col h-full min-h-[8rem] bg-slate-900 rounded-2xl border border-red-500/20 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-800/60 shrink-0">
            <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
            <span className="text-slate-300 text-xs font-semibold flex-1 truncate">
              {widgetName ? `${widgetName} 오류` : '위젯 오류'}
            </span>
            <button
              type="button"
              onClick={retry}
              className="inline-flex items-center gap-1 text-[10px] text-teal-400 hover:text-teal-300"
            >
              <RotateCcw className="w-3 h-3" /> 재시도
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <ErrorFallback error={error} onRetry={retry} compact />
          </div>
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}
