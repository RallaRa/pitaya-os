'use client';

import { useState, useEffect } from 'react';
import { getAuthHeaders } from '@/lib/getAuthHeaders';

export default function DailyBriefingBar({ storeId }: { storeId: string }) {
  const [summary, setSummary] = useState<string | null>(null);

  useEffect(() => {
    if (!storeId) return;
    getAuthHeaders()
      .then(headers => fetch(`/api/dashboard/comprehensive-opinion?storeId=${encodeURIComponent(storeId)}`, { headers }))
      .then(r => r.json())
      .then(d => {
        const text = d.summary || d.opinion || d.text;
        if (text) setSummary(String(text).slice(0, 120));
      })
      .catch(() => {});
  }, [storeId]);

  if (!summary) return null;

  return (
    <div className="mx-4 mt-2 mb-0 px-4 py-2 bg-teal-950/40 border border-teal-800/40 rounded-xl text-xs text-teal-200/90 truncate shrink-0">
      💡 {summary}…
    </div>
  );
}
