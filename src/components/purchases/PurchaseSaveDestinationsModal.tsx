'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  X, ChevronRight, ChevronLeft, Database, HardDrive, TrendingUp,
  Calendar, Brain, Tag, Bell, ExternalLink, Loader2, FileText,
} from 'lucide-react';
import type { PurchaseSaveDestination } from '@/lib/purchaseSaveDestinations';
import type { PurchaseAttachment } from '@/lib/purchaseAttachments';
import PurchaseDocumentViewer from '@/components/purchases/PurchaseDocumentViewer';
import { getAuthHeaders } from '@/lib/getAuthHeaders';

const KIND_ICON: Record<PurchaseSaveDestination['kind'], typeof Database> = {
  purchase_record: Database,
  storage: HardDrive,
  item_price: TrendingUp,
  expiry_reminder: Calendar,
  ocr_correction: Brain,
  item_alias: Tag,
  kakao_notify: Bell,
  auto_voucher: FileText,
};

interface PurchaseRecordDetail {
  id: string;
  purchaseDate?: string;
  supplierName?: string;
  invoiceNumber?: string;
  totalAmount?: number;
  items?: Array<{ name: string; qty?: number; unit?: string; unitPrice?: number }>;
}

interface Props {
  destinations: PurchaseSaveDestination[];
  supplierName?: string;
  storeId: string;
  purchaseRecordId?: string;
  attachments?: PurchaseAttachment[];
  initialKind?: PurchaseSaveDestination['kind'];
  onClose: () => void;
}

const fmt = (n: number) => (n || 0).toLocaleString('ko-KR');

