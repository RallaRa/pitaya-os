'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Compass } from 'lucide-react';
import { getAuthHeaders } from '@/lib/getAuthHeaders';

export default function WeeklyCoachingBar({ storeId }: { storeId: string }) {
  const [summary, setSummary] = useState<string | null>(null);
  const [weekLabel, setWeekLabel] = useState('');

  useEffect(() => {
    if (!storeId) return;
    getAuthHeaders()
      .then(headers => fetch(`/api/dashboard/weekly-coaching?storeId=${encodeURIComponent(storeId)}`, { headers }))
      .then(r => r.json())
      .then(d => {
        const b = d.briefing;
        if (b?.summary) {
          setSummary(String(b.summary).slice(0, 100));
          setWeekLabel(`${b.periodStart?.slice(5)}~${b.periodEnd?.slice(5)}`);
        }
      })
      .catch(() => {});
  }, [storeId]);

  if (!summary) return null;

  return (
    <Link
      href="/dashboard/analytics/coaching"
      className="mx-4 mt-1 mb-0 px-4 py-2 bg-slate-900/60 border border-slate-700/50 rounded-xl text-xs text-slate-300 hover:border-teal-500/40 flex items-center gap-2 shrink-0"
    >
      <Compass className="w-3.5 h-3.5 text-teal-400 shrink-0" />
      <span className="truncate">
        <span className="text-teal-400/90">주간 코치 {weekLabel}</span>
        {' · '}{summary}…
      </span>
    </Link>
  );
}
