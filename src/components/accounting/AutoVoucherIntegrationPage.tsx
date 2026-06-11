'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AccountingShell from '@/components/accounting/AccountingShell';
import PurchaseVoucherIntegrationPanel from '@/components/accounting/PurchaseVoucherIntegrationPanel';
import SalesVoucherIntegrationPanel from '@/components/accounting/SalesVoucherIntegrationPanel';

type TabId = 'purchase' | 'sales';

const TABS: { id: TabId; label: string }[] = [
  { id: 'purchase', label: '매입' },
  { id: 'sales', label: '매출' },
];

export default function AutoVoucherIntegrationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab: TabId = tabParam === 'sales' ? 'sales' : 'purchase';

  const [actions, setActions] = useState<React.ReactNode>(null);

  const setTab = (tab: TabId) => {
    router.replace(`/dashboard/accounting/integration/auto?tab=${tab}`, { scroll: false });
  };

  const handleActionsChange = useCallback((node: React.ReactNode) => {
    setActions(node);
  }, []);

  useEffect(() => {
    setActions(null);
  }, [activeTab]);

  return (
    <AccountingShell
      title="자동전표"
      description="매입·매출 원장을 선택해 분개 패턴으로 회계전표를 일괄 생성합니다."
      actions={actions}
    >
      <div className="flex gap-1 mb-4 p-1 bg-slate-900 border border-slate-800 rounded-xl w-fit">
        {TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setTab(tab.id)}
            className={`px-4 py-2 text-xs font-medium rounded-lg transition-colors ${
              activeTab === tab.id
                ? 'bg-teal-700 text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'purchase' ? (
        <PurchaseVoucherIntegrationPanel onActionsChange={handleActionsChange} />
      ) : (
        <SalesVoucherIntegrationPanel onActionsChange={handleActionsChange} />
      )}
    </AccountingShell>
  );
}
