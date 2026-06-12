'use client';

import { Lightbulb, TrendingUp } from 'lucide-react';
import type { WidgetAnalysisBlock } from '@/lib/widgetPerformanceAnalysis';

export default function WidgetAnalysisPanel({
  analysis,
  compact = true,
  className = '',
}: {
  analysis: WidgetAnalysisBlock | null | undefined;
  compact?: boolean;
  className?: string;
}) {
  if (!analysis) return null;
  const { prediction, suggestions, basis } = analysis;
  if (!prediction && !suggestions.length) return null;

  const textSize = compact ? 'text-[9px]' : 'text-[10px]';

  return (
    <div
      className={`mt-2 pt-2 border-t border-slate-700/50 space-y-1.5 shrink-0 ${className}`}
    >
      {prediction && (
        <div className={`flex items-start gap-1 ${textSize} text-blue-200/90 leading-snug`}>
          <TrendingUp className="w-3 h-3 shrink-0 text-blue-400 mt-px" aria-hidden />
          <span><span className="text-blue-400/80 font-medium">예측 </span>{prediction}</span>
        </div>
      )}
      {suggestions.length > 0 && (
        <ul className={`space-y-0.5 ${textSize} text-amber-200/80`}>
          {suggestions.map((s, i) => (
            <li key={i} className="flex items-start gap-1 leading-snug">
              <Lightbulb className="w-2.5 h-2.5 shrink-0 text-amber-400/70 mt-px" aria-hidden />
              <span>{s}</span>
            </li>
          ))}
        </ul>
      )}
      {basis && (
        <p className={`${textSize} text-slate-600 truncate`} title={basis}>
          근거: {basis}
        </p>
      )}
    </div>
  );
}
