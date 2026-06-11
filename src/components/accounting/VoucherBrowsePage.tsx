'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import AccountingShell from '@/components/accounting/AccountingShell';
import VoucherExportButton from '@/components/accounting/VoucherExportButton';
import {
  VOUCHER_STATUS_LABELS,
  VOUCHER_TYPE_LABELS,
  type AccountingVoucher,
  type VoucherStatus,
  type VoucherType,
} from '@/lib/accounting/types';

interface Props {
  mode: 'voucher' | 'journal';
  defaultStatus?: string;
}

function monthStartYMD() {
  const d = new Date(Date.now() + 9 * 3600_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function todayYMD() {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}

export default function VoucherBrowsePage({ mode, defaultStatus = 'approved' }: Props) {
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';
  const [rows, setRows] = useState<AccountingVoucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(monthStartYMD());
  const [endDate, setEndDate] = useState(todayYMD());
  const [status, setStatus] = useState(defaultStatus);

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const headers = await getAuthJsonHeaders();
      const params = new URLSearchParams({ storeId, startDate, endDate });
      if (status !== 'all') params.set('status', status);
      const res = await fetch(`/api/accounting/vouchers?${params}`, { headers });
      const data = await res.json();
      setRows(data.vouchers || []);
    } finally {
      setLoading(false);
    }
  }, [storeId, startDate, endDate, status]);

  useEffect(() => { load(); }, [load]);

  const journalLines = useMemo(() => {
    if (mode !== 'journal') return [];
    return rows.flatMap(voucher =>
      (voucher.lines || []).map(line => ({
        key: `${voucher.id}_${line.lineNo}`,
        voucherNo: voucher.voucherNo,
        voucherDate: voucher.voucherDate,
        voucherType: voucher.voucherType,
        status: voucher.status,
        lineNo: line.lineNo,
        accountCode: line.accountCode,
        accountName: line.accountName,
        partnerName: line.partnerName,
        debit: line.debit,
        credit: line.credit,
        memo: line.memo || voucher.description,
      })),
    );
  }, [rows, mode]);

  return (
    <AccountingShell
      actions={storeId ? (
        <VoucherExportButton
          storeId={storeId}
          defaultStartDate={startDate}
          defaultEndDate={endDate}
          defaultStatus={status}
        />
      ) : undefined}
    >
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <label className="text-[10px] text-slate-500">
          시작일
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="block mt-1 px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white" />
        </label>
        <label className="text-[10px] text-slate-500">
          종료일
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="block mt-1 px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white" />
        </label>
        <label className="text-[10px] text-slate-500">
          상태
          <select value={status} onChange={e => setStatus(e.target.value)} className="block mt-1 px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white">
            <option value="approved">승인</option>
            <option value="pending">승인대기</option>
            <option value="draft">작성중</option>
            <option value="all">전체</option>
          </select>
        </label>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-teal-400" /></div>
      ) : mode === 'journal' ? (
        journalLines.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-12">분개 내역이 없습니다.</p>
        ) : (
          <div className="border border-slate-800 rounded-xl overflow-x-auto">
            <table className="w-full text-xs min-w-[900px]">
              <thead className="bg-slate-800/80 text-slate-400">
                <tr>
                  <th className="text-left px-3 py-2">전표일자</th>
                  <th className="text-left px-3 py-2">전표번호</th>
                  <th className="text-center px-3 py-2">순번</th>
                  <th className="text-left px-3 py-2">계정코드</th>
                  <th className="text-left px-3 py-2">계정명</th>
                  <th className="text-left px-3 py-2">거래처</th>
                  <th className="text-right px-3 py-2">차변</th>
                  <th className="text-right px-3 py-2">대변</th>
                  <th className="text-left px-3 py-2">적요</th>
                </tr>
              </thead>
              <tbody>
                {journalLines.map(line => (
                  <tr key={line.key} className="border-t border-slate-800/80">
                    <td className="px-3 py-2 text-slate-300">{line.voucherDate}</td>
                    <td className="px-3 py-2 font-mono text-teal-300/90">{line.voucherNo}</td>
                    <td className="px-3 py-2 text-center text-slate-400">{line.lineNo}</td>
                    <td className="px-3 py-2 font-mono text-slate-300">{line.accountCode}</td>
                    <td className="px-3 py-2 text-slate-300">{line.accountName || '—'}</td>
                    <td className="px-3 py-2 text-slate-400">{line.partnerName || '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-200">{line.debit ? line.debit.toLocaleString() : ''}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-200">{line.credit ? line.credit.toLocaleString() : ''}</td>
                    <td className="px-3 py-2 text-slate-400 truncate max-w-[180px]">{line.memo || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-12">조회된 전표가 없습니다.</p>
      ) : (
        <div className="border border-slate-800 rounded-xl overflow-x-auto">
          <table className="w-full text-xs min-w-[760px]">
            <thead className="bg-slate-800/80 text-slate-400">
              <tr>
                <th className="text-left px-3 py-2">전표번호</th>
                <th className="text-left px-3 py-2">일자</th>
                <th className="text-left px-3 py-2">유형</th>
                <th className="text-left px-3 py-2">적요</th>
                <th className="text-right px-3 py-2">차변</th>
                <th className="text-right px-3 py-2">대변</th>
                <th className="text-center px-3 py-2">상태</th>
                <th className="text-center px-3 py-2">분개</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-t border-slate-800/80">
                  <td className="px-3 py-2 font-mono text-teal-300/90">{r.voucherNo}</td>
                  <td className="px-3 py-2 text-slate-300">{r.voucherDate}</td>
                  <td className="px-3 py-2 text-slate-400">{VOUCHER_TYPE_LABELS[r.voucherType as VoucherType]}</td>
                  <td className="px-3 py-2 text-slate-300 truncate max-w-[200px]">{r.description || '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-200">{Number(r.totalDebit || 0).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-200">{Number(r.totalCredit || 0).toLocaleString()}</td>
                  <td className="px-3 py-2 text-center text-slate-400">{VOUCHER_STATUS_LABELS[r.status as VoucherStatus]}</td>
                  <td className="px-3 py-2 text-center text-slate-500">{r.lines?.length || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AccountingShell>
  );
}
