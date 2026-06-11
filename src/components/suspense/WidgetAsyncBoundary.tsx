'use client';

import { Suspense, type ReactNode } from 'react';
import WidgetErrorBoundary from '@/components/error-boundary/WidgetErrorBoundary';
import SkeletonWidget from './SkeletonWidget';
import SkeletonCard from './SkeletonCard';
import SkeletonTable from './SkeletonTable';
import SkeletonChart from './SkeletonChart';

export type WidgetSkeletonVariant = 'widget' | 'card' | 'table' | 'chart';

function SkeletonFallback({ variant }: { variant: WidgetSkeletonVariant }) {
  switch (variant) {
    case 'card':
      return (
        <div className="h-full min-h-[8rem] bg-slate-900 rounded-2xl border border-slate-800/60 overflow-hidden">
          <SkeletonCard />
        </div>
      );
    case 'table':
      return (
        <div className="h-full min-h-[8rem] bg-slate-900 rounded-2xl border border-slate-800/60 overflow-hidden">
          <SkeletonTable />
        </div>
      );
    case 'chart':
      return (
        <div className="h-full min-h-[8rem] bg-slate-900 rounded-2xl border border-slate-800/60 overflow-hidden">
          <SkeletonChart />
        </div>
      );
    default:
      return <SkeletonWidget />;
  }
}

interface WidgetAsyncBoundaryProps {
  children: ReactNode;
  skeleton?: WidgetSkeletonVariant;
  widgetName?: string;
  userId?: string | null;
}

/** ErrorBoundary + Suspense 통일 패턴 */
export default function WidgetAsyncBoundary({
  children,
  skeleton = 'widget',
  widgetName,
  userId,
}: WidgetAsyncBoundaryProps) {
  return (
    <WidgetErrorBoundary widgetName={widgetName} userId={userId}>
      <Suspense fallback={<SkeletonFallback variant={skeleton} />}>
        {children}
      </Suspense>
    </WidgetErrorBoundary>
  );
}
