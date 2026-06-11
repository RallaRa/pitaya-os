'use client';

import type { ReactNode } from 'react';
import type { FunnelDirection } from '@/hooks/useFunnel';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface FunnelShellProps {
  title: string;
  steps: readonly string[];
  currentStep: number;
  direction: FunnelDirection;
  error?: string | null;
  isFirst?: boolean;
  isLast?: boolean;
  submitting?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  onComplete?: () => void;
  children: ReactNode;
  completeLabel?: string;
  nextLabel?: string;
}

export default function FunnelShell({
  title,
  steps,
  currentStep,
  direction,
  error,
  isFirst,
  isLast,
  submitting,
  onPrev,
  onNext,
  onComplete,
  children,
  completeLabel = '완료',
  nextLabel = '다음',
}: FunnelShellProps) {
  const slideClass =
    direction === 'forward'
      ? 'funnel-slide-forward'
      : direction === 'back'
        ? 'funnel-slide-back'
        : '';

  return (
    <div className="flex flex-col h-full min-h-0 bg-slate-950 text-slate-100">
      <div className="shrink-0 px-5 py-4 border-b border-slate-800 bg-slate-900/60">
        <h2 className="text-sm font-bold text-teal-400">{title}</h2>
        <div className="flex items-center gap-1 mt-3 overflow-x-auto">
          {steps.map((label, i) => {
            const n = i + 1;
            const active = n === currentStep;
            const done = n < currentStep;
            return (
              <div key={label} className="flex items-center gap-1 shrink-0">
                <div
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium border ${
                    active
                      ? 'bg-teal-600/20 border-teal-500/40 text-teal-300'
                      : done
                        ? 'bg-slate-800 border-slate-700 text-slate-400'
                        : 'bg-slate-900 border-slate-800 text-slate-600'
                  }`}
                >
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] ${
                    active ? 'bg-teal-500 text-black' : done ? 'bg-slate-700' : 'bg-slate-800'
                  }`}>
                    {n}
                  </span>
                  {label}
                </div>
                {i < steps.length - 1 && <ChevronRight className="w-3 h-3 text-slate-700" />}
              </div>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="mx-5 mt-3 px-3 py-2 rounded-lg bg-red-950/40 border border-red-500/30 text-red-300 text-xs">
          {error}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
        <div key={currentStep} className={`funnel-step-panel ${slideClass}`}>
          {children}
        </div>
      </div>

      <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-4 border-t border-slate-800 bg-slate-900/40 safe-bottom">
        <button
          type="button"
          onClick={onPrev}
          disabled={isFirst || submitting}
          className="inline-flex items-center gap-1 px-3 py-2 text-xs rounded-lg border border-slate-700 text-slate-300 disabled:opacity-40 hover:bg-slate-800 transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          이전
        </button>
        {isLast ? (
          <button
            type="button"
            onClick={onComplete}
            disabled={submitting}
            className="inline-flex items-center gap-1 px-4 py-2 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-500 text-black disabled:opacity-50 transition-colors"
          >
            {submitting ? '처리 중…' : completeLabel}
          </button>
        ) : (
          <button
            type="button"
            onClick={onNext}
            disabled={submitting}
            className="inline-flex items-center gap-1 px-4 py-2 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-500 text-black disabled:opacity-50 transition-colors"
          >
            {nextLabel}
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
