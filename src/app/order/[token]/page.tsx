'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  ShoppingBag, Minus, Plus, Loader2, CheckCircle2, AlertCircle,
} from 'lucide-react';
import type { PublicOrderLine } from '@/lib/publicOrders';

const ORDERER_STORAGE_PREFIX = 'pitaya_orderer_';

interface SessionInfo {
  id: string;
  title: string;
  description: string;
  status: string;
  orderDeadline: string | null;
  storeName: string;
}

function fmtPrice(n: number) {
  return n.toLocaleString('ko-KR');
}

export default function PublicOrderPage() {
  const params = useParams();
  const token = String(params.token || '');

  const [session, setSession] = useState<SessionInfo | null>(null);
  const [lines, setLines] = useState<PublicOrderLine[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [ordererName, setOrdererName] = useState('');
  const [ordererPhone, setOrdererPhone] = useState('');
  const [note, setNote] = useState('');
  const [qtyMap, setQtyMap] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitOk, setSubmitOk] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/orders/${encodeURIComponent(token)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '불러오기 실패');
      setSession(data.session);
      setLines(data.lines || []);
      setIsOpen(data.isOpen === true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
    const saved = localStorage.getItem(`${ORDERER_STORAGE_PREFIX}${token}`);
    if (saved) {
      try {
        const { name, phone } = JSON.parse(saved);
        if (name) setOrdererName(name);
        if (phone) setOrdererPhone(phone);
      } catch { /* ignore */ }
    }
  }, [load, token]);

  const setQty = (lineId: string, qty: number, max: number) => {
    setQtyMap(prev => ({
      ...prev,
      [lineId]: Math.max(0, Math.min(max, Math.floor(qty))),
    }));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    const items = Object.entries(qtyMap)
      .filter(([, q]) => q > 0)
      .map(([lineId, qty]) => ({ lineId, qty }));

    try {
      const res = await fetch(`/api/public/orders/${encodeURIComponent(token)}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ordererName, ordererPhone, items, note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '주문 실패');

      localStorage.setItem(
        `${ORDERER_STORAGE_PREFIX}${token}`,
        JSON.stringify({ name: ordererName, phone: ordererPhone }),
      );
      setSubmitOk(true);
      setQtyMap({});
      await load();
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : '주문 실패');
    } finally {
      setSubmitting(false);
    }
  };

  const totalSelected = lines.reduce((sum, line) => {
    const q = qtyMap[line.id] || 0;
    return sum + q * (line.discountPrice || line.normalPrice);
  }, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-teal-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-lg mx-auto p-6 text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
        <p className="text-slate-300">{error}</p>
      </div>
    );
  }

  const canOrder = isOpen && lines.some(l => l.remainingQty > 0);

  return (
    <div className={`max-w-lg mx-auto ${canOrder ? 'pb-28' : ''}`}>
      <header className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur border-b border-slate-800 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            {session?.storeName && (
              <p className="text-[10px] text-teal-400 font-semibold uppercase tracking-wider">
                {session.storeName}
              </p>
            )}
            <h1 className="text-lg font-bold text-white">{session?.title}</h1>
            {session?.description && (
              <p className="text-xs text-slate-400 mt-1">{session.description}</p>
            )}
            {session?.orderDeadline && (
              <p className="text-[10px] text-amber-400 mt-1">마감: {session.orderDeadline}</p>
            )}
          </div>
        </div>
        {!isOpen && (
          <p className="mt-2 text-xs text-amber-300 bg-amber-950/50 border border-amber-700/40 rounded-lg px-3 py-2">
            현재 주문 접수가 마감되었습니다. 품목만 조회할 수 있습니다.
          </p>
        )}
      </header>

      <div className="px-4 py-4 space-y-4">
        {lines.length === 0 ? (
          <p className="text-center text-slate-500 py-12 text-sm">등록된 주문 품목이 없습니다</p>
        ) : (
          lines.map(line => {
            const qty = qtyMap[line.id] || 0;
            const price = line.discountPrice || line.normalPrice;
            const soldOut = line.remainingQty <= 0;

            return (
              <article
                key={line.id}
                className={`rounded-2xl border overflow-hidden ${
                  soldOut ? 'border-slate-800 opacity-60' : 'border-slate-700/80 bg-slate-900/50'
                }`}
              >
                {line.photoUrl ? (
                  <div className="relative w-full aspect-[4/3] bg-slate-800">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={line.photoUrl}
                      alt={line.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-full aspect-[4/3] bg-slate-800 flex items-center justify-center">
                    <ShoppingBag className="w-10 h-10 text-slate-600" />
                  </div>
                )}

                <div className="p-4 space-y-2">
                  <h2 className="font-bold text-white text-base">{line.name}</h2>
                  {line.description && (
                    <p className="text-sm text-slate-400 leading-relaxed">{line.description}</p>
                  )}
                  {line.origin && (
                    <p className="text-xs text-slate-500">원산지: {line.origin}</p>
                  )}

                  <div className="flex items-baseline gap-2 flex-wrap">
                    {line.normalPrice > line.discountPrice && line.discountPrice > 0 && (
                      <span className="text-sm text-slate-500 line-through">
                        {fmtPrice(line.normalPrice)}원
                      </span>
                    )}
                    <span className="text-lg font-bold text-teal-300">
                      {fmtPrice(price)}원
                      <span className="text-xs font-normal text-slate-500"> / {line.unit}</span>
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                    <div className="bg-slate-800/80 rounded-lg py-2">
                      <p className="text-slate-500">총수량</p>
                      <p className="text-white font-semibold">{line.totalQty}{line.unit}</p>
                    </div>
                    <div className="bg-slate-800/80 rounded-lg py-2">
                      <p className="text-slate-500">주문수량</p>
                      <p className="text-amber-300 font-semibold">{line.orderedQty}{line.unit}</p>
                    </div>
                    <div className="bg-slate-800/80 rounded-lg py-2">
                      <p className="text-slate-500">잔량</p>
                      <p className={`font-semibold ${soldOut ? 'text-red-400' : 'text-emerald-400'}`}>
                        {line.remainingQty}{line.unit}
                      </p>
                    </div>
                  </div>

                  {isOpen && !soldOut && (
                    <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                      <span className="text-xs text-slate-400">주문 수량</span>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setQty(line.id, qty - 1, line.remainingQty)}
                          className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center text-slate-300"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="w-8 text-center font-bold">{qty}</span>
                        <button
                          type="button"
                          onClick={() => setQty(line.id, qty + 1, line.remainingQty)}
                          disabled={qty >= line.remainingQty}
                          className="w-9 h-9 rounded-full bg-teal-600 flex items-center justify-center text-white disabled:opacity-40"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                  {soldOut && (
                    <p className="text-xs text-red-400 text-center py-1">품절</p>
                  )}
                </div>
              </article>
            );
          })
        )}

        {canOrder && !submitOk && (
          <section className="rounded-2xl border border-slate-700/80 bg-slate-900/50 p-4 space-y-3">
            <h2 className="text-sm font-semibold text-slate-200">주문자 정보</h2>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="성함(닉네임)"
                value={ordererName}
                onChange={e => setOrdererName(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
              />
              <input
                type="tel"
                placeholder="전화번호"
                value={ordererPhone}
                onChange={e => setOrdererPhone(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <input
              type="text"
              placeholder="요청사항 (선택)"
              value={note}
              onChange={e => setNote(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
            />
          </section>
        )}
      </div>

      {canOrder && (
        <div className="fixed bottom-0 inset-x-0 z-30 border-t border-slate-700 bg-slate-950/95 backdrop-blur">
          <div className="max-w-lg mx-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {submitOk ? (
              <div className="text-center py-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                <p className="text-sm text-emerald-300 font-medium">주문이 접수되었습니다</p>
                <p className="mt-2 text-xs text-slate-400">매장에서 확인 후 연락드립니다</p>
                <button
                  type="button"
                  onClick={() => setSubmitOk(false)}
                  className="mt-3 text-xs text-teal-400 underline"
                >
                  추가 주문하기
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {submitError && (
                  <p className="text-xs text-red-400 text-center">{submitError}</p>
                )}
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting || totalSelected <= 0}
                  className="w-full py-3.5 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-40 font-bold text-white flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <ShoppingBag className="w-5 h-5" />
                      주문하기 {totalSelected > 0 ? `· ${fmtPrice(totalSelected)}원` : ''}
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
