'use client';

import type {
  MessengerActionState,
  MessengerCardAction,
  MessengerCardData,
  MessengerMessageType,
} from '@/lib/messenger/types';
import { CARD_TYPE_LABELS } from '@/lib/messenger/types';

interface MessageCardProps {
  type: MessengerMessageType;
  cardData: MessengerCardData;
  actions?: MessengerCardAction[];
  actionState?: MessengerActionState;
  isMine?: boolean;
  disabled?: boolean;
  onAction?: (actionId: MessengerCardAction['id']) => void;
}

const TYPE_ACCENT: Record<MessengerMessageType, string> = {
  text: 'border-slate-600',
  sales_report: 'border-emerald-500/60',
  order_request: 'border-amber-500/60',
  stock_alert: 'border-orange-500/60',
  customer_alert: 'border-violet-500/60',
  cctv_alert: 'border-red-500/60',
  calendar_event: 'border-sky-500/60',
  poll: 'border-violet-500/60',
};

const ACTION_STYLE: Record<string, string> = {
  primary: 'bg-teal-600 hover:bg-teal-500 text-white',
  danger: 'bg-red-600/90 hover:bg-red-500 text-white',
  ghost: 'bg-slate-700 hover:bg-slate-600 text-slate-200',
};

export default function MessageCard({
  type,
  cardData,
  actions = [],
  actionState = {},
  isMine,
  disabled,
  onAction,
}: MessageCardProps) {
  const accent = TYPE_ACCENT[type] || TYPE_ACCENT.text;

  return (
    <div className={`min-w-[220px] max-w-[320px] rounded-xl border-l-4 ${accent} bg-slate-900/90 border border-slate-700 overflow-hidden`}>
      <div className="px-3 py-2 border-b border-slate-800/80">
        <p className="text-[10px] uppercase tracking-wide text-teal-400/90 font-semibold">
          {CARD_TYPE_LABELS[type]}
        </p>
        <p className="text-sm font-semibold text-slate-100 mt-0.5">{cardData.title}</p>
        {cardData.subtitle && (
          <p className="text-xs text-slate-400 mt-0.5">{cardData.subtitle}</p>
        )}
      </div>

      {cardData.fields && cardData.fields.length > 0 && (
        <div className="px-3 py-2 space-y-1.5">
          {cardData.fields.map((f) => (
            <div key={`${f.label}-${f.value}`} className="flex justify-between gap-2 text-xs">
              <span className="text-slate-500 shrink-0">{f.label}</span>
              <span className="text-slate-200 text-right font-medium">{f.value}</span>
            </div>
          ))}
        </div>
      )}

      {cardData.footer && (
        <p className="px-3 pb-2 text-[11px] text-slate-500">{cardData.footer}</p>
      )}

      {actions.length > 0 && (
        <div className={`px-3 pb-3 flex flex-wrap gap-1.5 ${isMine ? 'justify-end' : 'justify-start'}`}>
          {actions.map((action) => {
            const done = actionState[action.id]?.status === 'done';
            const style = ACTION_STYLE[action.style || 'ghost'] || ACTION_STYLE.ghost;
            return (
              <button
                key={action.id}
                type="button"
                disabled={disabled || done}
                onClick={() => onAction?.(action.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${style}`}
              >
                {done ? `✓ ${action.label}` : action.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
