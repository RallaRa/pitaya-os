'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useStore } from '@/context/StoreContext';
import Sidebar from '@/components/Sidebar';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const { currentStore, myStores, refreshStores, setCurrentStore } = useStore();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  // currentStore가 없으면 활성 매장 목록을 불러와 자동 설정
  useEffect(() => {
    if (!user?.uid || currentStore) return;
    if (myStores.length > 0) {
      if (myStores.length === 1) setCurrentStore(myStores[0]);
      return;
    }
    refreshStores(user.uid).then((stores) => {
      if (stores.length === 1) setCurrentStore(stores[0]);
    });
  }, [user?.uid, currentStore, myStores]);

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
