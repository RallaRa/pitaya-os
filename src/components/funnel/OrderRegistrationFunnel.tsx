'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useFunnel } from '@/hooks/useFunnel';
import FunnelShell from '@/components/funnel/FunnelShell';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';

const STEP_LABELS = ['품목선택', '수량입력', '확인', '완료'] as const;

interface TemplateLine {
  itemName: string;
  qty: number;
  unit: string;
}

interface OrderItem {
  key: string;
  name: string;
  unit: string;
  qty: number;
}

export interface OrderRegistrationData {
  templateId: string;
  templateName: string;
  items: OrderItem[];
  messageId?: string;
}

interface Props {
  storeId: string;
  templateId: string;
  templateName: string;
  lines: TemplateLine[];
  onClose?: () => void;
  onDone?: () => void;
}

export default function OrderRegistrationFunnel({
  storeId,
  templateId,
  templateName,
  lines,
  onClose,
  onDone,
}: Props) {
  const [submitting, setSubmitting] = useState(false);

  const initialItems = useMemo(
    () =>
      lines.map((line, i) => ({
        key: `${line.itemName}-${i}`,
        name: line.itemName,
        unit: line.unit || '개',
        qty: line.qty ?? 0,
      })),
    [lines],
  );

  const funnel = useFunnel<OrderRegistrationData>({
    syncToUrl: false,
    steps: [
      {
        id: 'items',
        title: '품목선택',
        validate: ctx => (ctx.items.filter(i => i.qty > 0).length === 0 ? '발주할 품목을 선택하세요' : null),
      },
      {
        id: 'qty',
        title: '수량입력',
        validate: ctx => (ctx.items.every(i => i.qty <= 0) ? '수량을 입력하세요' : null),
      },
      { id: 'confirm', title: '확인' },
      { id: 'done', title: '완료' },
    ],
    initialContext: { templateId, templateName, items: initialItems },
  });

  useEffect(() => {
    funnel.setContext({ templateId, templateName, items: initialItems });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, templateName, initialItems]);

  const toggleItem = (key: string) => {
    funnel.patchContext({
      items: funnel.context.items.map(it =>
        it.key === key ? { ...it, qty: it.qty > 0 ? 0 : 1 } : it,
      ),
    });
  };

  const setQty = (key: string, qty: number) => {
    funnel.patchContext({
      items: funnel.context.items.map(it => (it.key === key ? { ...it, qty: Math.max(0, qty) } : it)),
    });
  };

  const selectedItems = funnel.context.items.filter(i => i.qty > 0);

  const handleExecute = async () => {
    setSubmitting(true);
    funnel.setError(null);
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/order-templates/execute', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          storeId,
          templateId,
          lines: selectedItems.map(i => ({
            itemName: i.name,
            qty: i.qty,
            unit: i.unit,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '발주 실패');
      funnel.patchContext({ messageId: data.messageId });
      onDone?.();
      funnel.goTo(4);
    } catch (e) {
      funnel.setError(e instanceof Error ? e.message : '발주 실패');
    } finally {
      setSubmitting(false);
    }
  };

  const fieldClass =
    'w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-teal-500';

  const renderStep = () => {
    if (funnel.context.items.length === 0) {
      return <div className="text-slate-500 text-sm py-8 text-center">템플릿에 품목이 없습니다.</div>;
    }

    switch (funnel.step) {
      case 1:
        return (
          <div className="space-y-2 max-w-lg">
            <p className="text-xs text-slate-500 mb-3">템플릿: {templateName}</p>
            {funnel.context.items.map(it => (
              <button
                key={it.key}
                type="button"
                onClick={() => toggleItem(it.key)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                  it.qty > 0 ? 'border-teal-500/50 bg-teal-500/10 text-teal-300' : 'border-slate-700 bg-slate-800/50 text-slate-300 hover:border-slate-600'
                }`}
              >
                <span>{it.name}</span>
                <span className="text-xs text-slate-500">{it.unit}</span>
              </button>
            ))}
          </div>
        );
      case 2:
        return (
          <div className="space-y-3 max-w-md">
            {selectedItems.map(it => (
              <div key={it.key} className="flex items-center gap-3">
                <span className="flex-1 text-sm text-slate-300 truncate">{it.name}</span>
                <input
                  type="number"
                  min={1}
                  className={`${fieldClass} w-24`}
                  value={it.qty}
                  onChange={e => setQty(it.key, Number(e.target.value))}
                />
                <span className="text-xs text-slate-500 w-8">{it.unit}</span>
              </div>
            ))}
          </div>
        );
      case 3:
        return (
          <div className="max-w-md space-y-2">
            <p className="text-xs text-slate-500 mb-3">아래 내용으로 발주 요청을 보냅니다.</p>
            {selectedItems.map(it => (
              <div key={it.key} className="flex justify-between text-sm py-2 border-b border-slate-800">
                <span className="text-slate-300">{it.name}</span>
                <span className="text-teal-400">{it.qty} {it.unit}</span>
              </div>
            ))}
          </div>
        );
      default:
        return (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <CheckCircle2 className="w-12 h-12 text-teal-400 mb-3" />
            <p className="text-slate-200 font-semibold">발주 요청이 메신저로 전송되었습니다</p>
            {onClose && (
              <button type="button" onClick={onClose} className="mt-6 px-4 py-2 text-xs bg-slate-800 hover:bg-slate-700 rounded-lg">
                닫기
              </button>
            )}
          </div>
        );
    }
  };

  if (funnel.step >= 4) {
    return (
      <div className="bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden min-h-[420px] w-full max-w-lg">
        <div className="px-5 py-4 border-b border-slate-800">
          <h2 className="text-sm font-bold text-teal-400">발주 등록</h2>
        </div>
        <div className="px-5 py-4">{renderStep()}</div>
      </div>
    );
  }

  return (
    <div className="bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden min-h-[480px] w-full max-w-lg flex flex-col">
      <FunnelShell
        title="발주 등록"
        steps={STEP_LABELS.slice(0, 3)}
        currentStep={funnel.step}
        direction={funnel.direction}
        error={funnel.error}
        isFirst={funnel.isFirst}
        isLast={funnel.step === 3}
        submitting={submitting}
        onPrev={funnel.prev}
        onNext={funnel.next}
        onComplete={handleExecute}
        completeLabel="발주하기"
      >
        {renderStep()}
      </FunnelShell>
    </div>
  );
}
