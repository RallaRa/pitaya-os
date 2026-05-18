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
  setCurrentStore: (store: Store) => void;
  refreshStores: (uid: string) => Promise<void>;
  clearStore: () => void;
}

const StoreContext = createContext<StoreContextType | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [currentStore, setCurrentStore] = useState<Store | null>({
    storeId: 'STR-DEV-001',
    storeName: '개발용 매장',
    region: '서울 강서구',
    regionSido: '서울',
    regionSigungu: '강서구',
    ownerName: '개발자',
    address: '',
    phone: '',
    businessNumber: '',
    role: 'superuser',
  });
  const [myStores, setMyStores] = useState<Store[]>([]);

  const refreshStores = async (uid: string) => {
    const res = await fetch(`/api/store?uid=${uid}`);
    const data = await res.json();
    setMyStores(data.stores || []);
    return data.stores || [];
  };

  const clearStore = () => {
    setCurrentStore(null);
    setMyStores([]);
  };

  return (
    <StoreContext.Provider value={{
      currentStore, myStores,
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
