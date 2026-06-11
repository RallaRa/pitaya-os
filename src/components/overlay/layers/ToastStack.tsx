'use client';

import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import type { ToastItem, ToastVariant } from '../types';

const VARIANT_STYLES: Record<ToastVariant, { border: string; icon: typeof Info; iconClass: string }> = {
  default: { border: 'border-slate-700', icon: Info, iconClass: 'text-teal-400' },
  success: { border: 'border-teal-500/40', icon: CheckCircle2, iconClass: 'text-teal-400' },
  error: { border: 'border-red-500/40', icon: AlertCircle, iconClass: 'text-red-400' },
  info: { border: 'border-slate-600', icon: Info, iconClass: 'text-slate-300' },
};

interface ToastStackProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export default function ToastStack({ toasts, onDismiss }: ToastStackProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[2000] flex flex-col gap-2 w-[min(100vw-2rem,22rem)] pointer-events-none safe-top">
      {toasts.map(toast => {
        const style = VARIANT_STYLES[toast.variant];
        const Icon = style.icon;
        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-2.5 px-3.5 py-3 rounded-xl bg-slate-900 border shadow-xl transition-all duration-200 ${
              toast.exiting ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0 overlay-toast-enter'
            } ${style.border}`}
            role="status"
          >
            <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${style.iconClass}`} />
            <p className="text-sm text-slate-200 leading-snug flex-1 whitespace-pre-wrap">{toast.message}</p>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="shrink-0 p-0.5 text-slate-500 hover:text-white transition-colors"
              aria-label="닫기"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
