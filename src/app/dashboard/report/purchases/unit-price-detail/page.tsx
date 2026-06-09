'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';
import {
  Search, RefreshCw, ChevronDown, ChevronUp, History,
} from 'lucide-react';
import { getAuthHeaders } from '@/lib/getAuthHeaders';
import { useStore } from '@/context/StoreContext';
import type {
  ItemPriceHistoryResult,
  ItemPriceListRow,
  PurchaseLineEntry,
} from '@/lib/purchaseUnitPriceHistory';

const AIPurchasePanel = dynamic(() => import('@/components/purchases/AIPurchasePanel'), { ssr: false });

const fmt = (n: number) => (n || 0).toLocaleString('ko-KR');

interface ListResponse {
  mode: 'list';
  startDate: string;
  endDate: string;
  today: string;
  summary: {
    itemCount: number;
    totalQty: number;
    totalAmount: number;
    avgUnitPrice: number;
    lineCount: number;
  };
  items: ItemPriceListRow[];
}

export default function UnitPriceDetailPage() {
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';
  const today = new Date().toISOString().split('T')[0];
  const firstOfMonth = today.slice(0, 8) + '01';

  const [start, setStart] = useState(firstOfMonth);
  const [end, setEnd] = useState(today);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [listData, setListData] = useState<ListResponse | null>(null);
  const [selected, setSelected] = useState<ItemPriceListRow | null>(null);
  const [detail, setDetail] = useState<ItemPriceHistoryResult | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showDetailLines, setShowDetailLines] = useState(false);

  const loadList = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const p = new URLSearchParams({ storeId, startDate: start, endDate: end });
      const res = await fetch(`/api/purchases/item-price-history?${p}`, {
        headers: await getAuthHeaders(),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setListData(json);
    } catch {
      setListData(null);
    } finally {
      setLoading(false);
    }
  }, [storeId, start, end]);

  const loadDetail = useCallback(async (itemName: string) => {
    if (!storeId) return;
    setDetailLoading(true);
    try {
      const p = new URLSearchParams({ storeId, itemName, startDate: start, endDate: end });
      const res = await fetch(`/api/purchases/item-price-history?${p}`, {
        headers: await getAuthHeaders(),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setDetail(json);
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, [storeId, start, end]);

  useEffect(() => { loadList(); }, [loadList]);

  useEffect(() => {
    if (selected) loadDetail(selected.itemName);
    else setDetail(null);
  }, [selected, loadDetail]);

  const filtered = (listData?.items || []).filter(
    it => !search || it.itemName.includes(search),
  );

  return (
    <div className="flex h-full min-h-screen bg-slate-950">
      <div className="flex-1 flex flex-col min-w-0 overflow-auto p-4 md:p-6 space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <History className="w-6 h-6 text-teal-400" />
            매입 단가 상세
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            기간별 매입량·금액·평균단가 · 품목별 from~to 단가 구간 · 상세 건별 선택
          </p>
        </div>

        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">시작일</label>
            <input type="date" value={start} onChange={e => setStart(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">종료일</label>
            <input type="date" value={end} onChange={e => setEnd(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">품목 검색</label>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="품목명"
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600" />
          </div>
          <button onClick={loadList} disabled={loading}
            className="flex items-center gap-2 bg-teal-600 hover:bg-teal-500 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50">
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            조회
          </button>
        </div>

        {listData?.summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              ['품목 수', `${listData.summary.itemCount}개`, 'text-slate-200'],
              ['총 매입량', `${fmt(listData.summary.totalQty)}`, 'text-slate-200'],
              ['총 매입금액', `${fmt(listData.summary.totalAmount)}원`, 'text-teal-300'],
              ['평균 단가', listData.summary.avgUnitPrice > 0 ? `${fmt(listData.summary.avgUnitPrice)}원/kg` : '-', 'text-amber-300'],
            ].map(([label, val, color]) => (
              <div key={label as string} className="bg-slate-900 border border-slate-800 rounded-xl p-3">
                <p className="text-[10px] text-slate-500">{label as string}</p>
                <p className={`text-lg font-bold tabular-nums ${color as string}`}>{val as string}</p>
                <p className="text-[9px] text-slate-600 mt-0.5">{start} ~ {end}</p>
              </div>
            ))}
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800">
              <p className="text-sm font-semibold text-slate-300">품목 목록 ({filtered.length})</p>
              <p className="text-[10px] text-slate-500">표시단가 = 오늘({listData?.today}) 기준 · 당일 중복 시 최고가</p>
            </div>
            <div className="overflow-auto max-h-[55vh]">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-500">
                    <th className="px-3 py-2 text-left">품목</th>
                    <th className="px-3 py-2 text-right">표시단가</th>
                    <th className="px-3 py-2 text-right">기간평균</th>
                    <th className="px-3 py-2 text-right">매입량</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && <tr><td colSpan={4} className="text-center py-8 text-slate-500">불러오는 중…</td></tr>}
                  {!loading && filtered.length === 0 && (
                    <tr><td colSpan={4} className="text-center py-8 text-slate-500">데이터 없음</td></tr>
                  )}
                  {filtered.map(it => (
                    <tr key={it.itemName}
                      onClick={() => setSelected(it)}
                      className={`border-b border-slate-800/50 cursor-pointer ${
                        selected?.itemName === it.itemName ? 'bg-teal-600/10' : 'hover:bg-slate-800/30'
                      }`}>
                      <td className="px-3 py-2.5 text-slate-200">{it.itemName}</td>
                      <td className="px-3 py-2.5 text-right font-semibold text-teal-300 tabular-nums">
                        {it.displayPrice > 0 ? `${fmt(it.displayPrice)}` : '-'}
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-400 tabular-nums">
                        {it.avgUnitPrice > 0 ? fmt(it.avgUnitPrice) : '-'}
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-400 tabular-nums">{fmt(it.totalQty)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 min-h-[280px]">
            {!selected ? (
              <div className="flex items-center justify-center h-full text-slate-600 text-sm">
                품목을 선택하면 기간·단가 구간·상세 내역이 표시됩니다
              </div>
            ) : detailLoading ? (
              <div className="flex items-center justify-center h-full text-slate-500 text-sm gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" /> 불러오는 중…
              </div>
            ) : detail ? (
              <>
                <p className="text-sm font-semibold text-slate-200">{detail.itemName}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">{detail.displayPriceBasis}</p>

                <div className="grid grid-cols-3 gap-2 mt-3">
                  <div className="bg-slate-800/50 rounded-lg p-2 text-center">
                    <p className="text-[9px] text-slate-500">표시단가</p>
                    <p className="text-sm font-bold text-teal-300 tabular-nums">{fmt(detail.displayPrice)}</p>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-2 text-center">
                    <p className="text-[9px] text-slate-500">기간 매입량</p>
                    <p className="text-sm font-bold text-slate-200 tabular-nums">{fmt(detail.periodSummary.totalQty)}</p>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-2 text-center">
                    <p className="text-[9px] text-slate-500">기간 금액</p>
                    <p className="text-sm font-bold text-slate-200 tabular-nums">{fmt(detail.periodSummary.totalAmount)}</p>
                  </div>
                </div>

                <p className="text-[10px] font-semibold text-slate-400 mt-4 mb-2">단가 구간 (from ~ to)</p>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {detail.periods.slice().reverse().map((p, i) => (
                    <div key={i} className="text-[10px] bg-slate-800/40 rounded px-2 py-1.5 flex justify-between gap-2">
                      <span className="text-slate-400 tabular-nums">{p.from} ~ {p.to || '현재'}</span>
                      <span className="text-teal-300 font-semibold tabular-nums">{fmt(p.unitPrice)}원</span>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setShowDetailLines(v => !v)}
                  className="mt-3 flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-200"
                >
                  {showDetailLines ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  상세 내역 ({detail.lines.length}건) · 동일기간 중복 단가
                </button>
                {showDetailLines && (
                  <div className="mt-1 max-h-40 overflow-y-auto space-y-0.5 border-t border-slate-800 pt-2">
                    {[...detail.lines].reverse().map((line: PurchaseLineEntry, i) => (
                      <div key={i} className="flex justify-between text-[10px] px-1 py-0.5 hover:bg-slate-800/40 rounded">
                        <span className="text-slate-500 tabular-nums">{line.purchaseDate} · {line.supplierName}</span>
                        <span className="text-slate-200 tabular-nums">{fmt(line.qty)} · {fmt(line.unitPrice)}원</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : null}
          </div>
        </div>
      </div>
      <AIPurchasePanel
        currentPage="unit-price-detail"
        currentData={{ items: filtered.map(it => ({ name: it.itemName, price: it.displayPrice })) }}
      />
    </div>
  );
}
