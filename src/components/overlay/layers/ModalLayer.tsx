'use client';

import type { ModalOverlayItem } from '../types';

interface ModalLayerProps {
  item: ModalOverlayItem;
  zIndex: number;
  onClose: () => void;
}

export default function ModalLayer({ item, zIndex, onClose }: ModalLayerProps) {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex }}
      role="dialog"
      aria-modal="true"
    >
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
        className={`relative w-full max-w-lg transition-all duration-200 ${
          item.exiting ? 'opacity-0 scale-95' : 'opacity-100 scale-100 overlay-modal-enter'
        } ${item.className ?? ''}`}
        onClick={e => e.stopPropagation()}
      >
        {item.content}
      </div>
    </div>
  );
}
