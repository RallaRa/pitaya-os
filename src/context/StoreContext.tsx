'use client';
import { createContext, useContext, useState, ReactNode } from 'react';

interface Store {
  storeId: string;
  storeName: string;
  region: string;
  regionSido: string;
  regionSigungu: string;
  role: string;
  address?: string;
  phone?: string;
  businessNumber?: string;
  ownerName?: string;
}

interface StoreContextType {
  currentStore: Store | null;
  myStores: Store[];
  storesLoaded: boolean;
  setCurrentStore: (store: Store) => void;
  refreshStores: (uid: string) => Promise<Store[]>;
  clearStore: () => void;
}

const StoreContext = createContext<StoreContextType | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [currentStore, setCurrentStore] = useState<Store | null>(null);
  const [myStores, setMyStores] = useState<Store[]>([]);
  const [storesLoaded, setStoresLoaded] = useState(false);

  const refreshStores = async (uid: string) => {
    const res = await fetch(`/api/store?uid=${uid}`);
    const data = await res.json();
    setMyStores(data.stores || []);
    setStoresLoaded(true);
    return data.stores || [];
  };

  const clearStore = () => {
    setCurrentStore(null);
    setMyStores([]);
    setStoresLoaded(false);
  };

  return (
    <StoreContext.Provider value={{
      currentStore, myStores, storesLoaded,
      setCurrentStore, refreshStores, clearStore
    }}>
      {children}
    </StoreContext.Provider>
  );
}

export const useStore = () => {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('StoreProvider 밖에서 사용 불가');
  return ctx;
};
