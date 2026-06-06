'use client';

import { useEffect, useState } from 'react';
import { Loader2, ShoppingBag, X } from 'lucide-react';
import { getAuthHeaders } from '@/lib/getAuthHeaders';

interface TopItem {
  name: string;
  qty: number;
  amount: number;
  categoryName: string;
  lastDate: string;
}

interface Receipt {
  saleNum: string;
  date: string;
  saleTime: string;
  posNo: string;
  receiptTotal: number;
  items: Array<{
    goodsName: string;
    categoryName: string;
    saleCount: number;
    totalPrice: number;
  }>;
}

export default function CustomerPurchaseHistoryPanel({
  storeId,
  cusCode,
  cusLabel,
  onClose,
}: {
  storeId: string;
  cusCode: string;
  cusLabel?: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [topItems, setTopItems] = useState<TopItem[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [hasData, setHasData] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(
          `/api/customers/purchase-history?storeId=${encodeURIComponent(storeId)}&cusCode=${encodeURIComponent(cusCode)}`,
          { headers },
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '조회 실패');
        if (cancelled) return;
        setTopItems(data.topItems || []);
        setReceipts(data.receipts || []);
        setHasData(!!data.hasData);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '조회 실패');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [storeId, cusCode]);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-700 rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
          <div className="flex items-center gap-2 min-w-0">
            <ShoppingBag className="w-4 h-4 text-teal-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-100 truncate">구매 이력</p>
              <p className="text-[10px] text-slate-500 truncate">{cusLabel || cusCode}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-teal-400" />
            </div>
          ) : error ? (
            <p className="text-sm text-red-400 text-center py-8">{error}</p>
          ) : !hasData ? (
            <div className="text-center py-10 space-y-2">
              <p className="text-sm text-slate-400">동기화된 품목 구매 이력이 없습니다.</p>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                POS PC에서 <code className="text-amber-300">node bridge.js migrate 시작일 종료일</code>
                로 과거 데이터를 백필하세요.
              </p>
            </div>
          ) : (
            <>
              <section>
                <p className="text-xs font-semibold text-slate-400 mb-2">자주 구매한 품목 (90일)</p>
                <div className="space-y-1.5">
                  {topItems.map(item => (
                    <div key={item.name} className="flex items-center justify-between gap-2 bg-slate-800/50 rounded-lg px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm text-slate-200 truncate">{item.name}</p>
                        <p className="text-[10px] text-slate-500">{item.categoryName || '—'} · {item.qty}회 · 최근 {item.lastDate}</p>
                      </div>
                      <span className="text-xs text-teal-300 shrink-0">{item.amount.toLocaleString()}원</span>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <p className="text-xs font-semibold text-slate-400 mb-2">최근 영수증</p>
                <div className="space-y-2">
                  {receipts.map(r => (
                    <div key={r.saleNum} className="bg-slate-800/40 border border-slate-800 rounded-xl p-3">
                      <div className="flex items-center justify-between text-[11px] text-slate-500 mb-2">
                        <span>{r.date} {r.saleTime || ''}</span>
                        <span>{r.receiptTotal.toLocaleString()}원</span>
                      </div>
                      <div className="space-y-1">
                        {r.items.map((it, idx) => (
                          <div key={`${r.saleNum}-${idx}`} className="flex justify-between text-xs">
                            <span className="text-slate-300 truncate pr-2">{it.goodsName}</span>
                            <span className="text-slate-500 shrink-0">{it.totalPrice.toLocaleString()}원</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
