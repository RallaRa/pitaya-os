'use client';

import {
  X, Trash2, CheckCircle, XCircle, FileText, Upload,
} from 'lucide-react';
import { formatFileResultLine } from '@/lib/purchaseAiLabels';
import { formatPurchaseQty } from '@/lib/purchaseQtyFormat';
import type { AnalysisHistoryEntry } from '@/components/purchases/PurchaseAnalysisHistory';
import type { Invoice } from '@/components/purchases/PurchaseSheet';

function formatWhen(iso: string | null) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const fmt = (n: number) => (n || 0).toLocaleString('ko-KR');

function InvoiceBlock({ invoice, index }: { invoice: Invoice; index: number }) {
  return (
    <div className="border border-slate-700/80 rounded-xl overflow-hidden bg-slate-900/40">
      <div className="px-3 py-2 bg-slate-800/50 border-b border-slate-700/60 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px]">
        <span className="text-slate-500">#{index + 1}</span>
        {invoice.supplierName && (
          <span className="text-slate-200 font-semibold">{invoice.supplierName}</span>
        )}
        {invoice.purchaseDate && (
          <span className="text-slate-400">매입일 {invoice.purchaseDate}</span>
        )}
        {invoice.paymentMethod && (
          <span className="text-slate-400">{invoice.paymentMethod}</span>
        )}
        {invoice.invoiceNumber && (
          <span className="text-slate-500">전표 {invoice.invoiceNumber}</span>
        )}
        <span className="ml-auto text-teal-400 font-bold tabular-nums">
          {fmt(invoice.totalAmount)}원
        </span>
      </div>
      {invoice.items.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-[10px] border-collapse min-w-[480px]">
            <thead>
              <tr className="border-b border-slate-800 text-slate-500">
                <th className="text-left px-2 py-1.5 font-medium">품명</th>
                <th className="text-left px-2 py-1.5 font-medium w-14">구분</th>
                <th className="text-right px-2 py-1.5 font-medium w-16">수량</th>
                <th className="text-right px-2 py-1.5 font-medium w-20">단가</th>
                <th className="text-right px-2 py-1.5 font-medium w-20">공급가</th>
                <th className="text-left px-2 py-1.5 font-medium w-24">이력번호</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item, i) => (
                <tr key={i} className="border-b border-slate-800/50">
                  <td className="px-2 py-1 text-slate-200">{item.name || '-'}</td>
                  <td className="px-2 py-1 text-slate-400">{item.category || '-'}</td>
                  <td className="px-2 py-1 text-right text-slate-300 tabular-nums">
                    {formatPurchaseQty(item.qty, item.unit)}{item.unit}
                  </td>
                  <td className="px-2 py-1 text-right text-slate-300 tabular-nums">{fmt(item.unitPrice)}</td>
                  <td className="px-2 py-1 text-right text-slate-300 tabular-nums">{fmt(item.supplyAmount)}</td>
                  <td className="px-2 py-1 text-slate-500 font-mono text-[9px]">{item.traceNo || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-3 py-3 text-[10px] text-slate-500">품목 없음</p>
      )}
      {invoice.memo && (
        <p className="px-3 py-2 text-[10px] text-slate-500 border-t border-slate-800/50">메모: {invoice.memo}</p>
      )}
    </div>
  );
}

interface Props {
  entry: AnalysisHistoryEntry;
  onClose: () => void;
  onLoadToSheet?: (invoices: Invoice[]) => void;
  onDelete?: (id: string) => void;
}

export default function PurchaseAnalysisDetailPanel({
  entry,
  onClose,
  onLoadToSheet,
  onDelete,
}: Props) {
  const hasInvoices = (entry.invoices?.length || 0) > 0;

  return (
    <div className="h-full flex flex-col bg-slate-900 border border-teal-700/40 rounded-2xl overflow-hidden shadow-lg">
      <div className="flex items-start gap-2 px-3 py-2.5 bg-teal-950/30 border-b border-teal-800/40 shrink-0">
        {entry.success
          ? <CheckCircle className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
          : <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-bold text-slate-100">분석 상세</h2>
            <span className="text-[10px] text-slate-500">{formatWhen(entry.createdAt)}</span>
            <span className="text-[10px] text-teal-400/90">
              {entry.invoiceCount > 0 ? `${entry.invoiceCount}건 추출` : '추출 실패'}
            </span>
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5 truncate" title={entry.fileNames.join(', ')}>
            {entry.fileNames.join(', ') || '파일 없음'}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {hasInvoices && onLoadToSheet && (
            <button
              type="button"
              onClick={() => onLoadToSheet(entry.invoices!)}
              className="flex items-center gap-1 text-[10px] font-medium text-black bg-teal-400 hover:bg-teal-300 px-2 py-1 rounded-lg transition-colors"
            >
              <Upload className="w-3 h-3" />
              시트에 불러오기
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(entry.id)}
              className="p-1.5 text-slate-500 hover:text-red-400 rounded-lg hover:bg-slate-800 transition-colors"
              title="기록 삭제"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-200 px-2 py-1 rounded-lg hover:bg-slate-800 transition-colors"
            title="매입 시트로 돌아가기"
          >
            <X className="w-3.5 h-3.5" />
            시트로
          </button>
        </div>
      </div>

      <div className="flex-1 px-3 py-3 space-y-3 overflow-y-auto min-h-0">
        {entry.userMessage && entry.userMessage !== '파일을 분석해 주세요.' && (
          <div className="text-[10px] text-slate-400">
            <span className="text-slate-500">요청: </span>{entry.userMessage}
          </div>
        )}

        {entry.suppliers.length > 0 && (
          <div className="text-[10px] text-slate-300">
            <span className="text-slate-500">공급업체: </span>{entry.suppliers.join(', ')}
          </div>
        )}

        <div className="space-y-1.5">
          <p className="text-[10px] font-medium text-slate-500 flex items-center gap-1">
            <FileText className="w-3 h-3" /> AI 분석 결과
          </p>
          {entry.fileResults.map((fr, i) => (
            <div
              key={i}
              className="text-[10px] text-slate-400 leading-relaxed whitespace-pre-wrap bg-slate-950/50 rounded-lg px-2 py-1.5 border border-slate-800/60"
            >
              {formatFileResultLine(fr)}
            </div>
          ))}
        </div>

        {entry.errors.length > 0 && (
          <p className="text-[10px] text-red-400/90 bg-red-950/20 border border-red-900/40 rounded-lg px-2 py-1.5">
            {entry.errors.join(' · ')}
          </p>
        )}

        {hasInvoices ? (
          <div className="space-y-2 pt-1">
            <p className="text-[10px] font-medium text-slate-500">추출 매입 내역</p>
            {entry.invoices!.map((inv, idx) => (
              <InvoiceBlock key={idx} invoice={inv} index={idx} />
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-slate-600 py-2">
            저장된 품목 상세가 없습니다. (이전 분석 기록) 새로 분석하면 상세 내역이 저장됩니다.
          </p>
        )}
      </div>
    </div>
  );
}
