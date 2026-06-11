'use client';

import { Inbox } from 'lucide-react';
import WidgetEmptyReason from '@/components/widgets/WidgetEmptyReason';

interface EmptyStateProps {
  reason: string;
  hints?: string[];
  className?: string;
  compact?: boolean;
}

/** 대시보드·위젯 공통 empty state */
export default function EmptyState({ reason, hints, className, compact }: EmptyStateProps) {
  if (compact) {
    return (
      <div className={`flex flex-col items-center justify-center text-center py-8 px-4 ${className ?? ''}`}>
        <Inbox className="w-8 h-8 text-slate-600 mb-2" />
        <p className="text-xs text-slate-500 leading-relaxed whitespace-pre-wrap">{reason}</p>
      </div>
    );
  }

  return <WidgetEmptyReason reason={reason} hints={hints} className={className} />;
}
