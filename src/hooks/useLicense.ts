'use client';

import { useState, useEffect, useCallback } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { useStore } from '@/context/StoreContext';
import {
  defaultStoreModules,
  LicenseModuleKey,
  StoreModules,
} from '@/lib/licenses';

export function useLicense() {
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';
  const [modules, setModules] = useState<StoreModules | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!storeId) {
      setModules(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsub = onSnapshot(
      doc(db, 'store_licenses', storeId),
      snap => {
        if (snap.exists()) {
          const data = snap.data();
          setModules({ ...defaultStoreModules(), ...(data.modules || {}) });
        } else {
          setModules(defaultStoreModules());
        }
        setLoading(false);
      },
      () => {
        setModules(defaultStoreModules());
        setLoading(false);
      },
    );

    return () => unsub();
  }, [storeId]);

  const hasModule = useCallback(
    (module: LicenseModuleKey): boolean => {
      if (!modules) return true;
      return modules[module]?.enabled ?? true;
    },
    [modules],
  );

  return { modules, hasModule, loading, storeId };
}
