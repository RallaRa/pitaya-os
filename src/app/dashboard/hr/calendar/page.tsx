'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { RefreshCw } from 'lucide-react';

const CalendarApp = dynamic(
  () => import('@/components/calendar/CalendarApp'),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full bg-slate-950">
        <RefreshCw className="w-6 h-6 text-slate-600 animate-spin" />
      </div>
    ),
  },
);

export default function HrCalendarPage() {
  return (
    <div className="h-full">
      <Suspense fallback={
        <div className="flex items-center justify-center h-full bg-slate-950">
          <RefreshCw className="w-6 h-6 text-slate-600 animate-spin" />
        </div>
      }>
        <CalendarApp />
      </Suspense>
    </div>
  );
}
