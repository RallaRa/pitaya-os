'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useStore } from '@/context/StoreContext';
import { getAuthHeaders } from '@/lib/getAuthHeaders';

interface ManualSalesAccessState {
  loading: boolean;
  canAccess: boolean;
  isStoreMember: boolean;
  hasPosBridge: boolean;
}

const INITIAL: ManualSalesAccessState = {
  loading: true,
  canAccess: false,
  isStoreMember: false,
  hasPosBridge: false,
};

export function useManualSalesAccess(): ManualSalesAccessState {
  const { user } = useAuth();
  const { currentStore } = useStore();
  const [state, setState] = useState<ManualSalesAccessState>(INITIAL);

  useEffect(() => {
    if (!user?.uid) {
      setState({ ...INITIAL, loading: false });
      return;
    }

    const storeId = currentStore?.storeId || '';
    if (!storeId) {
      setState({ ...INITIAL, loading: false });
      return;
    }

    setState(prev => ({ ...prev, loading: true }));

    getAuthHeaders()
      .then(headers => fetch(`/api/permissions?type=myAccess&storeId=${storeId}`, { headers }))
      .then(r => r.json())
      .then(d => {
        const isStoreMember = !!d.isStoreMember;
        const hasPosBridge = !!d.hasPosBridge;
        const hasSalesPerm = !!d.menuAccess?.sales;
        setState({
          loading: false,
          isStoreMember,
          hasPosBridge,
          canAccess: hasSalesPerm && isStoreMember && !hasPosBridge,
        });
      })
      .catch(() => setState({ ...INITIAL, loading: false }));
  }, [user?.uid, currentStore?.storeId]);

  return state;
}
