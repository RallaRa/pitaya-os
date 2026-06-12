'use client';

import { overlay } from '@/components/overlay';
import { CouponIssueFunnel, OrderRegistrationFunnel } from '@/components/funnel';
import SignageShowStudio from '@/components/signage/SignageShowStudio';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import type { ExecutableBriefingAction } from '@/lib/briefingActions';
import {
  completeBriefingActionLogClient,
  startBriefingActionLog,
} from '@/lib/briefing/logBriefingAction.client';

interface OrderTemplate {
  id: string;
  name?: string;
  lines?: { itemName: string; qty: number; unit: string }[];
}

async function fetchOrderTemplates(storeId: string): Promise<OrderTemplate[]> {
  const headers = await getAuthJsonHeaders();
  const res = await fetch(`/api/order-templates?storeId=${encodeURIComponent(storeId)}`, { headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '발주 템플릿을 불러오지 못했습니다');
  return (data.templates || []) as OrderTemplate[];
}

function wrapComplete(storeId: string, logId: string | null, result?: Record<string, unknown>) {
  return () => {
    if (logId) void completeBriefingActionLogClient(storeId, logId, result);
  };
}

export async function runBriefingActionExecute(
  action: ExecutableBriefingAction,
  storeId: string,
): Promise<boolean> {
  if (!storeId || action.actionType === 'none') return false;

  const logId = await startBriefingActionLog(storeId, action);

  switch (action.actionType) {
    case 'coupon': {
      const coupon = action.params?.coupon;
      overlay.open(
        <CouponIssueFunnel
          storeId={storeId}
          initialContext={{
            title: coupon?.title || action.text.slice(0, 40),
            type: coupon?.type || 'percent',
            value: coupon?.value ?? 10,
            minAmount: coupon?.minAmount ?? 0,
            validDays: coupon?.validDays ?? 7,
          }}
          onClose={() => overlay.close()}
          onDone={() => {
            wrapComplete(storeId, logId, { type: 'coupon' })();
            overlay.toast('쿠폰이 발행되었습니다', { variant: 'success' });
          }}
        />,
        { className: 'max-w-lg w-full', closeOnBackdrop: false },
      );
      return true;
    }

    case 'signage': {
      const prompt = action.params?.signage?.prompt || action.text;
      overlay.open(
        <div className="bg-slate-950 rounded-2xl overflow-hidden max-h-[90vh] flex flex-col">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
            <p className="text-sm font-semibold text-teal-300">브리핑 → POP·사이니지</p>
            <button
              type="button"
              onClick={() => overlay.close()}
              className="text-xs text-slate-400 hover:text-white"
            >
              닫기
            </button>
          </div>
          <div className="overflow-y-auto min-h-0 flex-1">
            <SignageShowStudio
              storeId={storeId}
              initialPrompt={prompt}
              onSaved={() => {
                wrapComplete(storeId, logId, { type: 'signage' })();
                overlay.toast('사이니지 쇼가 저장되었습니다', { variant: 'success' });
                overlay.close();
              }}
              onError={(msg) => overlay.toast(msg, { variant: 'error' })}
            />
          </div>
        </div>,
        { className: 'max-w-2xl w-full', closeOnBackdrop: false },
      );
      return true;
    }

    case 'order': {
      const templates = await fetchOrderTemplates(storeId);
      if (templates.length === 0) {
        overlay.toast('발주 템플릿이 없습니다. 주문 → 발주 템플릿에서 먼저 등록하세요.');
        return false;
      }

      const preferredId = action.params?.order?.templateId;
      const template = templates.find(t => t.id === preferredId) || templates[0];
      overlay.open(
        <OrderRegistrationFunnel
          storeId={storeId}
          templateId={template.id}
          templateName={template.name || action.params?.order?.templateName || '발주'}
          lines={template.lines || []}
          onClose={() => overlay.close()}
          onDone={() => {
            wrapComplete(storeId, logId, { type: 'order', templateId: template.id })();
            overlay.toast('발주 요청이 전송되었습니다', { variant: 'success' });
          }}
        />,
        { className: 'max-w-lg w-full', closeOnBackdrop: false },
      );
      return true;
    }

    default:
      return false;
  }
}
