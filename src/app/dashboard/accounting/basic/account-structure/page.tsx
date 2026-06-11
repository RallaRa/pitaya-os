'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import AccountingShell from '@/components/accounting/AccountingShell';
import type { AccountingAccount } from '@/lib/accounting/types';
import { groupAccountsByType } from '@/lib/accounting/accountTree';

export default function AccountStructurePage() {
  const { currentStore } = useStore();
  const [accounts, setAccounts] = useState<AccountingAccount[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!currentStore?.storeId) return;
    setLoading(true);
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch(
        `/api/accounting/accounts?storeId=${encodeURIComponent(currentStore.storeId)}`,
        { headers },
      );
      const data = await res.json();
      setAccounts(data.accounts || []);
    } finally {
      setLoading(false);
    }
  }, [currentStore?.storeId]);

  useEffect(() => { load(); }, [load]);

  const tree = useMemo(() => groupAccountsByType(accounts), [accounts]);

  return (
    <AccountingShell>
      <p className="text-xs text-slate-500 mb-4">
        재무제표 양식 구조에 매핑되는 계정과목 트리입니다. (영림원 · 계정과목 구조)
      </p>
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-teal-400" /></div>
      ) : (
        <div className="space-y-4">
          {tree.map(group => (
            <div key={group.type} className="border border-slate-800 rounded-xl overflow-hidden">
              <div className="px-3 py-2 bg-slate-800/60 text-sm font-semibold text-slate-200">
                {group.label}
                <span className="text-xs font-normal text-slate-500 ml-2">{group.accounts.length}건</span>
              </div>
              <ul className="divide-y divide-slate-800/80">
                {group.accounts.map(ac => (
                  <li key={ac.id} className="px-3 py-2 flex items-center gap-3 text-xs">
                    <span className="font-mono text-teal-400/90 w-12">{ac.code}</span>
                    <span className="text-slate-200 flex-1">{ac.name}</span>
                    {ac.parentCode && (
                      <span className="text-slate-600">↑ {ac.parentCode}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </AccountingShell>
  );
}
