'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Menu } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useStore } from '@/context/StoreContext';
import Sidebar from '@/components/Sidebar';
import NotificationHub from '@/components/NotificationHub';
import PhoneCallToast from '@/components/PhoneCallToast';
import { DashboardChromeProvider, useDashboardChrome } from '@/components/dashboard/DashboardChromeContext';
import { getAuthHeaders } from '@/lib/getAuthHeaders';
import { isSuperuser } from '@/lib/auth/permissions';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardChromeProvider>
      <DashboardLayoutInner>{children}</DashboardLayoutInner>
    </DashboardChromeProvider>
  );
}

function DashboardLayoutInner({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const { user, loading } = useAuth();
  const { currentStore, myStores, storesLoaded, refreshStores, setCurrentStore } = useStore();
  const router = useRouter();
  const pathname = usePathname();
  const isAiFullscreen = pathname === '/dashboard/ai';
  const chrome = useDashboardChrome();
  const isDashboardFullscreen = chrome?.hideChrome && pathname === '/dashboard';

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (!user?.uid) return;
    getAuthHeaders()
      .then(headers => fetch(`/api/users?uid=${user.uid}`, { headers }))
      .then(r => r.json())
      .then(data => setUserRole(data.user?.role || data.user?.groupId || null))
      .catch(() => {});
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid || !storesLoaded) return;
    if (myStores.length === 0) {
      router.push('/select-store?mode=apply');
    }
  }, [user?.uid, storesLoaded, myStores.length, router]);

  useEffect(() => {
    if (!user?.uid || currentStore) return;
    if (myStores.length > 0) {
      if (myStores.length === 1) setCurrentStore(myStores[0]);
      return;
    }
    refreshStores(user.uid).then((stores) => {
      if (stores.length === 0) {
        router.push('/select-store?mode=apply');
      } else if (stores.length === 1) {
        setCurrentStore(stores[0]);
      } else {
        router.push('/select-store');
      }
    });
  }, [user?.uid, currentStore, myStores, refreshStores, setCurrentStore, router]);

  if (loading || !user) {
    return (
      <div className="min-h-app bg-slate-950 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const isSuperuserMode = isSuperuser(user?.email, userRole || undefined);

  if (isDashboardFullscreen) {
    return (
      <div className="flex flex-col h-app bg-slate-950 text-slate-100 overflow-hidden font-sans">
        <PhoneCallToast />
        <main className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {children}
        </main>
      </div>
    );
  }

  if (isAiFullscreen) {
    return (
      <div className="flex flex-col h-app bg-[#212121] text-[#ececec] overflow-hidden font-sans">
        <PhoneCallToast />
        {isSuperuserMode && (
          <div className="shrink-0 bg-purple-900/80 border-b border-purple-700/60 text-purple-200 text-xs text-center py-1 px-4 tracking-wide">
            👑 슈퍼유저 모드 — 모든 매장 및 권한에 접근 가능합니다
          </div>
        )}
        <main className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-app bg-slate-950 text-slate-100 overflow-hidden font-sans">
      <PhoneCallToast />
      {isSuperuserMode && (
        <div className="shrink-0 bg-purple-900/80 border-b border-purple-700/60 text-purple-200 text-xs text-center py-1 px-4 tracking-wide safe-top">
          👑 슈퍼유저 모드 — 모든 매장 및 권한에 접근 가능합니다
        </div>
      )}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800 shrink-0 safe-top">
        <Link href="/dashboard" className="text-teal-400 hover:text-teal-300 font-bold text-lg transition-colors truncate min-w-0">Pitaya OS</Link>
        <div className="flex items-center gap-1 shrink-0">
          <NotificationHub />
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors touch-target flex items-center justify-center"
            aria-label="메뉴 열기"
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>
      </header>
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden touch-pan-y overscroll-y-contain [-webkit-overflow-scrolling:touch]">
          {children}
        </main>
      </div>
    </div>
  );
}
