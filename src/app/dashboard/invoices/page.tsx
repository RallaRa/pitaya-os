'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, FileText, Loader2 } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';

interface InvoiceRow {
  id: string;
  saleDate?: string;
  saleNum?: string;
  customerName?: string;
  totalAmount?: number;
  status?: string;
  htmlPreview?: string;
}

export default function InvoicesPage() {
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [selected, setSelected] = useState<InvoiceRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!storeId) { setLoading(false); return; }
    getAuthJsonHeaders()
      .then(h => fetch(`/api/invoices?storeId=${encodeURIComponent(storeId)}`, { headers: h }))
      .then(r => r.json())
      .then(d => setRows(d.invoices || []))
      .finally(() => setLoading(false));
  }, [storeId]);

  if (!storeId) return <div className="p-6 text-slate-400 text-sm">매장을 선택해주세요.</div>;

  return (
    <div className="max-w-5xl mx-auto p-6">
      <Link href="/dashboard" className="flex items-center gap-2 text-slate-400 hover:text-teal-400 text-sm mb-6 w-fit">
        <ArrowLeft className="w-4 h-4" /> 대시보드
      </Link>
      <div className="flex items-center gap-2 mb-4">
        <FileText className="w-5 h-5 text-teal-400" />
        <h1 className="text-lg font-bold text-teal-400">사업자 거래명세서</h1>
      </div>
      <p className="text-slate-500 text-sm mb-4">사업자 고객(cusGubun) POS 결제 시 자동 생성 · PDF 대신 HTML 미리보기(인쇄 가능)</p>
      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 py-12 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> 불러오는 중...</div>
      ) : rows.length === 0 ? (
        <p className="text-slate-500 text-sm">생성된 거래명세서가 없습니다.</p>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            {rows.map(r => (
              <button key={r.id} type="button" onClick={() => setSelected(r)} className={`w-full text-left p-3 rounded-xl border ${selected?.id === r.id ? 'border-teal-500/50 bg-teal-500/10' : 'border-slate-800 bg-slate-900/60'}`}>
                <div className="text-slate-200 text-sm">{r.customerName || '-'} · {Number(r.totalAmount || 0).toLocaleString()}원</div>
                <div className="text-slate-500 text-xs">{r.saleDate} · {r.saleNum}</div>
              </button>
            ))}
          </div>
          <div className="rounded-xl border border-slate-800 bg-white min-h-[360px] overflow-auto">
            {selected?.htmlPreview ? (
              <iframe title="invoice-preview" srcDoc={selected.htmlPreview} className="w-full h-[480px] border-0" />
            ) : (
              <div className="p-6 text-slate-500 text-sm">목록에서 선택하세요</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
