'use client';

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { getAuthHeaders } from '@/lib/getAuthHeaders';
import type { ErpExportFormat } from '@/lib/accounting/export/types';

interface Props {
  storeId: string;
  defaultStartDate?: string;
  defaultEndDate?: string;
  defaultStatus?: string;
}

function monthStartYMD() {
  const d = new Date(Date.now() + 9 * 3600_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function todayYMD() {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}

export default function VoucherExportButton({
  storeId,
  defaultStartDate,
  defaultEndDate,
  defaultStatus = 'approved',
}: Props) {
  const [format, setFormat] = useState<ErpExportFormat>('younglimwon');
  const [startDate, setStartDate] = useState(defaultStartDate || monthStartYMD());
  const [endDate, setEndDate] = useState(defaultEndDate || todayYMD());
  const [status, setStatus] = useState(defaultStatus);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const download = async () => {
    if (!storeId || loading) return;
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const params = new URLSearchParams({
        storeId,
        format,
        startDate,
        endDate,
        status,
      });
      const res = await fetch(`/api/accounting/vouchers/export?${params}`, { headers });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || '다운로드 실패');
      }
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') || '';
      const match = cd.match(/filename\*=UTF-8''([^;]+)/i);
      const filename = match ? decodeURIComponent(match[1]) : `전표_${format}.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setOpen(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : '다운로드 실패');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="text-xs px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 inline-flex items-center gap-1 border border-slate-700"
      >
        <Download className="w-3.5 h-3.5" /> ERP 다운로드
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 w-72 bg-slate-900 border border-slate-700 rounded-xl shadow-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-slate-200">전표 ERP 포맷</p>

            <div className="flex gap-2">
              {(['younglimwon', 'douzone'] as ErpExportFormat[]).map(f => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFormat(f)}
                  className={`flex-1 py-1.5 text-xs rounded-lg border ${
                    format === f
                      ? 'bg-teal-900/40 border-teal-500/50 text-teal-200'
                      : 'bg-slate-800 border-slate-700 text-slate-400'
                  }`}
                >
                  {f === 'younglimwon' ? '영림원' : '더존'}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="text-[10px] text-slate-500">
                시작일
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="mt-1 w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white" />
              </label>
              <label className="text-[10px] text-slate-500">
                종료일
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="mt-1 w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white" />
              </label>
            </div>

            <label className="text-[10px] text-slate-500 block">
              전표상태
              <select value={status} onChange={e => setStatus(e.target.value)} className="mt-1 w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white">
                <option value="approved">승인</option>
                <option value="pending">승인대기</option>
                <option value="draft">작성중</option>
                <option value="all">전체</option>
              </select>
            </label>

            <p className="text-[10px] text-slate-600 leading-relaxed">
              계정과목의 <span className="text-slate-400">외부코드</span>가 ERP 계정코드로 매핑됩니다.
            </p>

            <button
              type="button"
              disabled={loading}
              onClick={download}
              className="w-full py-2 text-xs bg-teal-700 hover:bg-teal-600 text-white rounded-lg disabled:opacity-50 inline-flex items-center justify-center gap-1"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              {format === 'younglimwon' ? '영림원' : '더존'} Excel 다운로드
            </button>
          </div>
        </>
      )}
    </div>
  );
}
