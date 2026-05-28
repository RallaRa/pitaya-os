'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Settings, MessageCircle, ShoppingCart, Sparkles,
  BarChart2, ClipboardCheck, X,
  Circle, CalendarDays, Tag, Scale, LineChart, Building2, SlidersHorizontal, Users, Crown, History, ChevronRight, ChevronDown,
  FileText, TrendingUp, Truck, BookOpen, Hash,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useStore } from '@/context/StoreContext';
import NotificationHub from '@/components/NotificationHub';
import ResourceMonitor from '@/components/ResourceMonitor';
import UserProfileModal from '@/components/UserProfileModal';
import { db } from '@/lib/firebase/firebase';
import { collection, query, where, onSnapshot, doc } from 'firebase/firestore';
import { getAuthHeaders } from '@/lib/getAuthHeaders';

const SUPERUSER_EMAIL = process.env.NEXT_PUBLIC_SUPERUSER_EMAIL || '';

type MenuAccess = {
  ai: boolean; sales: boolean; purchase: boolean; report: boolean;
  messenger: boolean; members: boolean; store: boolean;
  permissionGroup: boolean; memberGroup: boolean; hygiene: boolean;
  hrCalendar: boolean; scaleCode: boolean;
  salesForecast: boolean; suppliers: boolean; predictionVariables: boolean;
  customers: boolean; predictionHistory: boolean;
};

const ALL_FALSE: MenuAccess = {
  ai: false, sales: false, purchase: false, report: false,
  messenger: false, members: false, store: false,
  permissionGroup: false, memberGroup: false, hygiene: false,
  hrCalendar: false, scaleCode: false,
  salesForecast: false, suppliers: false, predictionVariables: false,
  customers: false, predictionHistory: false,
};

interface AiModel {
  id: string;
  name: string;
  provider: string;
  emoji: string;
  active: boolean;
}

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

const AI_PROVIDER_STYLE: Record<string, string> = {
  gemini: 'text-blue-400   border-blue-500/30   bg-blue-500/10',
  claude: 'text-purple-400 border-purple-500/30 bg-purple-500/10',
  gpt:    'text-green-400  border-green-500/30  bg-green-500/10',
  groq:   'text-orange-400 border-orange-500/30 bg-orange-500/10',
};

