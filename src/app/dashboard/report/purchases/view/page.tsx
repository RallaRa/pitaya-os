'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useStore } from '@/context/StoreContext';
import {
  ShoppingCart, ChevronDown, ChevronUp, Trash2,
  Loader2, Search, Calendar,
} from 'lucide-react';
import { formatPurchaseQty } from '@/lib/purchaseQtyFormat';

interface PurchaseItem {
  name: string;
  category?: string;
  qty: number;
  unit: string;
  unitPrice: number;
  supplyAmount: number;
  taxAmount: number;
}

interface PurchaseRecord {
  id: string;
  purchaseDate: string;
  supplierName: string;
  invoiceNumber: string;
  items: PurchaseItem[];
  supplyAmount: number;
  taxAmount: number;
  totalAmount: number;
  memo: string;
  createdAt: any;
}

const fmt = (n: number) => n?.toLocaleString('ko-KR') ?? '0';

const today = () => new Date().toISOString().split('T')[0];
const monthStart = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

export default function PurchaseViewPage() {
  const { user } = useAuth();
  const { currentStore } = useStore();

  const [records, setRecords]         = useState<PurchaseRecord[]>([]);
  const [isLoading, setIsLoading]     = useState(false);
  const [expandedId, setExpandedId]   = useState<string | null>(null);
  const [startDate, setStartDate]     = useState(monthStart());
  const [endDate, setEndDate]         = useState(today());
  const [search, setSearch]           = useState('');

  const loadRecords = async () => {
    if (!currentStore?.storeId) return;
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        storeId: currentStore.storeId,
        startDate,
        endDate,
      });
      const res = await fetch(`/api/purchases?${params}`);
      const data = await res.json();
      setRecords(data.records || []);
    } catch {
      setRecords([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRecords();
  }, [currentStore]);

  const handleDelete = async (id: string) => {
    if (!confirm('이 매입 내역을 삭제하시겠습니까?')) return;
    try {
      await fetch(`/api/purchases?id=${id}`, { method: 'DELETE' });
      setRecords(prev => prev.filter(r => r.id !== id));
    } catch {
      alert('삭제 실패했습니다.');
    }
  };

  const filtered = records.filter(r => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return r.supplierName?.toLowerCase().includes(q) ||
      r.invoiceNumber?.toLowerCase().includes(q) ||
      r.items?.some(i => i.name?.toLowerCase().includes(q));
  });

  const totalAmount = filtered.reduce((s, r) => s + (r.totalAmount || 0), 0);
  const totalSupply = filtered.reduce((s, r) => s + (r.supplyAmount || 0), 0);
  const totalTax    = filtered.reduce((s, r) => s + (r.taxAmount || 0), 0);

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 overflow-y-auto">
      <div className="max-w-3xl mx-auto w-full p-6 md:p-8 space-y-5">

        {/* 헤더 */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-teal-900/30 border border-teal-500/30 rounded-xl flex items-center justify-center">
            <ShoppingCart className="w-5 h-5 text-teal-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">매입 이력</h1>
            <p className="text-slate-500 text-xs">저장된 매입 내역을 조회합니다</p>
          </div>
        </div>

        {/* 조회 조건 */}
        <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 space-y-3">
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-[140px]">
              <Calendar className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-slate-200 text-sm focus:outline-none focus:border-teal-500/50 w-full"
              />
            </div>
            <span className="text-slate-500 self-center text-sm">~</span>
            <div className="flex items-center gap-2 flex-1 min-w-[140px]">
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-slate-200 text-sm focus:outline-none focus:border-teal-500/50 w-full"
              />
            </div>
            <button
              onClick={loadRecords}
              disabled={isLoading}
              className="bg-teal-600 hover:bg-teal-500 disabled:bg-slate-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : '조회'}
            </button>
          </div>
          <div className="flex items-center gap-2 bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="업체명, 전표번호, 품목명 검색"
              className="bg-transparent text-slate-200 text-sm placeholder:text-slate-600 focus:outline-none flex-1"
            />
          </div>
        </div>

        {/* 합계 */}
        {filtered.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: '합계금액', value: totalAmount, highlight: true },
              { label: '공급가액', value: totalSupply },
              { label: '세액', value: totalTax },
            ].map(item => (
              <div key={item.label} className="bg-slate-900 border border-slate-700 rounded-xl p-3 text-center">
                <p className="text-slate-500 text-xs mb-1">{item.label}</p>
                <p className={`font-bold text-sm ${item.highlight ? 'text-teal-400' : 'text-slate-200'}`}>
                  {fmt(item.value)}원
                </p>
              </div>
            ))}
          </div>
        )}

        {/* 목록 */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 text-teal-400 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <ShoppingCart className="w-12 h-12 text-slate-700 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">매입 내역이 없습니다</p>
            <p className="text-slate-600 text-xs mt-1">AI 매입관리에서 문서를 업로드하여 추가하세요</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-slate-500 text-xs">{filtered.length}건</p>
            {filtered.map(record => (
              <div key={record.id} className="bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden">
                {/* 요약 행 */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-slate-200 font-medium text-sm">{record.supplierName || '(업체 미상)'}</span>
                      {record.invoiceNumber && (
                        <span className="text-slate-500 text-xs bg-slate-800 px-2 py-0.5 rounded">{record.invoiceNumber}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-slate-500 text-xs">{record.purchaseDate}</span>
                      <span className="text-teal-400 text-xs font-semibold">{fmt(record.totalAmount)}원</span>
                      {record.items?.length > 0 && (
                        <span className="text-slate-600 text-xs">{record.items.length}종</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => setExpandedId(expandedId === record.id ? null : record.id)}
                      className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-700 transition-colors"
                    >
                      {expandedId === record.id
                        ? <ChevronUp className="w-4 h-4" />
                        : <ChevronDown className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => handleDelete(record.id)}
                      className="text-slate-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-slate-700 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* 상세 */}
                {expandedId === record.id && (
                  <div className="border-t border-slate-700 px-4 py-3 space-y-3">
                    {record.items && record.items.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-slate-700">
                              <th className="text-left text-slate-400 pb-2 pr-3 font-medium w-14">구분</th>
                              <th className="text-left text-slate-400 pb-2 pr-3 font-medium">품명</th>
                              <th className="text-right text-slate-400 pb-2 pr-3 font-medium">수량</th>
                              <th className="text-right text-slate-400 pb-2 pr-3 font-medium">단가</th>
                              <th className="text-right text-slate-400 pb-2 font-medium">공급가액</th>
                            </tr>
                          </thead>
                          <tbody>
                            {record.items.map((item, i) => (
                              <tr key={i} className="border-b border-slate-800">
                                <td className="py-1.5 pr-3 text-slate-400">{item.category || '-'}</td>
                                <td className="py-1.5 pr-3 text-slate-200">{item.name}</td>
                                <td className="py-1.5 pr-3 text-right text-slate-300 tabular-nums">
                                  {formatPurchaseQty(item.qty, item.unit)}{item.unit}
                                </td>
                                <td className="py-1.5 pr-3 text-right text-slate-300">{fmt(item.unitPrice)}원</td>
                                <td className="py-1.5 text-right text-slate-200">{fmt(item.supplyAmount)}원</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <div className="flex justify-between items-center pt-1 text-sm border-t border-slate-800">
                      <div className="space-y-0.5">
                        <div className="flex gap-4 text-xs text-slate-500">
                          <span>공급가액 {fmt(record.supplyAmount)}원</span>
                          <span>세액 {fmt(record.taxAmount)}원</span>
                        </div>
                      </div>
                      <span className="text-teal-400 font-bold">합계 {fmt(record.totalAmount)}원</span>
                    </div>
                    {record.memo && (
                      <p className="text-slate-400 text-xs bg-slate-800 rounded-lg px-3 py-2">{record.memo}</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
