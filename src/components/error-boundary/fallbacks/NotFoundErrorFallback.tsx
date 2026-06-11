'use client';

import { SearchX, Home, RotateCcw } from 'lucide-react';
import Link from 'next/link';

interface FallbackProps {
  message: string;
  onRetry?: () => void;
  compact?: boolean;
}

export default function NotFoundErrorFallback({ message, onRetry, compact }: FallbackProps) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? 'p-4 gap-2' : 'p-8 gap-4'}`}>
      <SearchX className={`text-slate-400 ${compact ? 'w-5 h-5' : 'w-10 h-10'}`} />
      <div>
        <p className={`font-semibold text-slate-200 ${compact ? 'text-xs' : 'text-base'}`}>리소스를 찾을 수 없음</p>
        <p className={`text-slate-500 mt-1 ${compact ? 'text-[10px]' : 'text-sm'}`}>{message}</p>
      </div>
      <div className="flex items-center gap-2">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className={`inline-flex items-center gap-1.5 rounded-lg bg-teal-600/20 border border-teal-500/30 text-teal-300 hover:bg-teal-600/30 transition-colors ${
              compact ? 'px-2.5 py-1 text-[10px]' : 'px-4 py-2 text-sm'
            }`}
          >
            <RotateCcw className={compact ? 'w-3 h-3' : 'w-4 h-4'} />
            재시도
          </button>
        )}
        <Link
          href="/dashboard"
          className={`inline-flex items-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors ${
            compact ? 'px-2.5 py-1 text-[10px]' : 'px-4 py-2 text-sm'
          }`}
        >
          <Home className={compact ? 'w-3 h-3' : 'w-4 h-4'} /> 홈으로
        </Link>
      </div>
    </div>
  );
}
