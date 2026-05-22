'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Menu } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useStore } from '@/context/StoreContext';
import Sidebar from '@/components/Sidebar';
import NotificationHub from '@/components/NotificationHub';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* 모바일 상단 헤더 */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800 shrink-0">
        <span className="text-teal-400 font-bold text-lg">Pitaya OS</span>
        <div className="flex items-center gap-1">
          <NotificationHub />
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label="메뉴 열기"
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
