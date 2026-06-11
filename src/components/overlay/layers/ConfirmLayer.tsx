'use client';

import type { ConfirmOverlayItem } from '../types';

interface ConfirmLayerProps {
  item: ConfirmOverlayItem;
  zIndex: number;
  onConfirm: (value: boolean) => void;
  onCancel: () => void;
}

export default function ConfirmLayer({ item, zIndex, onConfirm, onCancel }: ConfirmLayerProps) {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex }}
      role="alertdialog"
      aria-modal="true"
    >
      <button
        type="button"
        aria-label="닫기"
        className={`absolute inset-0 bg-black/60 transition-opacity duration-200 ${
          item.exiting ? 'opacity-0' : 'opacity-100 overlay-backdrop-enter'
        }`}
        onClick={onCancel}
      />
      <div
        className={`relative w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden transition-all duration-200 ${
          item.exiting ? 'opacity-0 scale-95' : 'opacity-100 scale-100 overlay-modal-enter'
        }`}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3">
          <p className="text-sm font-semibold text-slate-200">{item.title}</p>
          <p className="text-sm text-slate-400 mt-2 whitespace-pre-wrap leading-relaxed">{item.message}</p>
        </div>
        <div className="flex border-t border-slate-800">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-3 text-sm text-slate-400 hover:bg-slate-800/60 transition-colors"
          >
            {item.cancelText}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(true)}
            className={`flex-1 py-3 text-sm font-semibold border-l border-slate-800 transition-colors ${
              item.destructive
                ? 'text-red-400 hover:bg-red-950/30'
                : 'text-teal-400 hover:bg-teal-950/30'
            }`}
          >
            {item.confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
