'use client';

import { useEffect, useState } from 'react';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';

interface FeedItem {
  id: string;
  type?: string;
  ticker?: string;
  name?: string;
  price?: number;
  quantity?: number;
  status?: string;
  aiReason?: string;
  executedAt?: string;
}

export default function StockTradeFeed() {
  const [items, setItems] = useState<FeedItem[]>([]);

  useEffect(() => {
    void (async () => {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/stock/feed', { headers });
      if (res.ok) {
        const json = await res.json();
        setItems(json.orders || []);
      }
    })();
  }, []);

  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 overflow-hidden">
      <p className="px-4 py-3 text-sm font-medium text-slate-300 bg-slate-900/80 border-b border-slate-800">
        실시간 매매 피드
      </p>
      <ul className="max-h-64 overflow-y-auto divide-y divide-slate-800/60">
        {items.length === 0 ? (
          <li className="px-4 py-6 text-center text-slate-500 text-xs">체결 내역 없음</li>
        ) : (
          items.map(item => (
            <li key={item.id} className="px-4 py-3 text-xs">
              <div className="flex justify-between gap-2">
                <span className={item.type === 'buy' ? 'text-teal-400' : 'text-amber-400'}>
                  {item.type?.toUpperCase()} {item.name || item.ticker}
                </span>
                <span className="text-slate-500">
                  {item.executedAt ? new Date(item.executedAt).toLocaleTimeString('ko-KR') : ''}
                </span>
              </div>
              <p className="text-slate-400 mt-1 truncate">{item.aiReason}</p>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
