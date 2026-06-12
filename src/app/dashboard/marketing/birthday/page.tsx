'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Cake, Loader2, RefreshCw, CheckCircle2, Clock } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { getAuthHeaders } from '@/lib/getAuthHeaders';

interface CampaignRow {
  id: string;
  cusCode: string;
  customerName: string;
  phoneMasked: string;
  birthMd: string;
  targetBirthdayYmd: string;
  couponCode: string;
  phase: string;
  redeemed: boolean;
}

export default function BirthdayCampaignsPage() {
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';
  const year = new Date().getFullYear();

  const [items, setItems] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!storeId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `/api/dashboard/birthday-campaigns?storeId=${encodeURIComponent(storeId)}&year=${year}&limit=100`,
        { headers: await getAuthHeaders() },
      );
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || '조회 실패');
      setItems(d.items || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '불러오기 실패');
    } finally {
      setLoading(false);
    }
  }, [storeId, year]);

  useEffect(() => { load(); }, [load]);

  const redeemedCount = items.filter(i => i.redeemed).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/settings/birthday-campaign"
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-white flex items-center gap-2">
              <Cake className="w-5 h-5 text-pink-400" />
              생일 캠페인 {year}
            </h1>
            <p className="text-xs text-slate-500">쿠폰 발급 · 사용 추적</p>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            새로고침
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
            <p className="text-[10px] text-slate-500">캠페인</p>
            <p className="text-xl font-bold">{items.length}</p>
          </div>
          <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
            <p className="text-[10px] text-slate-500">쿠폰 사용</p>
            <p className="text-xl font-bold text-teal-400">{redeemedCount}</p>
          </div>
          <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
            <p className="text-[10px] text-slate-500">미사용</p>
            <p className="text-xl font-bold text-amber-400">{items.length - redeemedCount}</p>
          </div>
        </div>

        {error && (
          <p className="text-xs text-rose-400 bg-rose-950/30 border border-rose-800/40 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-teal-400" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-center text-slate-500 py-16">올해 생일 캠페인 이력이 없습니다.</p>
        ) : (
          <div className="rounded-xl border border-slate-800 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-900 text-slate-500 text-left">
                  <th className="px-3 py-2">고객</th>
                  <th className="px-3 py-2">생일</th>
                  <th className="px-3 py-2 hidden md:table-cell">쿠폰</th>
                  <th className="px-3 py-2">상태</th>
                </tr>
              </thead>
              <tbody>
                {items.map(row => (
                  <tr key={row.id} className="border-t border-slate-800/80">
                    <td className="px-3 py-2.5">
                      <Link
                        href={`/dashboard/customers?cusCode=${encodeURIComponent(row.cusCode)}`}
                        className="text-slate-200 hover:text-teal-300"
                      >
                        {row.customerName}
                      </Link>
                      <p className="text-[10px] text-slate-500">{row.phoneMasked}</p>
                    </td>
                    <td className="px-3 py-2.5 text-slate-400">{row.targetBirthdayYmd || row.birthMd}</td>
                    <td className="px-3 py-2.5 hidden md:table-cell font-mono text-slate-500">
                      {row.couponCode || '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      {row.redeemed ? (
                        <span className="inline-flex items-center gap-1 text-teal-400">
                          <CheckCircle2 className="w-3.5 h-3.5" /> 사용
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-slate-500">
                          <Clock className="w-3.5 h-3.5" /> {row.phase || '대기'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