export default function Sidebar({ isOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { user } = useAuth();
  const { currentStore } = useStore();

  const [menuAccess,    setMenuAccess]    = useState<MenuAccess>(ALL_FALSE);
  const [accessLoading, setAccessLoading] = useState(true);
  const [groupId,       setGroupId]       = useState<string | null>(null);
  const [aiModels,      setAiModels]      = useState<AiModel[]>([]);
  const [unreadCount,   setUnreadCount]   = useState(0);
  const [showProfile,   setShowProfile]   = useState(false);
  const [purchaseOpen,  setPurchaseOpen]  = useState(false);

  interface SalesSummary { todayNet: number; todaySource: string; weekNet: number; }
  const [sales,        setSales]        = useState<SalesSummary | null>(null);
  const [salesLoading, setSalesLoading] = useState(false);

  /* 메뉴 권한 초기 로드 + groupId 취득 */
  useEffect(() => {
    if (!user?.uid) return;
    setAccessLoading(true);
    const storeId = currentStore?.storeId || '';
    const url = `/api/permissions?type=myAccess${storeId ? `&storeId=${storeId}` : ''}`;
    getAuthHeaders()
      .then(headers => fetch(url, { headers }))
      .then(r => r.json())
      .then(d => {
        if (d.menuAccess) setMenuAccess(d.menuAccess);
        if (d.groupId)    setGroupId(d.groupId);
      })
      .catch(() => setMenuAccess(ALL_FALSE))
      .finally(() => setAccessLoading(false));
  }, [user?.uid, currentStore?.storeId]);

  /* 권한 그룹 실시간 감지 — 관리자가 권한 변경 시 즉시 반영 */
  useEffect(() => {
    if (!groupId) return;
    const unsubscribe = onSnapshot(
      doc(db, 'permission_groups', groupId),
      snap => {
        if (snap.exists()) {
          const stored = snap.data()?.menuAccess || {};
          setMenuAccess({ ...ALL_FALSE, ...stored });
        }
      },
      () => { /* 권한 없으면 무시 */ },
    );
    return () => unsubscribe();
  }, [groupId]);

  /* AI 모델 상태 */
  useEffect(() => {
    getAuthHeaders()
      .then(headers => fetch('/api/ai', { headers }))
      .then(r => r.json())
      .then(d => { if (d.models) setAiModels(d.models); })
      .catch(() => {});
  }, []);

  /* 안읽은 메시지 (실시간) */
  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, 'chat_rooms'),
      where('members', 'array-contains', user.uid),
      where('status', '==', 'active'),
    );
    return onSnapshot(q, snap => {
      let total = 0;
      snap.docs.forEach(d => {
        total += (d.data().unreadCount || {})[user.uid] || 0;
      });
      setUnreadCount(total);
    });
  }, [user?.uid]);

  /* 매출 현황 실시간 — report 권한 있을 때만 */
  useEffect(() => {
    const storeId = currentStore?.storeId;
    if (!storeId || !menuAccess.report) { setSales(null); return; }

    const today = new Date().toISOString().split('T')[0];
    const d = new Date();
    const diff = d.getDay() === 0 ? -6 : 1 - d.getDay();
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() + diff);
    const weekStartStr = weekStart.toISOString().split('T')[0];

    setSalesLoading(true);

    const scoreDoc = (doc: any) => {
      if (doc.source === 'pos_bridge' && (doc.totalSales ?? 0) > 0) return Infinity;
      if (doc.source === 'pos_bridge') return -1;
      return doc.totalSales ?? 0;
    };

    const q = query(
      collection(db, 'daily_reports'),
      where('storeId', '==', storeId),
      where('reportDate', '>=', weekStartStr),
      where('reportDate', '<=', today),
    );

    const unsub = onSnapshot(q, snap => {
      const byDate = new Map<string, any>();
      snap.docs.forEach(d => {
        const data = { id: d.id, ...d.data() as any };
        if (data.storeId !== storeId) return;
        const existing = byDate.get(data.reportDate);
        if (!existing || scoreDoc(data) > scoreDoc(existing)) byDate.set(data.reportDate, data);
      });

      let weekNet = 0, todayNet = 0, todaySource = 'manual';
      byDate.forEach((doc, date) => {
        const net = doc.netSales ?? doc.netSale ?? 0;
        weekNet += net;
        if (date === today) { todayNet = net; todaySource = doc.source ?? 'manual'; }
      });

      setSales({ todayNet, todaySource, weekNet });
      setSalesLoading(false);
    }, () => setSalesLoading(false));

    return () => unsub();
  }, [currentStore?.storeId, menuAccess.report]);

  /* 페이지 이동 시 모바일 닫기 */
  useEffect(() => {
    onClose?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const purchaseSubMenus = [
    { href: '/dashboard/report/purchases/input',        icon: <ShoppingCart className="w-3.5 h-3.5" />, label: '매입 등록' },
    { href: '/dashboard/report/purchases/ledger',       icon: <BookOpen className="w-3.5 h-3.5" />,     label: '매입 원장' },
    { href: '/dashboard/report/purchases/by-supplier',  icon: <Truck className="w-3.5 h-3.5" />,        label: '거래처별 매입' },
    { href: '/dashboard/report/purchases/prices',       icon: <TrendingUp className="w-3.5 h-3.5" />,   label: '품목별 단가' },
    { href: '/dashboard/report/purchases/trace-ledger', icon: <FileText className="w-3.5 h-3.5" />,     label: '거래내역서(법정)' },
    { href: '/dashboard/report/purchases/trace-numbers',icon: <Hash className="w-3.5 h-3.5" />,         label: '이력번호 관리' },
  ];

  const mainMenus = [
    { key: 'ai' as const,        href: '/dashboard/ai',                    icon: <Sparkles className="w-4 h-4" />,       label: 'AI 대화모드' },
    { key: 'messenger' as const, href: '/dashboard/messenger',             icon: <MessageCircle className="w-4 h-4" />,  label: '메신저',      badge: unreadCount },
    { key: 'hygiene' as const,   href: '/dashboard/hygiene',               icon: <ClipboardCheck className="w-4 h-4" />, label: '위생 점검일지' },
    { key: 'report' as const,      href: '/dashboard/report/view',           icon: <BarChart2 className="w-4 h-4" />,      label: '일마감내역' },
    { key: 'hrCalendar' as const,         href: '/dashboard/hr/calendar',                    icon: <CalendarDays className="w-4 h-4" />,  label: '캘린더' },
    { key: 'scaleCode' as const,          href: '/dashboard/scale',                          icon: <Scale className="w-4 h-4" />,         label: '저울 코드 관리' },
    { key: 'salesForecast' as const,         href: '/dashboard/sales-forecast',                      icon: <LineChart          className="w-4 h-4" />, label: '품목별 매출 추이' },
    { key: 'suppliers' as const,             href: '/dashboard/suppliers',                           icon: <Building2          className="w-4 h-4" />, label: '거래처 관리' },
    { key: 'predictionVariables' as const,   href: '/dashboard/settings/prediction-variables',       icon: <SlidersHorizontal  className="w-4 h-4" />, label: 'AI 예측 변수' },
    { key: 'customers' as const,             href: '/dashboard/customers',                            icon: <Users              className="w-4 h-4" />, label: '고객 관리' },
    { key: 'predictionHistory' as const,     href: '/dashboard/prediction-history',                   icon: <History            className="w-4 h-4" />, label: 'AI 예측 히스토리' },
  ];

  const visibleMenus = accessLoading ? [] : mainMenus.filter(m => menuAccess[m.key]);

  /* ── 공통 사이드바 콘텐츠 ── */
  const sidebarContent = (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">

      {/* 스크롤 영역 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">

        {/* 네비게이션 */}
        <nav className="space-y-1">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest px-3 mb-2">메뉴</p>
          {accessLoading ? (
            [...Array(4)].map((_, i) => (
              <div key={i} className="h-10 rounded-xl bg-slate-800/60 animate-pulse mx-1" />
            ))
          ) : (
            <>
              {/* AI 매입관리 아코디언 (purchase 권한) */}
              {menuAccess.purchase && (() => {
                const purchaseActive = pathname.startsWith('/dashboard/report/purchases');
                return (
                  <div>
                    <button
                      onClick={() => setPurchaseOpen(o => !o)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm w-full ${
                        purchaseActive
                          ? 'bg-teal-600/20 text-teal-300 font-semibold border border-teal-500/20'
                          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                      }`}
                    >
                      <span className={`shrink-0 ${purchaseActive ? 'text-teal-400' : ''}`}><ShoppingCart className="w-4 h-4" /></span>
                      <span className="flex-1 text-left">AI 매입관리</span>
                      <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${purchaseOpen || purchaseActive ? 'rotate-180' : ''}`} />
                    </button>
                    {(purchaseOpen || purchaseActive) && (
                      <div className="ml-4 mt-0.5 space-y-0.5 border-l border-slate-700/60 pl-3">
                        {purchaseSubMenus.map(sub => {
                          const subActive = pathname === sub.href;
                          return (
                            <Link
                              key={sub.href}
                              href={sub.href}
                              onClick={onClose}
                              className={`flex items-center gap-2.5 px-2 py-2 rounded-lg transition-all text-xs ${
                                subActive
                                  ? 'bg-teal-600/20 text-teal-300 font-semibold'
                                  : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'
                              }`}
                            >
                              <span className={subActive ? 'text-teal-400' : ''}>{sub.icon}</span>
                              {sub.label}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}

              {visibleMenus.map(item => {
                const active = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm ${
                      active
                        ? 'bg-teal-600/20 text-teal-300 font-semibold border border-teal-500/20'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                    }`}
                  >
                    <span className={`shrink-0 ${active ? 'text-teal-400' : ''}`}>{item.icon}</span>
                    <span className="flex-1">{item.label}</span>
                    {item.badge != null && item.badge > 0 && (
                      <span className="bg-teal-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center shrink-0">
                        {item.badge > 9 ? '9+' : item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}

              {/* 구분선 */}
              <div className="my-2 border-t border-slate-800" />

              <Link
                href="/dashboard/settings/keywords"
                onClick={onClose}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm ${
                  pathname === '/dashboard/settings/keywords'
                    ? 'bg-teal-600/20 text-teal-300 font-semibold border border-teal-500/20'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <Tag className="w-4 h-4 shrink-0" />
                키워드 관리
              </Link>

              <Link
                href="/dashboard/settings"
                onClick={onClose}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm ${
                  pathname.startsWith('/dashboard/settings') && pathname !== '/dashboard/settings/keywords'
                    ? 'bg-teal-600/20 text-teal-300 font-semibold border border-teal-500/20'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <Settings className="w-4 h-4 shrink-0" />
                설정
              </Link>

              <div className="hidden md:block">
                <NotificationHub label="알림" />
              </div>
            </>
          )}
        </nav>

        {/* 매출 현황 */}
        {!accessLoading && menuAccess.report && currentStore?.storeId && (
          <div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest px-3 mb-2">매출 현황</p>
            {salesLoading ? (
              <div className="h-16 mx-1 bg-slate-800/60 rounded-xl animate-pulse" />
            ) : (
              <Link
                href="/dashboard/report/view"
                onClick={onClose}
                className="block mx-1 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 rounded-xl px-3 py-2.5 transition-colors"
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] text-slate-500">오늘</span>
                  {sales && (
                    sales.todaySource === 'pos_bridge' || sales.todaySource === 'pos_bridge_migration'
                      ? <span className="text-[9px] text-red-400 font-medium">🔴 POS</span>
                      : sales.todayNet > 0
                        ? <span className="text-[9px] text-blue-400 font-medium">🔵 수동</span>
                        : null
                  )}
                </div>
                <p className={`font-bold text-base leading-tight ${sales && sales.todayNet > 0 ? 'text-teal-400' : 'text-slate-600'}`}>
                  {sales && sales.todayNet > 0 ? `${sales.todayNet.toLocaleString()}원` : '입력 없음'}
                </p>
                {sales && sales.weekNet > 0 && (
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-700/50">
                    <span className="text-[10px] text-slate-500">이번 주</span>
                    <span className="text-[10px] text-slate-400 font-semibold tabular-nums">{sales.weekNet.toLocaleString()}원</span>
                  </div>
                )}
              </Link>
            )}
          </div>
        )}

        {/* AI 엔진 현황 */}
        <div>
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest px-3 mb-3">AI 엔진</p>
          {aiModels.length === 0 ? (
            <div className="space-y-2 px-1">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-9 rounded-xl bg-slate-800/60 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-1.5 px-1">
              {aiModels.map(m => (
                <div
                  key={m.id}
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl border text-xs ${AI_PROVIDER_STYLE[m.id] || 'text-slate-400 border-slate-700 bg-slate-800/40'}`}
                >
                  <span className="text-base leading-none shrink-0">{m.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{m.name}</p>
                    <p className="opacity-60 text-[10px]">{m.provider}</p>
                  </div>
                  <Circle
                    className={`w-2 h-2 shrink-0 ${m.active ? 'fill-current' : 'text-slate-600 fill-slate-600'}`}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 리소스 모니터 (접이식) */}
      <ResourceMonitor />

      {/* 하단: 유저 프로필 (클릭 → 모달) */}
      <div className="p-3 border-t border-slate-800 shrink-0">
        {user && (() => {
          const isSU = SUPERUSER_EMAIL && user.email?.toLowerCase() === SUPERUSER_EMAIL.toLowerCase();
          return (
            <button
              onClick={() => { onClose?.(); setShowProfile(true); }}
              className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl transition-all text-left group ${
                isSU
                  ? 'bg-purple-900/30 border border-purple-700/40 hover:bg-purple-900/50'
                  : 'hover:bg-slate-800'
              }`}
            >
              <div className="relative shrink-0">
                {user.photoURL ? (
                  <img src={user.photoURL} alt="" className="w-8 h-8 rounded-full border border-slate-700" />
                ) : (
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${isSU ? 'bg-purple-700' : 'bg-teal-700'}`}>
                    {user.displayName?.slice(0, 1) || 'U'}
                  </div>
                )}
                {isSU && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-400 rounded-full flex items-center justify-center">
                    <Crown className="w-2.5 h-2.5 text-yellow-900" />
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-medium truncate ${isSU ? 'text-purple-200' : 'text-slate-200'}`}>{user.displayName || user.email}</p>
                <p className="text-slate-500 text-[10px] truncate">{isSU ? '슈퍼유저' : (currentStore?.storeName || '매장 없음')}</p>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 shrink-0 transition-colors" />
            </button>
          );
        })()}
      </div>
    </div>
  );

  return (
    <>
      {/* ── 데스크탑 ── */}
      <aside className="hidden md:flex w-64 flex-col bg-slate-900 border-r border-slate-800/60">
        {/* 로고 */}
        <div className="px-5 py-5 border-b border-slate-800/60">
          <Link href="/dashboard" className="flex items-center gap-2 group">
            <div className="w-7 h-7 bg-teal-500 group-hover:bg-teal-400 rounded-lg flex items-center justify-center shrink-0 transition-colors">
              <span className="text-black font-black text-xs">P</span>
            </div>
            <h2 className="text-lg font-bold text-slate-100 group-hover:text-teal-300 tracking-tight transition-colors">Pitaya OS</h2>
          </Link>
        </div>
        {sidebarContent}
      </aside>

      {/* ── 모바일 오버레이 ── */}
      <div className="md:hidden">
        <div
          className={`fixed inset-0 bg-black/70 z-40 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          onClick={onClose}
          aria-hidden="true"
        />
        <aside
          className={`fixed top-0 left-0 h-full w-64 flex flex-col bg-slate-900 border-r border-slate-800/60 z-50 transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800/60">
            <Link href="/dashboard" onClick={onClose} className="flex items-center gap-2 group">
              <div className="w-7 h-7 bg-teal-500 group-hover:bg-teal-400 rounded-lg flex items-center justify-center shrink-0 transition-colors">
                <span className="text-black font-black text-xs">P</span>
              </div>
              <h2 className="text-lg font-bold text-slate-100 group-hover:text-teal-300 tracking-tight transition-colors">Pitaya OS</h2>
            </Link>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
              aria-label="메뉴 닫기"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          {sidebarContent}
        </aside>
      </div>

      {/* 프로필 모달 */}
      {showProfile && <UserProfileModal onClose={() => setShowProfile(false)} />}
    </>
  );
}
