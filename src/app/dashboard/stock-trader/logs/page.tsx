'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';

interface OrderRow {
  id?: string;
  orderId?: string;
  type: string;
  ticker: string;
  name: string;
  quantity: number;
  price: number;
  status: string;
  executedAt: string;
  aiReason?: string;
}

export default function StockTraderLogsPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [fills, setFills] = useState<Array<{ symbol: string; name: string; side: string; qty: number; price: number; time: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'ai' | 'kis'>('ai');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await getAuthJsonHeaders();
      const session = localStorage.getItem('pitaya_stock_session_id');
      if (session) headers['x-stock-session'] = session;

      const [aiRes, fillRes] = await Promise.all([
        fetch('/api/stock/execute', { headers }),
        fetch('/api/stock-trader/kis/fills', { headers }),
      ]);
      const aiData = await aiRes.json();
      const fillData = await fillRes.json();
      setOrders(aiData.orders || []);
      setFills(fillData.fills || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-4 pb-24">
      <h1 className="text-lg font-bold text-white">주문 · 체결 로그</h1>

      <div className="flex gap-2">
        {(['ai', 'kis'] as const).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded text-xs ${tab === t ? 'bg-teal-800 text-white' : 'bg-slate-800 text-slate-400'}`}
          >
            {t === 'ai' ? 'AI/Firestore' : 'KIS 당일체결'}
          </button>
        ))}
      </div>

      {loading && <Loader2 className="w-5 h-5 animate-spin text-slate-400" />}

      {tab === 'ai' && (
        <div className="space-y-2">
          {orders.map(o => (
            <div key={o.orderId || o.id} className="rounded-lg border border-slate-700/60 bg-slate-900/40 px-3 py-2 text-xs">
              <p className="text-slate-300">
                <span className="text-slate-500">{o.executedAt?.slice(0, 19)}</span>
                {' · '}<strong className={o.type === 'buy' ? 'text-red-400' : 'text-blue-400'}>{o.type}</strong>
                {' · '}{o.name}({o.ticker}) {o.quantity}주 @ {o.price?.toLocaleString()}
                {' · '}<span className="text-slate-500">{o.status}</span>
              </p>
              {o.aiReason && <p className="text-slate-500 mt-1 truncate">{o.aiReason}</p>}
            </div>
          ))}
          {!loading && orders.length === 0 && <p className="text-slate-500 text-sm">AI 주문 로그 없음</p>}
        </div>
      )}

      {tab === 'kis' && (
        <div className="space-y-2">
          {fills.map((f, i) => (
            <div key={i} className="rounded-lg border border-slate-700/60 bg-slate-900/40 px-3 py-2 text-xs text-slate-300">
              {f.name}({f.symbol}) · {f.side === 'buy' ? '매수' : '매도'} · {f.qty}주 @ {f.price.toLocaleString()} · {f.time}
            </div>
          ))}
          {!loading && fills.length === 0 && <p className="text-slate-500 text-sm">당일 KIS 체결 없음</p>}
        </div>
      )}
    </div>
  );
}
