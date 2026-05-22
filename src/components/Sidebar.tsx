'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Settings, MessageCircle, ShoppingCart, Sparkles, BarChart2, TrendingUp, ClipboardCheck } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useStore } from '@/context/StoreContext';

type MenuAccess = {
  ai: boolean; sales: boolean; purchase: boolean; report: boolean;
  messenger: boolean; members: boolean; store: boolean;
  permissionGroup: boolean; memberGroup: boolean;
};

const ALL_FALSE: MenuAccess = {
  ai: false, sales: false, purchase: false, report: false,
  messenger: false, members: false, store: false,
  permissionGroup: false, memberGroup: false,
};

export default function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { currentStore } = useStore();
  const [menuAccess, setMenuAccess] = useState<MenuAccess>(ALL_FALSE);
  const [accessLoading, setAccessLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) return;
    setAccessLoading(true);
    const storeId = currentStore?.storeId || '';
    const url = `/api/permissions?type=myAccess&uid=${user.uid}${storeId ? `&storeId=${storeId}` : ''}`;
    fetch(url)
      .then(r => r.json())
      .then(data => {
        if (data.menuAccess) setMenuAccess(data.menuAccess);
      })
      .catch(() => setMenuAccess(ALL_FALSE))
      .finally(() => setAccessLoading(false));
  }, [user?.uid, currentStore?.storeId]);

  const mainMenus = [
    { key: 'ai' as const,       href: '/dashboard/ai',                    icon: <Sparkles className="w-5 h-5" />,       label: 'AI 대화모드' },
    { key: 'messenger' as const, href: '/dashboard/messenger',             icon: <MessageCircle className="w-5 h-5" />,  label: '메신저' },
    { key: 'sales' as const,    href: '/dashboard/report/input',           icon: <TrendingUp className="w-5 h-5" />,     label: 'AI 매출관리' },
    { key: 'sales' as const,    href: '/dashboard/report/hygiene',         icon: <ClipboardCheck className="w-5 h-5" />, label: '위생 점검일지' },
    { key: 'purchase' as const, href: '/dashboard/report/purchase/input',  icon: <ShoppingCart className="w-5 h-5" />,   label: 'AI 매입관리' },
    { key: 'report' as const,   href: '/dashboard/report/view',            icon: <BarChart2 className="w-5 h-5" />,      label: '전체 보고서' },
  ];

  const visibleMenus = accessLoading
    ? []
    : mainMenus.filter(m => menuAccess[m.key]);

  return (
    <aside className="hidden md:flex w-72 flex-col bg-slate-900 border-r border-slate-800">
      <div className="p-5 flex-1 overflow-y-auto">
        <h2 className="text-2xl font-bold text-teal-400 mb-8 tracking-tight">Pitaya OS</h2>
        <nav className="space-y-2">
          {accessLoading ? (
            /* 로딩 스켈레톤 — 깜빡임 방지 */
            <>
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-11 rounded-xl bg-slate-800/60 animate-pulse" />
              ))}
            </>
          ) : (
            <>
              {visibleMenus.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                    pathname.startsWith(item.href)
                      ? 'bg-slate-800 text-teal-300 font-medium'
                      : 'text-slate-300 hover:bg-slate-800/50'
                  }`}
                >
                  <span className="shrink-0">{item.icon}</span>
                  {item.label}
                </Link>
              ))}
              {/* 설정: 항상 표시 */}
              <Link
                href="/dashboard/settings"
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                  pathname.startsWith('/dashboard/settings')
                    ? 'bg-slate-800 text-teal-300 font-medium'
                    : 'text-slate-300 hover:bg-slate-800/50'
                }`}
              >
                <Settings className="w-5 h-5 shrink-0" />
                설정
              </Link>
            </>
          )}
        </nav>
      </div>

      {/* 하단: 리소스 대시보드 */}
      <div className="p-5 border-t border-slate-800 bg-slate-900/50">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
          시스템 리소스 현황
        </h3>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-slate-400">Gemini 토큰 (일간)</span>
              <span className="text-teal-400 font-medium">45%</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-1.5">
              <div className="bg-teal-500 h-1.5 rounded-full" style={{ width: '45%' }}></div>
            </div>
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-slate-400">GCP 트래픽 제한</span>
              <span className="text-yellow-400 font-medium">82%</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-1.5">
              <div className="bg-yellow-500 h-1.5 rounded-full" style={{ width: '82%' }}></div>
            </div>
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-slate-400">드라이브 스토리지</span>
              <span className="text-teal-400 font-medium">12%</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-1.5">
              <div className="bg-teal-500 h-1.5 rounded-full" style={{ width: '12%' }}></div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
