'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, Loader2, X } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import AccountingShell from '@/components/accounting/AccountingShell';
import {
  VOUCHER_STATUS_LABELS,
  VOUCHER_TYPE_LABELS,
  type AccountingVoucher,
  type VoucherStatus,
  type VoucherType,
} from '@/lib/accounting/types';

export default function VoucherApprovalPanel() {
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';
  const [rows, setRows] = useState<AccountingVoucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch(
        `/api/accounting/vouchers?storeId=${encodeURIComponent(storeId)}&status=pending`,
        { headers },
      );
      const data = await res.json();
      setRows(data.vouchers || []);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  const act = async (id: string, action: 'approve' | 'cancel') => {
    if (!storeId || processingId) return;
    setProcessingId(id);
    setMsg('');
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/accounting/vouchers', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ id, storeId, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '처리 실패');
      setMsg(action === 'approve' ? '승인되었습니다.' : '취소되었습니다.');
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '처리 실패');
    } finally {
      setProcessingId('');
    }
  };

  return (
    <AccountingShell>
      {msg && <p className="text-xs text-teal-300 mb-3">{msg}</p>}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-teal-400" /></div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-12">승인 대기 전표가 없습니다.</p>
      ) : (
        <div className="border border-slate-800 rounded-xl overflow-x-auto">
          <table className="w-full text-xs min-w-[860px]">
            <thead className="bg-slate-800/80 text-slate-400">
              <tr>
                <th className="text-left px-3 py-2">전표번호</th>
                <th className="text-left px-3 py-2">일자</th>
                <th className="text-left px-3 py-2">유형</th>
                <th className="text-left px-3 py-2">적요</th>
                <th className="text-right px-3 py-2">금액</th>
                <th className="text-center px-3 py-2">상태</th>
                <th className="text-center px-3 py-2">처리</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-t border-slate-800/80">
                  <td className="px-3 py-2 font-mono text-teal-300/90">
                    <Link href={`/dashboard/accounting/voucher/entry/${r.id}`} className="hover:underline">
                      {r.voucherNo}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-slate-300">{r.voucherDate}</td>
                  <td className="px-3 py-2 text-slate-400">{VOUCHER_TYPE_LABELS[r.voucherType as VoucherType]}</td>
                  <td className="px-3 py-2 text-slate-300 truncate max-w-[200px]">{r.description || '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-200">{Number(r.totalDebit || 0).toLocaleString()}</td>
                  <td className="px-3 py-2 text-center text-slate-400">{VOUCHER_STATUS_LABELS[r.status as VoucherStatus]}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-center gap-1">
                      <button
                        type="button"
                        disabled={processingId === r.id}
                        onClick={() => act(String(r.id), 'approve')}
                        className="p-1.5 rounded bg-teal-700/80 hover:bg-teal-600 text-white disabled:opacity-40"
                        title="승인"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={processingId === r.id}
                        onClick={() => act(String(r.id), 'cancel')}
                        className="p-1.5 rounded bg-slate-700 hover:bg-red-700 text-white disabled:opacity-40"
                        title="취소"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AccountingShell>
  );
}
