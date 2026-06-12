'use client';

import { useState } from 'react';
import { OctagonX } from 'lucide-react';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';

export default function StockEmergencyFab({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  const [busy, setBusy] = useState(false);

  const emergencyStop = async () => {
    if (busy) return;
    if (!window.confirm('자동매매를 긴급 중단할까요?')) return;
    setBusy(true);
    try {
      const headers = await getAuthJsonHeaders();
      await fetch('/api/stock/master', {
        method: 'POST',
        headers,
        body: JSON.stringify({ enabled: false }),
      });
      onToggle();
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void emergencyStop()}
      disabled={busy || !enabled}
      className="fixed bottom-20 right-4 z-50 md:bottom-6 md:right-6 flex items-center gap-2 px-4 py-3 rounded-full bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white text-sm font-bold shadow-lg shadow-red-900/40"
      aria-label="긴급 중단"
    >
      <OctagonX className="w-5 h-5" />
      긴급 중단
    </button>
  );
}
