'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, AlertCircle } from 'lucide-react';

interface EntryLine {
  lineId: string;
  name: string;
  qty: number;
  unitPrice: number;
}

interface Entry {
  id: string;
  ordererName: string;
  lines: EntryLine[];
  note: string;
  totalAmount: number;
  createdAt: string | null;
}

export default function PublicOrderHistoryPage() {
  const params = useParams();
  const token = String(params.token || '');

  const [sessionTitle, setSessionTitle] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ordererName, setOrdererName] = useState('');
  const [ordererPhone, setOrdererPhone] = useState('');
  const [lookupDone, setLookupDone] = useState(false);

  const fetchHistory = useCallback(async (ordererKey: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/public/orders/${encodeURIComponent(token)}/history?ordererKey=${encodeURIComponent(ordererKey)}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '조회 실패');
      setSessionTitle(data.sessionTitle || '');
      setEntries(data.entries || []);
      setLookupDone(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '오류');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const key = localStorage.getItem(`pitaya_orderer_key_${token}`);
    if (key) {
      fetchHistory(key);
    } else {
      setLoading(false);
    }
  }, [token, fetchHistory]);

  const lookupByCredentials = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/public/orders/${encodeURIComponent(token)}/lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ordererName, ordererPhone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '조회 실패');
      localStorage.setItem(`pitaya_orderer_key_${token}`, data.ordererKey);
      localStorage.setItem(`pitaya_orderer_${token}`, JSON.stringify({ name: ordererName, phone: ordererPhone }));
      await fetchHistory(data.ordererKey);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '조회 실패');
      setLoading(false);
    }
  };

  const fmt = (n: number) => n.toLocaleString('ko-KR');

  return (
    <div className="max-w-lg mx-auto min-h-screen pb-8">
      <header className="sticky top-0 z-10 bg-slate-950/95 border-b border-slate-800 px-4 py-3 flex items-center gap-3">
        <Link href={`/order/${token}`} className="p-1 text-slate-400 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="font-bold text-white">내 주문 내역</h1>
          {sessionTitle && <p className="text-xs text-slate-500">{sessionTitle}</p>}
        </div>
      </header>

      <div className="p-4 space-y-4">
        {!lookupDone && !loading && (
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 space-y-3">
            <p className="text-sm text-slate-400">
              주문 시 입력한 이름과 연락처로 내역을 조회합니다.
            </p>
            <input
              type="text"
              placeholder="이름"
              value={ordererName}
              onChange={e => setOrdererName(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
            />
            <input
              type="tel"
              placeholder="연락처"
              value={ordererPhone}
              onChange={e => setOrdererPhone(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={lookupByCredentials}
              className="w-full py-2.5 rounded-xl bg-teal-600 text-white font-semibold text-sm"
            >
              조회하기
            </button>
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-teal-400" />
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {lookupDone && entries.length === 0 && !loading && (
          <p className="text-center text-slate-500 py-12 text-sm">주문 내역이 없습니다</p>
        )}

        {entries.map(entry => (
          <article key={entry.id} className="bg-slate-900 border border-slate-700 rounded-2xl p-4">
            <div className="flex justify-between items-start mb-3">
              <div>
                <p className="font-semibold text-white">{entry.ordererName}</p>
                <p className="text-[10px] text-slate-500">
                  {entry.createdAt
                    ? new Date(entry.createdAt).toLocaleString('ko-KR')
                    : ''}
                </p>
              </div>
              <p className="text-teal-300 font-bold">{fmt(entry.totalAmount)}원</p>
            </div>
            <ul className="space-y-1.5">
              {entry.lines.map((line, i) => (
                <li key={i} className="flex justify-between text-sm text-slate-300">
                  <span>{line.name} × {line.qty}</span>
                  <span className="text-slate-500">{fmt(line.unitPrice * line.qty)}원</span>
                </li>
              ))}
            </ul>
            {entry.note && (
              <p className="mt-2 text-xs text-slate-500 border-t border-slate-800 pt-2">
                메모: {entry.note}
              </p>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
