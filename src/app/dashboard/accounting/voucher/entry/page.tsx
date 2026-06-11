'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Plus } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import AccountingShell from '@/components/accounting/AccountingShell';
import { VOUCHER_STATUS_LABELS, VOUCHER_TYPE_LABELS, type VoucherStatus, type VoucherType } from '@/lib/accounting/types';

interface VoucherRow {
  id: string;
  voucherNo: string;
  voucherDate: string;
  voucherType: VoucherType;
  status: VoucherStatus;
  description?: string;
  totalDebit: number;
}

export default function VoucherEntryPage() {
  const { currentStore } = useStore();
  const [rows, setRows] = useState<VoucherRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!currentStore?.storeId) return;
    setLoading(true);
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch(
        `/api/accounting/vouchers?storeId=${encodeURIComponent(currentStore.storeId)}&status=draft`,
        { headers },
      );
      const data = await res.json();
      setRows(data.vouchers || []);
    } finally {
      setLoading(false);
    }
  }, [currentStore?.storeId]);

  useEffect(() => { load(); }, [load]);

  return (
    <AccountingShell
      actions={(
        <Link
          href="/dashboard/accounting/voucher/entry/new"
          className="text-xs px-2.5 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-600 text-white inline-flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" /> 전표 작성
        </Link>
      )}
    >
      <p className="text-xs text-slate-500 mb-3">작성중 전표 — 승인 후 장부·재무제표에 반영됩니다.</p>
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-teal-400" /></div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-sm text-slate-400">
          작성중인 전표가 없습니다.
        </div>
      ) : (
        <div className="border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-800/80 text-slate-400">
              <tr>
                <th className="text-left px-3 py-2">전표번호</th>
                <th className="text-left px-3 py-2">일자</th>
                <th className="text-left px-3 py-2">유형</th>
                <th className="text-left px-3 py-2">적요</th>
                <th className="text-right px-3 py-2">차변</th>
                <th className="text-center px-3 py-2">상태</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-t border-slate-800/80">
                  <td className="px-3 py-2 font-mono text-teal-300/90">{r.voucherNo}</td>
                  <td className="px-3 py-2 text-slate-300">{r.voucherDate}</td>
                  <td className="px-3 py-2 text-slate-400">{VOUCHER_TYPE_LABELS[r.voucherType]}</td>
                  <td className="px-3 py-2 text-slate-300 truncate max-w-[200px]">{r.description || '—'}</td>
                  <td className="px-3 py-2 text-right text-slate-200 tabular-nums">{r.totalDebit.toLocaleString()}</td>
                  <td className="px-3 py-2 text-center text-slate-400">{VOUCHER_STATUS_LABELS[r.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AccountingShell>
  );
}
