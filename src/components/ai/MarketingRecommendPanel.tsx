'use client';

import { useCallback, useState } from 'react';
import dynamic from 'next/dynamic';
import * as XLSX from 'xlsx';
import { Download, FileSpreadsheet, Loader2, Shield } from 'lucide-react';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import {
  isPiiUnlockTokenValid,
  loadPiiUnlockToken,
} from '@/lib/piiStepUp/piiUnlockSession.client';
import type { MarketingRecommendation } from '@/lib/marketing/couponRecommendation';

const PiiUnlockModal = dynamic(
  () => import('@/components/customers/PiiUnlockModal'),
  { ssr: false },
);

export interface MarketingRecommendPayload {
  generatedAt: string;
  recommendationCount: number;
  segmentCounts: Record<string, number>;
  items: MarketingRecommendation[];
}

interface MarketingRecommendPanelProps {
  data: MarketingRecommendPayload;
  storeId: string;
  uid: string;
}

function toExcelRows(items: MarketingRecommendation[]) {
  return items.map(r => ({
    이름: r.name,
    전화번호: r.phone || r.phoneMasked,
    고객코드: r.cusCode,
    세그먼트: r.segmentLabel,
    판단기준: r.criteria,
    '쿠폰/혜택': r.couponAction,
    마케팅문자: r.messageText,
    채널: r.channel,
    우선순위: r.priority,
    등급: r.pitayaGrade,
    마지막방문: r.lastVisitDate,
    '미방문일수': r.daysSinceLastVisit ?? '',
    이탈스코어: r.churnScore,
  }));
}

export default function MarketingRecommendPanel({
  data,
  storeId,
  uid,
}: MarketingRecommendPanelProps) {
  const [piiUnlockOpen, setPiiUnlockOpen] = useState(false);
  const [stepUpToken, setStepUpToken] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const previewItems = data.items.slice(0, 20);

  const downloadExcel = useCallback(async (token: string) => {
    setExporting(true);
    setExportError(null);
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/marketing/coupon-recommendations', {
        method: 'POST',
        headers: { ...headers, 'x-pii-unlock-token': token },
        body: JSON.stringify({ storeId, stepUpToken: token }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.code === 'STEP_UP_REQUIRED') {
          setPiiUnlockOpen(true);
          return;
        }
        throw new Error(json.error || `오류 (${res.status})`);
      }
      const rows = toExcelRows(json.items || []);
      if (!rows.length) {
        setExportError('다운로드할 추천 대상이 없습니다.');
        return;
      }
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '마케팅추천');
      const date = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `마케팅추천_${date}.xlsx`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setExportError(msg);
    } finally {
      setExporting(false);
    }
  }, [storeId]);

  const handleExportClick = () => {
    const token = stepUpToken || loadPiiUnlockToken(uid, storeId);
    if (!token || !isPiiUnlockTokenValid(uid, storeId)) {
      setPiiUnlockOpen(true);
      return;
    }
    void downloadExcel(token);
  };

  const handlePiiUnlocked = (token: string, _expiresAt?: number) => {
    setStepUpToken(token);
    setPiiUnlockOpen(false);
    void downloadExcel(token);
  };

  return (
    <div className="mt-3 rounded-xl border border-teal-500/30 bg-teal-500/5 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-teal-500/20 bg-teal-500/10">
        <div className="flex items-center gap-2 text-sm font-semibold text-teal-300">
          <FileSpreadsheet className="w-4 h-4" />
          마케팅 추천 리스트 ({data.recommendationCount}명)
        </div>
        <button
          type="button"
          onClick={handleExportClick}
          disabled={exporting || data.recommendationCount === 0}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-xs font-medium transition-colors"
        >
          {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          엑셀 다운로드 (이름·전화번호)
        </button>
      </div>

      <div className="px-4 py-2 flex flex-wrap gap-1.5">
        {Object.entries(data.segmentCounts).map(([label, count]) => (
          <span
            key={label}
            className="text-[11px] px-2 py-0.5 rounded-full border bg-slate-800/80 text-slate-300 border-slate-600"
          >
            {label} {count}명
          </span>
        ))}
      </div>

      <p className="px-4 pb-2 text-[11px] text-slate-400 flex items-center gap-1">
        <Shield className="w-3 h-3" />
        엑셀에는 이름·전화번호가 포함됩니다. 지문/휴대폰 본인 확인 후 다운로드됩니다.
      </p>

      {exportError && (
        <p className="px-4 pb-2 text-xs text-red-400">{exportError}</p>
      )}

      <div className="overflow-x-auto max-h-64">
        <table className="w-full text-xs text-left">
          <thead className="bg-slate-800/60 text-slate-400 sticky top-0">
            <tr>
              <th className="px-3 py-2 font-medium">세그먼트</th>
              <th className="px-3 py-2 font-medium">고객코드</th>
              <th className="px-3 py-2 font-medium">전화(마스킹)</th>
              <th className="px-3 py-2 font-medium">쿠폰/혜택</th>
              <th className="px-3 py-2 font-medium">우선순위</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {previewItems.map(row => (
              <tr key={row.cusCode} className="hover:bg-slate-800/40">
                <td className="px-3 py-2 text-teal-200 whitespace-nowrap">{row.segmentLabel}</td>
                <td className="px-3 py-2 text-slate-300 font-mono">{row.cusCode}</td>
                <td className="px-3 py-2 text-slate-400">{row.phoneMasked || '—'}</td>
                <td className="px-3 py-2 text-slate-300 max-w-[200px] truncate" title={row.couponAction}>
                  {row.couponAction}
                </td>
                <td className="px-3 py-2 text-slate-400">{row.priority}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.recommendationCount > 20 && (
        <p className="px-4 py-2 text-[11px] text-slate-500 border-t border-slate-700/50">
          미리보기 20명 · 전체 {data.recommendationCount}명은 엑셀에서 확인
        </p>
      )}

      {piiUnlockOpen && (
        <PiiUnlockModal
          open={piiUnlockOpen}
          storeId={storeId}
          uid={uid}
          onClose={() => setPiiUnlockOpen(false)}
          onUnlocked={handlePiiUnlocked}
        />
      )}
    </div>
  );
}
