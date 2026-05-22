'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Settings, MessageCircle, ShoppingCart, Sparkles,
  BarChart2, TrendingUp, ClipboardCheck, X,
} from 'lucide-react';
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

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ isOpen = false, onClose }: SidebarProps) {
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
      .then(data => { if (data.menuAccess) setMenuAccess(data.menuAccess); })
      .catch(() => setMenuAccess(ALL_FALSE))
      .finally(() => setAccessLoading(false));
  }, [user?.uid, currentStore?.storeId]);

  // 페이지 이동 시 모바일 사이드바 닫기
  useEffect(() => {
    onClose?.();
  // pathname 변경 시만 실행
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const mainMenus = [
    { key: 'ai' as const,        href: '/dashboard/ai',                   icon: <Sparkles className="w-5 h-5" />,       label: 'AI 대화모드' },
    { key: 'messenger' as const, href: '/dashboard/messenger',            icon: <MessageCircle className="w-5 h-5" />,  label: '메신저' },
    { key: 'sales' as const,     href: '/dashboard/report/input',         icon: <TrendingUp className="w-5 h-5" />,     label: 'AI 매출관리' },
    { key: 'sales' as const,     href: '/dashboard/report/hygiene',       icon: <ClipboardCheck className="w-5 h-5" />, label: '위생 점검일지' },
    { key: 'purchase' as const,  href: '/dashboard/report/purchase/input',icon: <ShoppingCart className="w-5 h-5" />,   label: 'AI 매입관리' },
    { key: 'report' as const,    href: '/dashboard/report/view',          icon: <BarChart2 className="w-5 h-5" />,      label: '전체 보고서' },
  ];

  const visibleMenus = accessLoading
    ? []
    : mainMenus.filter(m => menuAccess[m.key]);

  // ── 공통 nav 콘텐츠 ──
  const navContent = (
    <nav className="space-y-2">
      {accessLoading ? (
        <>
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-11 rounded-xl bg-slate-800/60 animate-pulse" />
          ))}
        </>
      ) : (
        <>
          {visibleMenus.map(item => (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
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
          <Link
            href="/dashboard/settings"
            onClick={onClose}
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
  );

  // ── 공통 하단 리소스 섹션 ──
  const resourceSection = (
    <div className="p-5 border-t border-slate-800 bg-slate-900/50">
      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
        시스템 리소스 현황
      </h3>
      <div className="space-y-4">
        {[
          { label: 'Gemini 토큰 (일간)', value: '45%', color: 'bg-teal-500', textColor: 'text-teal-400', width: '45%' },
          { label: 'GCP 트래픽 제한',    value: '82%', color: 'bg-yellow-500', textColor: 'text-yellow-400', width: '82%' },
          { label: '드라이브 스토리지',  value: '12%', color: 'bg-teal-500', textColor: 'text-teal-400', width: '12%' },
        ].map(item => (
          <div key={item.label}>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-slate-400">{item.label}</span>
              <span className={`${item.textColor} font-medium`}>{item.value}</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-1.5">
              <div className={`${item.color} h-1.5 rounded-full`} style={{ width: item.width }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <>
      {/* ── 데스크탑: 고정 사이드바 ── */}
      <aside className="hidden md:flex w-72 flex-col bg-slate-900 border-r border-slate-800">
        <div className="p-5 flex-1 overflow-y-auto">
          <h2 className="text-2xl font-bold text-teal-400 mb-8 tracking-tight">Pitaya OS</h2>
          {navContent}
        </div>
        {resourceSection}
      </aside>

      {/* ── 모바일: 오버레이 사이드바 ── */}
      <div className="md:hidden">
        {/* 반투명 배경 */}
        <div
          className={`fixed inset-0 bg-black/60 z-40 transition-opacity duration-300 ${
            isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
          onClick={onClose}
          aria-hidden="true"
        />

        {/* 슬라이드 패널 */}
        <aside
          className={`fixed top-0 left-0 h-full w-72 flex flex-col bg-slate-900 border-r border-slate-800 z-50 transition-transform duration-300 ease-in-out ${
            isOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between px-5 pt-5 pb-4">
            <h2 className="text-2xl font-bold text-teal-400 tracking-tight">Pitaya OS</h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
              aria-label="메뉴 닫기"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="px-5 pb-5 flex-1 overflow-y-auto">
            {navContent}
          </div>
          {resourceSection}
        </aside>
      </div>
    </>
  );
}
