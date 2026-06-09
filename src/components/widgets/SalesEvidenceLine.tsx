'use client';

import { ChevronDown, ChevronUp, HelpCircle } from 'lucide-react';

export default function SalesEvidenceLine({
  summary,
  detail,
  salesLink,
  className = '',
  compact = false,
}: {
  summary: string;
  detail?: string;
  salesLink?: string;
  className?: string;
  /** 카드 하단 등 좁은 공간 */
  compact?: boolean;
}) {
  const expandDetail = (detail && detail.trim() !== summary.trim()) ? detail.trim() : '';
  const hasExpand = !!expandDetail || !!salesLink;

  if (!summary.trim()) return null;

  if (!hasExpand) {
    return (
      <p
        className={`text-slate-500 leading-snug ${compact ? 'text-[9px]' : 'text-[10px]'} ${className}`}
        title={summary}
      >
        {summary}
      </p>
    );
  }

  const tooltipText = [expandDetail || summary, salesLink ? `매출: ${salesLink}` : '']
    .filter(Boolean)
    .join('\n');

  return (
    <details className={`group/ev ${className}`}>
      <summary
        className={`text-slate-500 cursor-pointer select-none list-none flex items-start gap-0.5 hover:text-slate-400 [&::-webkit-details-marker]:hidden ${compact ? 'text-[9px]' : 'text-[10px]'} leading-snug`}
        title={tooltipText.slice(0, 280)}
      >
        <HelpCircle className="w-2.5 h-2.5 shrink-0 opacity-60 mt-px" aria-hidden />
        <span className="flex-1 min-w-0 line-clamp-2">{summary}</span>
        <ChevronDown className="w-2.5 h-2.5 shrink-0 mt-px group-open/ev:hidden" aria-hidden />
        <ChevronUp className="w-2.5 h-2.5 shrink-0 mt-px hidden group-open/ev:inline" aria-hidden />
      </summary>
      <div className={`mt-1 pl-3.5 border-l border-slate-700/50 space-y-0.5 ${compact ? 'text-[9px]' : 'text-[10px]'} text-slate-500 leading-relaxed`}>
        {expandDetail && <p>{expandDetail}</p>}
        {salesLink && (
          <p className="text-teal-500/80">→ 매출: {salesLink}</p>
        )}
      </div>
    </details>
  );
}
