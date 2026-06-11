'use client';

import { useEffect, useState } from 'react';
import {
  Image as ImageIcon,
  X,
  ChevronLeft,
  ChevronRight,
  FileText,
  AlertCircle,
} from 'lucide-react';
import { normalizeStoragePublicUrl } from '@/lib/firebase/storageBucket';
import {
  isImageAttachment,
  isPdfAttachment,
  type PurchaseAttachment,
} from '@/lib/purchaseAttachments';

interface Props {
  attachments: PurchaseAttachment[];
  initialIndex?: number;
  onClose: () => void;
}

/** 매입 등록·원장 — Firebase에 보관된 원본 문서 조회 */
export default function PurchaseDocumentViewer({
  attachments,
  initialIndex = 0,
  onClose,
}: Props) {
  const [idx, setIdx] = useState(initialIndex);
  const [loadError, setLoadError] = useState(false);
  const total = attachments.length;
  const cur = attachments[idx];
  const displayUrl = cur ? normalizeStoragePublicUrl(cur.url) || cur.url : '';

  useEffect(() => {
    setLoadError(false);
  }, [idx, displayUrl]);

  if (!cur) return null;

  const prev = () => setIdx(i => (i - 1 + total) % total);
  const next = () => setIdx(i => (i + 1) % total);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="relative bg-slate-900 rounded-2xl overflow-hidden max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-700 shrink-0">
          <ImageIcon className="w-4 h-4 text-teal-400 shrink-0" />
          <span className="text-sm text-slate-200 flex-1 truncate" title={cur.name}>
            {cur.name}
          </span>
          <span className="text-xs text-slate-500 shrink-0">{idx + 1} / {total}</span>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto flex items-center justify-center bg-slate-950 min-h-[300px] relative">
          {loadError ? (
            <div className="flex flex-col items-center gap-3 text-slate-400 p-6 text-center">
              <AlertCircle className="w-10 h-10 text-amber-400" />
              <p className="text-sm text-slate-300">원본 이미지를 불러오지 못했습니다.</p>
              <a
                href={displayUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-teal-400 hover:text-teal-300 text-xs underline"
              >
                새 탭에서 열기
              </a>
            </div>
          ) : isImageAttachment(cur) ? (
            <img
              src={displayUrl}
              alt={cur.name}
              className="max-w-full max-h-[70vh] object-contain"
              onError={() => setLoadError(true)}
            />
          ) : isPdfAttachment(cur) ? (
            <div className="flex flex-col items-center gap-4 text-slate-400 p-6 w-full max-w-2xl">
              <FileText className="w-16 h-16 text-red-400" />
              <p className="text-sm text-center">{cur.name}</p>
              <iframe
                title={cur.name}
                src={displayUrl}
                className="w-full h-[60vh] rounded-lg border border-slate-700 bg-white"
              />
              <a
                href={displayUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-teal-400 hover:text-teal-300 text-xs underline"
              >
                새 탭에서 열기
              </a>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 text-slate-400 p-6">
              <p className="text-sm">{cur.name}</p>
              <a
                href={displayUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-teal-400 hover:text-teal-300 text-xs underline"
              >
                파일 다운로드 / 새 탭
              </a>
            </div>
          )}
          {total > 1 && (
            <>
              <button
                type="button"
                onClick={prev}
                className="absolute left-2 top-1/2 -translate-y-1/2 bg-slate-800/80 hover:bg-slate-700 text-white rounded-full p-2"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={next}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-slate-800/80 hover:bg-slate-700 text-white rounded-full p-2"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </>
          )}
        </div>

        {total > 1 && (
          <div className="flex gap-2 px-4 py-2 border-t border-slate-700 overflow-x-auto shrink-0">
            {attachments.map((a, i) => {
              const thumbUrl = normalizeStoragePublicUrl(a.url) || a.url;
              return (
                <button
                  key={`${a.url}-${i}`}
                  type="button"
                  onClick={() => setIdx(i)}
                  className={`shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-colors ${
                    i === idx ? 'border-teal-400' : 'border-slate-700 hover:border-slate-500'
                  }`}
                >
                  {isImageAttachment(a) ? (
                    <img src={thumbUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-slate-800 flex items-center justify-center">
                      <FileText className="w-6 h-6 text-red-400" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
