'use client';

import { X } from 'lucide-react';
import type { BottomSheetOverlayItem } from '../types';

interface BottomSheetLayerProps {
  item: BottomSheetOverlayItem;
  zIndex: number;
  onClose: () => void;
}

export default function BottomSheetLayer({ item, zIndex, onClose }: BottomSheetLayerProps) {
  return (
    <div className="fixed inset-0 flex flex-col justify-end" style={{ zIndex }} role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="닫기"
        className={`absolute inset-0 bg-black/60 transition-opacity duration-200 ${
          item.exiting ? 'opacity-0' : 'opacity-100 overlay-backdrop-enter'
        }`}
        onClick={() => {
          if (item.closeOnBackdrop) onClose();
        }}
      />
      <div
        className={`relative bg-slate-900 border border-slate-700 rounded-t-2xl shadow-2xl max-h-[85vh] overflow-hidden transition-transform duration-200 safe-bottom ${
          item.exiting ? 'translate-y-full' : 'translate-y-0 overlay-sheet-enter'
        }`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
          <p className="text-sm font-semibold text-slate-200">{item.title ?? ''}</p>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label="닫기"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto max-h-[calc(85vh-3rem)]">{item.content}</div>
      </div>
    </div>
  );
}