function DestinationDetail({
  dest,
  storeId,
  purchaseRecordId,
  attachments,
  onOpenStorage,
}: {
  dest: PurchaseSaveDestination;
  storeId: string;
  purchaseRecordId?: string;
  attachments?: PurchaseAttachment[];
  onOpenStorage: (index?: number) => void;
}) {
  const [record, setRecord] = useState<PurchaseRecordDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (dest.kind !== 'purchase_record' || !purchaseRecordId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(
          `/api/purchases?storeId=${encodeURIComponent(storeId)}&id=${encodeURIComponent(purchaseRecordId)}`,
          { headers },
        );
        const data = await res.json();
        if (!cancelled && data.record) setRecord(data.record);
      } catch {
        if (!cancelled) setRecord(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [dest.kind, purchaseRecordId, storeId]);

  if (dest.kind === 'purchase_record') {
    return (
      <div className="space-y-3 text-sm">
        {loading ? (
          <div className="flex items-center gap-2 text-slate-400 py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> 전표 불러오는 중…
          </div>
        ) : record ? (
          <>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-slate-500">매입일</span><p className="text-slate-200">{record.purchaseDate || '—'}</p></div>
              <div><span className="text-slate-500">전표번호</span><p className="text-slate-200">{record.invoiceNumber || '—'}</p></div>
              <div className="col-span-2"><span className="text-slate-500">거래처</span><p className="text-white font-medium">{record.supplierName || '—'}</p></div>
              <div><span className="text-slate-500">합계</span><p className="text-teal-300 font-semibold">{fmt(record.totalAmount || 0)}원</p></div>
              <div><span className="text-slate-500">문서 ID</span><p className="text-slate-400 font-mono text-[10px] break-all">{record.id}</p></div>
            </div>
            {(record.items?.length ?? 0) > 0 && (
              <div className="border border-slate-700 rounded-lg overflow-hidden">
                <table className="w-full text-[11px]">
                  <thead className="bg-slate-800/80 text-slate-400">
                    <tr>
                      <th className="text-left px-2 py-1.5">품목</th>
                      <th className="text-right px-2 py-1.5">수량</th>
                      <th className="text-right px-2 py-1.5">단가</th>
                    </tr>
                  </thead>
                  <tbody>
                    {record.items!.slice(0, 8).map((it, i) => (
                      <tr key={i} className="border-t border-slate-800">
                        <td className="px-2 py-1 text-slate-200">{it.name}</td>
                        <td className="px-2 py-1 text-right text-slate-400">{it.qty}{it.unit}</td>
                        <td className="px-2 py-1 text-right text-slate-300">{fmt(it.unitPrice || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {dest.href && (
              <Link href={dest.href} className="inline-flex items-center gap-1 text-xs text-teal-400 hover:text-teal-300">
                <ExternalLink className="w-3 h-3" /> 매입 원장에서 보기
              </Link>
            )}
          </>
        ) : (
          <p className="text-slate-400 text-xs">전표를 불러오지 못했습니다.</p>
        )}
      </div>
    );
  }

  if (dest.kind === 'storage') {
    const files = attachments?.length
      ? attachments
      : (dest.detail?.attachments as PurchaseAttachment[] | undefined) || [];
    return (
      <div className="space-y-2">
        <p className="text-xs text-slate-400">
          Firebase Storage · <code className="text-slate-300">purchase_images/{storeId}/…</code>
        </p>
        <ul className="space-y-1">
          {files.map((f, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => onOpenStorage(i)}
                className="w-full flex items-center gap-2 text-left text-xs px-2 py-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-200"
              >
                <FileText className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                <span className="flex-1 truncate">{f.name}</span>
                <span className="text-slate-500 shrink-0">{f.mimeType}</span>
                <ChevronRight className="w-3 h-3 text-slate-500" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (dest.kind === 'item_price') {
    return (
      <div className="space-y-2">
        <p className="text-xs text-slate-400">Firestore · item_prices</p>
        <ul className="space-y-1 max-h-48 overflow-y-auto">
          {(dest.items || []).map((it, i) => (
            <li key={i}>
              {it.href ? (
                <Link
                  href={it.href}
                  className="flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-teal-300"
                >
                  <TrendingUp className="w-3.5 h-3.5 shrink-0" />
                  <span className="flex-1">{it.name}</span>
                  <ExternalLink className="w-3 h-3" />
                </Link>
              ) : (
                <span className="text-xs text-slate-300 px-2 py-1 block">{it.name}</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (dest.kind === 'expiry_reminder') {
    return (
      <div className="space-y-2">
        <p className="text-xs text-slate-400">Google Calendar + expiry_reminders · 7·3·1일 전 알림</p>
        <ul className="space-y-1.5">
          {(dest.items || []).map((it, i) => (
            <li key={i} className="text-xs px-2 py-1.5 rounded-lg bg-slate-800/60">
              <p className="text-slate-200 font-medium">{it.name}</p>
              {it.detail && <p className="text-amber-300/90 mt-0.5">{it.detail}</p>}
              {it.id && <p className="text-[10px] text-slate-500 font-mono mt-0.5">ID: {it.id}</p>}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (dest.kind === 'ocr_correction') {
    return (
      <div className="space-y-2 text-xs">
        <p className="text-slate-400">AI OCR 결과와 수정 내용이 저장되어 다음 분석에 반영됩니다.</p>
        <div className="px-2 py-1.5 rounded-lg bg-slate-800/60 font-mono text-[10px] text-slate-400 break-all">
          ocr_corrections / {dest.docId}
        </div>
      </div>
    );
  }

  if (dest.kind === 'item_alias') {
    return (
      <div className="space-y-2 text-xs">
        <p className="text-slate-400">품목명 수정이 별칭으로 학습되어 같은 표기를 자동 인식합니다.</p>
        <p className="text-teal-300">{dest.count ?? 0}건 · item_aliases</p>
      </div>
    );
  }

  if (dest.kind === 'kakao_notify') {
    const d = dest.detail || {};
    return (
      <div className="space-y-2 text-xs text-slate-400">
        <p>매장·등록자에게 카카오 알림이 발송되었습니다.</p>
        <p className="text-slate-300">
          {String(d.supplierName || '')} · {fmt(Number(d.totalAmount || 0))}원
        </p>
      </div>
    );
  }

  return null;
}

export default function PurchaseSaveDestinationsModal({
  destinations,
  supplierName,
  storeId,
  purchaseRecordId,
  attachments,
  initialKind,
  onClose,
}: Props) {
  const [selected, setSelected] = useState<PurchaseSaveDestination | null>(() => {
    if (initialKind) return destinations.find(d => d.kind === initialKind) || null;
    return null;
  });
  const [storageViewer, setStorageViewer] = useState<{ index: number } | null>(null);

  const storageAttachments = attachments?.length
    ? attachments
    : (destinations.find(d => d.kind === 'storage')?.detail?.attachments as PurchaseAttachment[] | undefined) || [];

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
        <div
          className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-xl"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-700 shrink-0">
            <Database className="w-4 h-4 text-teal-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-white">저장 위치</h3>
              {supplierName && <p className="text-[11px] text-slate-400 truncate">{supplierName}</p>}
            </div>
            <button type="button" onClick={onClose} className="text-slate-400 hover:text-white p-1">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
            {!selected ? (
              <>
                <p className="text-[11px] text-slate-500 px-1 mb-2">항목을 눌러 저장 위치를 확인하세요.</p>
                {destinations.map((dest, i) => {
                  const Icon = KIND_ICON[dest.kind];
                  return (
                    <button
                      key={`${dest.kind}-${i}`}
                      type="button"
                      onClick={() => setSelected(dest)}
                      className="w-full flex items-center gap-3 text-left px-3 py-2.5 rounded-xl bg-slate-800/50 hover:bg-slate-800 border border-slate-700/60 hover:border-teal-500/30 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-lg bg-teal-900/40 flex items-center justify-center shrink-0">
                        <Icon className="w-4 h-4 text-teal-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white font-medium">
                          {dest.label}
                          {dest.count != null && dest.count > 0 && (
                            <span className="text-teal-400 font-normal ml-1">{dest.count}건</span>
                          )}
                        </p>
                        {dest.sublabel && <p className="text-[10px] text-slate-500 truncate">{dest.sublabel}</p>}
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
                    </button>
                  );
                })}
              </>
            ) : (
              <div>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 mb-3"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> 목록으로
                </button>
                <div className="flex items-center gap-2 mb-3">
                  {(() => {
                    const Icon = KIND_ICON[selected.kind];
                    return <Icon className="w-4 h-4 text-teal-400" />;
                  })()}
                  <h4 className="text-sm font-semibold text-white">{selected.label}</h4>
                </div>
                <DestinationDetail
                  dest={selected}
                  storeId={storeId}
                  purchaseRecordId={purchaseRecordId}
                  attachments={storageAttachments}
                  onOpenStorage={index => setStorageViewer({ index: index ?? 0 })}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {storageViewer && storageAttachments.length > 0 && (
        <PurchaseDocumentViewer
          attachments={storageAttachments}
          initialIndex={storageViewer.index}
          onClose={() => setStorageViewer(null)}
        />
      )}
    </>
  );
}
