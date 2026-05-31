'use client';

import { AlertCircle } from 'lucide-react';

interface Props {
  reason: string;
  hints?: string[];
  className?: string;
}

/** 값이 비어 있을 때 메인 위젯에 표시하는 사유 안내 */
export default function WidgetEmptyReason({ reason, hints, className = '' }: Props) {
  return (
    <div
      className={`rounded-lg border border-amber-500/35 bg-amber-950/50 px-3 py-2.5 ${className}`}
      role="status"
    >
      <div className="flex items-start gap-2">
        <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold text-amber-300 uppercase tracking-wide">
            값이 표시되지 않는 이유
          </p>
          <p className="text-[11px] text-amber-100/90 leading-relaxed mt-1 whitespace-pre-wrap">
            {reason}
          </p>
          {hints && hints.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {hints.map((h, i) => (
                <li key={i} className="text-[10px] text-slate-500 leading-snug">
                  · {h}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
