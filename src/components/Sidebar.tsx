'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Settings, MessageCircle, ShoppingCart, ShoppingBag, Sparkles,
  BarChart2, ClipboardCheck, X,
  Circle, CalendarDays, Tag, Scale, LineChart, SlidersHorizontal, Users, Crown, ChevronRight, ChevronDown,
  FileText, TrendingUp, Truck, BookOpen, LayoutGrid, PenLine, Clock, Tv, ListTodo, FolderOpen, Package,
  BookOpenCheck, UsersRound, Camera,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useStore } from '@/context/StoreContext';
import { isSuperuserEmail } from '@/lib/auth/permissions';
import { useLicense } from '@/hooks/useLicense';
import { MENU_KEY_TO_MODULE } from '@/lib/licenses';
import { HR_SYSTEM_SIDEBAR_LINKS } from '@/lib/hr-system/menuStructure';
import NotificationHub from '@/components/NotificationHub';
import ResourceMonitor from '@/components/ResourceMonitor';
import UserProfileModal from '@/components/UserProfileModal';
import { db } from '@/lib/firebase/firebase';
import { collection, query, where, onSnapshot, doc } from 'firebase/firestore';
import { getAuthHeaders } from '@/lib/getAuthHeaders';
import { getKSTTodayYMD, addDaysYMD, getWeekdayKo } from '@/lib/dateUtils';
import {
  getDisplayNetSales,
  getDisplayTotalSale,
  posDailySalesDocId,
  type SalesDocData,
} from '@/lib/posDailySales';
import SidebarAttendanceButtons from '@/components/SidebarAttendanceButtons';
import {
  buildTodayTomorrowGroups,
  dateInRange,
  dayoffLabel,
  leaveLabel,
  mergeAbsenceEntries,
  type DayAbsenceGroup,
} from '@/lib/hr/absenceSchedule';

import {
  createAllFalseMenuAccess,
  createAllTrueMenuAccess,
  type MenuAccess,
  menuAccessForGroup,
} from '@/lib/menuAccessKeys';
import {
  ACCOUNTING_MENU_SECTIONS,
  canAccessAccountingSection,
} from '@/lib/accounting/menuStructure';
import {
  PURCHASE_MENU_SECTIONS,
  canAccessPurchaseSection,
  hasPurchaseMenu,
  isPurchasePath,
} from '@/lib/purchase/menuStructure';
import {
  SALES_MENU_SECTIONS,
  canAccessSalesSection,
  hasSalesMenu,
  isSalesPath,
} from '@/lib/sales/menuStructure';
import {
  MESSENGER_SIDEBAR_LINKS,
  isMessengerPath,
  isMessengerSubLinkActive,
} from '@/lib/messenger/menuStructure';
import {
  STOCK_SUPERUSER_LINKS,
  isStockSuperuserPath,
  isStockSuperuserLinkActive,
} from '@/lib/stock/menuStructure';
import { STOCK_SUPERUSER_EMAIL } from '@/lib/stock/constants';

const ALL_FALSE = createAllFalseMenuAccess();
const ALL_TRUE = createAllTrueMenuAccess();

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
  const [isStoreMember, setIsStoreMember] = useState(false);
  const [hasPosBridge,  setHasPosBridge]  = useState(false);
  const [aiModels,      setAiModels]      = useState<AiModel[]>([]);
  const [unreadCount,   setUnreadCount]   = useState(0);
  const [showProfile,   setShowProfile]   = useState(false);
  const [purchaseOpen,  setPurchaseOpen]  = useState(false);
  const [salesOpen,     setSalesOpen]     = useState(false);
  const [hrSystemOpen,  setHrSystemOpen]  = useState(false);
  const [accountingOpen, setAccountingOpen] = useState(false);
  const [messengerOpen, setMessengerOpen] = useState(false);
  const [stockTraderOpen, setStockTraderOpen] = useState(false);
  const { hasModule } = useLicense();

  interface SalesSummary { todayNet: number; todaySource: string; weekNet: number; }
  const [sales,        setSales]        = useState<SalesSummary | null>(null);
  const [salesLoading, setSalesLoading] = useState(false);
  const [todayKey,     setTodayKey]     = useState(() => getKSTTodayYMD());
  const [absences,     setAbsences]     = useState<DayAbsenceGroup[]>([]);
  const [absenceLoading, setAbsenceLoading] = useState(false);

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
        setIsStoreMember(!!d.isStoreMember);
        setHasPosBridge(!!d.hasPosBridge);
      })
      .catch(() => {
        setMenuAccess(ALL_FALSE);
        setIsStoreMember(false);
        setHasPosBridge(false);
      })
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
          setMenuAccess(menuAccessForGroup(groupId, stored));
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

  /* KST 자정 넘어가면 오늘 날짜 갱신 */
  useEffect(() => {
    const tick = () => {
      const t = getKSTTodayYMD();
      setTodayKey(prev => (prev !== t ? t : prev));
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  /* 매출 현황 실시간 — pos_daily_sales + daily_reports, KST 기준 */
  useEffect(() => {
    const storeId = currentStore?.storeId;
    if (!storeId || !menuAccess.report) { setSales(null); return; }

    const today = todayKey;
    const d = new Date(`${today}T12:00:00+09:00`);
    const diff = d.getDay() === 0 ? -6 : 1 - d.getDay();
    const weekStartStr = addDaysYMD(today, diff);

    setSalesLoading(true);

    let todayPos: SalesDocData | null = null;
    let todayReportBest: SalesDocData | null = null;
    const weekPosByDate = new Map<string, SalesDocData>();
    const weekReportByDate = new Map<string, SalesDocData & { source?: string; totalSales?: number }>();

    const scoreDoc = (docData: { source?: string; totalSales?: number }) => {
      if (docData.source === 'pos_bridge' && (docData.totalSales ?? 0) > 0) return Infinity;
      if (docData.source === 'pos_bridge') return -1;
      return docData.totalSales ?? 0;
    };

    const pickBestReport = (docs: (SalesDocData & { source?: string; totalSales?: number })[]) => {
      if (!docs.length) return null;
      return docs.reduce((best, cur) => (scoreDoc(cur) > scoreDoc(best) ? cur : best));
    };

    const displayAmount = (docData: SalesDocData | null | undefined) => {
      if (!docData) return 0;
      const net = getDisplayNetSales(docData);
      if (net > 0) return net;
      return getDisplayTotalSale(docData);
    };

    const recompute = () => {
      const todayDoc = todayPos ?? todayReportBest;
      const amount = displayAmount(todayDoc);
      const source = todayPos
        ? 'pos_bridge'
        : ((todayReportBest as { source?: string } | null)?.source ?? 'manual');

      const weekDates = new Set([...weekPosByDate.keys(), ...weekReportByDate.keys()]);
      let weekNet = 0;
      weekDates.forEach(date => {
        const docData = weekPosByDate.get(date) ?? weekReportByDate.get(date) ?? null;
        weekNet += displayAmount(docData);
      });

      setSales({ todayNet: amount, todaySource: source, weekNet });
      setSalesLoading(false);
    };

    const unsubs: (() => void)[] = [];

    unsubs.push(onSnapshot(
      doc(db, 'pos_daily_sales', posDailySalesDocId(storeId, today)),
      snap => {
        todayPos = snap.exists() ? (snap.data() as SalesDocData) : null;
        recompute();
      },
      () => setSalesLoading(false),
    ));

    unsubs.push(onSnapshot(
      query(
        collection(db, 'daily_reports'),
        where('storeId', '==', storeId),
        where('reportDate', '==', today),
      ),
      snap => {
        const docs = snap.docs.map(d => d.data() as SalesDocData & { source?: string; totalSales?: number });
        todayReportBest = pickBestReport(docs);
        recompute();
      },
      () => setSalesLoading(false),
    ));

    unsubs.push(onSnapshot(
      query(
        collection(db, 'pos_daily_sales'),
        where('storeId', '==', storeId),
        where('date', '>=', weekStartStr),
        where('date', '<=', today),
      ),
      snap => {
        weekPosByDate.clear();
        snap.docs.forEach(d => {
          const data = d.data() as SalesDocData & { date?: string };
          if (data.date) weekPosByDate.set(data.date, data);
        });
        recompute();
      },
      () => setSalesLoading(false),
    ));

    unsubs.push(onSnapshot(
      query(
        collection(db, 'daily_reports'),
        where('storeId', '==', storeId),
        where('reportDate', '>=', weekStartStr),
        where('reportDate', '<=', today),
      ),
      snap => {
        weekReportByDate.clear();
        snap.docs.forEach(d => {
          const data = d.data() as SalesDocData & { source?: string; totalSales?: number; reportDate?: string };
          if (!data.reportDate) return;
          const existing = weekReportByDate.get(data.reportDate);
          if (!existing || scoreDoc(data) > scoreDoc(existing)) {
            weekReportByDate.set(data.reportDate, data);
          }
        });
        recompute();
      },
      () => setSalesLoading(false),
    ));

    return () => unsubs.forEach(u => u());
  }, [currentStore?.storeId, menuAccess.report, todayKey]);

  /* 휴무·연차 — 오늘/내일 (승인된 신청만) */
  useEffect(() => {
    const storeId = currentStore?.storeId;
    const showAbsence = menuAccess.report || menuAccess.hrCalendar;
    if (!storeId || !showAbsence) {
      setAbsences([]);
      return;
    }

    const today = todayKey;
    const tomorrow = addDaysYMD(today, 1);
    setAbsenceLoading(true);

    let leaveDocs: { userName?: string; type?: string; startDate?: string; endDate?: string; status?: string }[] = [];
    let dayoffDocs: { userName?: string; type?: string; dates?: string[]; status?: string }[] = [];
    let employees: { name?: string; status?: string; daysOff?: string[] }[] = [];

    const appendRegularOff = (raw: { name: string; tag: string }[], date: string) => {
      const dow = getWeekdayKo(date);
      if (!dow) return;
      employees.forEach(emp => {
        if (emp.status === '퇴사' || !emp.name) return;
        if ((emp.daysOff || []).includes(dow)) {
          raw.push({ name: emp.name, tag: '정기휴무' });
        }
      });
    };

    const recompute = () => {
      const rawToday: { name: string; tag: string }[] = [];
      const rawTomorrow: { name: string; tag: string }[] = [];

      leaveDocs.forEach(l => {
        if (l.status !== 'approved' || !l.userName || !l.startDate || !l.endDate) return;
        const tag = leaveLabel(l.type || 'annual');
        if (dateInRange(l.startDate, l.endDate, today)) {
          rawToday.push({ name: l.userName, tag });
        }
        if (dateInRange(l.startDate, l.endDate, tomorrow)) {
          rawTomorrow.push({ name: l.userName, tag });
        }
      });

      dayoffDocs.forEach(d => {
        if (d.status !== 'approved' || !d.userName || !d.dates?.length) return;
        const tag = dayoffLabel(d.type || 'regular');
        if (d.dates.includes(today)) rawToday.push({ name: d.userName, tag });
        if (d.dates.includes(tomorrow)) rawTomorrow.push({ name: d.userName, tag });
      });

      appendRegularOff(rawToday, today);
      appendRegularOff(rawTomorrow, tomorrow);

      setAbsences(buildTodayTomorrowGroups(
        mergeAbsenceEntries(rawToday),
        mergeAbsenceEntries(rawTomorrow),
      ));
      setAbsenceLoading(false);
    };

    const unsubs = [
      onSnapshot(
        query(collection(db, 'hr_leave_requests'), where('storeId', '==', storeId)),
        snap => {
          leaveDocs = snap.docs.map(d => d.data());
          recompute();
        },
        () => setAbsenceLoading(false),
      ),
      onSnapshot(
        query(collection(db, 'hr_dayoff_requests'), where('storeId', '==', storeId)),
        snap => {
          dayoffDocs = snap.docs.map(d => d.data());
          recompute();
        },
        () => setAbsenceLoading(false),
      ),
      onSnapshot(
        query(collection(db, 'hr_employees'), where('storeId', '==', storeId)),
        snap => {
          employees = snap.docs.map(d => d.data());
          recompute();
        },
        () => setAbsenceLoading(false),
      ),
    ];

    return () => unsubs.forEach(u => u());
  }, [currentStore?.storeId, menuAccess.report, menuAccess.hrCalendar, todayKey]);

  /* 페이지 이동 시 모바일 닫기 */
  useEffect(() => {
    onClose?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const purchaseIcon = (href: string) => {
    if (href.includes('/input')) return <ShoppingCart className="w-3.5 h-3.5" />;
    if (href.includes('/ledger') || href.includes('/by-supplier')) return <BookOpen className="w-3.5 h-3.5" />;
    if (href.includes('/prices') || href.includes('/price')) return <TrendingUp className="w-3.5 h-3.5" />;
    if (href.includes('/trace')) return <FileText className="w-3.5 h-3.5" />;
    if (href.includes('/suppliers')) return <Truck className="w-3.5 h-3.5" />;
    if (href.includes('/items')) return <Tag className="w-3.5 h-3.5" />;
    return <ShoppingCart className="w-3.5 h-3.5" />;
  };

  const salesIcon = (href: string) => {
    if (href.includes('/report/view') || href.includes('/report/calendar')) return <BarChart2 className="w-3.5 h-3.5" />;
    if (href.includes('/report/input')) return <PenLine className="w-3.5 h-3.5" />;
    if (href.includes('/sales_ai')) return <Sparkles className="w-3.5 h-3.5" />;
    if (href.includes('/sales-forecast') || href.includes('/prediction')) return <LineChart className="w-3.5 h-3.5" />;
    if (href.includes('/customers') || href.includes('/marketing')) return <Users className="w-3.5 h-3.5" />;
    if (href.includes('/coupons') || href.includes('/public-orders') || href.includes('/signage')) {
      return href.includes('/signage') ? <Tv className="w-3.5 h-3.5" /> : <ShoppingBag className="w-3.5 h-3.5" />;
    }
    if (href.includes('/scale')) return <Scale className="w-3.5 h-3.5" />;
    if (href.includes('/prediction-variables')) return <SlidersHorizontal className="w-3.5 h-3.5" />;
    return <BarChart2 className="w-3.5 h-3.5" />;
  };

  const SALES_ITEM_MODULE: Record<string, string> = {
    '/dashboard/report/view': 'report',
    '/dashboard/report/calendar': 'report',
    '/dashboard/report/input': 'sales',
    '/dashboard/report/sales_ai': 'sales',
    '/dashboard/sales-forecast': 'salesForecast',
    '/dashboard/prediction-analysis': 'predictionHistory',
    '/dashboard/settings/prediction-variables': 'predictionVariables',
  };

  const mainMenus = [
    { key: 'ai' as const,        href: '/dashboard/ai',                    icon: <Sparkles className="w-4 h-4" />,       label: 'AI 대화모드' },
    { key: 'ai' as const,        href: '/dashboard/manual',                icon: <BookOpen className="w-4 h-4" />,       label: 'AI 매장 백과' },
    { key: 'hygiene' as const,   href: '/dashboard/hygiene',               icon: <ClipboardCheck className="w-4 h-4" />, label: '위생 점검일지' },
    { key: 'hygiene' as const,   href: '/dashboard/hygiene/report',        icon: <ClipboardCheck className="w-4 h-4" />, label: '시간별알림' },
    { key: 'report' as const,    href: '/dashboard/inventory/turnover',    icon: <Package className="w-4 h-4" />,        label: '재고 회전율' },
    { key: 'hygiene' as const,   href: '/dashboard/operations/checklist', icon: <ClipboardCheck className="w-4 h-4" />, label: '개폐점 체크리스트' },
    { key: 'hrCalendar' as const,         href: '/dashboard/hr/calendar',                    icon: <CalendarDays className="w-4 h-4" />,  label: '캘린더' },
    { key: 'hrCalendar' as const,         href: '/dashboard/hr/attendance',                  icon: <Clock className="w-4 h-4" />,         label: '출퇴근' },
    { key: 'members' as const,            href: '/dashboard/hr/employee-register',           icon: <Users className="w-4 h-4" />,         label: '사원등록' },
  ];

  const isSuperuser = isSuperuserEmail(user?.email);
  const effectiveAccess = isSuperuser ? ALL_TRUE : menuAccess;
  const isStrictStockSuperuser =
    !!user?.email &&
    user.email.toLowerCase() === STOCK_SUPERUSER_EMAIL.toLowerCase() &&
    user.emailVerified === true;

  const accountingSubMenus = ACCOUNTING_MENU_SECTIONS.flatMap(section =>
    (isSuperuser || canAccessAccountingSection(effectiveAccess, section.permission))
      ? section.items.map(item => ({
          href: item.href,
          icon: <BookOpenCheck className="w-3.5 h-3.5" />,
          label: item.label,
        }))
      : [],
  );

  const moduleAllowed = (menuKey: string) => {
    if (isSuperuser) return true;
    const mod = MENU_KEY_TO_MODULE[menuKey];
    if (!mod) return true;
    return hasModule(mod);
  };

  const showManualSales = !accessLoading
    && canAccessSalesSection(effectiveAccess, 'salesManual')
    && isStoreMember
    && !hasPosBridge
    && hasModule('pos');

  const hasPurchaseModuleMenu = !accessLoading && hasModule('purchases') && (
    isSuperuser || hasPurchaseMenu(effectiveAccess)
  );

  const hasSalesModuleMenu = !accessLoading && (
    isSuperuser || hasSalesMenu(effectiveAccess)
  );

  const salesSectionsVisible = SALES_MENU_SECTIONS.filter(section =>
    canAccessSalesSection(effectiveAccess, section.permission),
  ).map(section => ({
    ...section,
    items: section.items.filter(item => {
      if (item.manualOnly && !showManualSales) return false;
      const modKey = SALES_ITEM_MODULE[item.href];
      return !modKey || moduleAllowed(modKey);
    }),
  })).filter(section => section.items.length > 0);

  const purchaseSectionsVisible = PURCHASE_MENU_SECTIONS.filter(section =>
    canAccessPurchaseSection(effectiveAccess, section.permission),
  );

  const hasAccountingMenu = !accessLoading && hasModule('accounting') && (
    isSuperuser
    || effectiveAccess.accounting
    || effectiveAccess.accountingMaster
    || effectiveAccess.accountingVoucher
    || effectiveAccess.accountingLedger
    || effectiveAccess.accountingClosing
    || effectiveAccess.accountingFund
  );

  const hasHrSystemMenu = !accessLoading && hasModule('hr') && (
    isSuperuser
    || effectiveAccess.hrSystem
    || effectiveAccess.hrPersonnel
    || effectiveAccess.hrAttendanceMgmt
    || effectiveAccess.hrPayrollMaster
    || effectiveAccess.hrPayrollCalc
    || effectiveAccess.hrPayrollReport
  );

  const hasMessengerMenu = !accessLoading && moduleAllowed('messenger') && (
    isSuperuser || effectiveAccess.messenger
  );

  const visibleMenus = accessLoading ? [] : mainMenus.filter(m =>
    effectiveAccess[m.key] && moduleAllowed(m.key),
  );

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
              {hasModule('dashboard') && (effectiveAccess.dashboard || isSuperuser) && (
                <Link
                  href="/dashboard"
                  onClick={onClose}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm mb-1 ${
                    pathname === '/dashboard'
                      ? 'bg-teal-600/20 text-teal-300 font-semibold border border-teal-500/20'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                >
                  <LayoutGrid className="w-4 h-4 shrink-0" />
                  <span className="flex-1">대시보드</span>
                </Link>
              )}

              {/* 메신저 (채팅·위키·파일·캘린더·칸반·문서) */}
              {hasMessengerMenu && (() => {
                const messengerActive = isMessengerPath(pathname);
                return (
                  <div>
                    <button
                      type="button"
                      onClick={() => setMessengerOpen(o => !o)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm w-full ${
                        messengerActive
                          ? 'bg-sky-600/20 text-sky-300 font-semibold border border-sky-500/20'
                          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                      }`}
                    >
                      <span className={`shrink-0 ${messengerActive ? 'text-sky-400' : ''}`}>
                        <MessageCircle className="w-4 h-4" />
                      </span>
                      <span className="flex-1 text-left">메신저</span>
                      {unreadCount > 0 && (
                        <span className="bg-sky-500 text-white text-[10px] font-bold rounded-full min-w-[1rem] h-4 px-1 flex items-center justify-center shrink-0">
                          {unreadCount > 9 ? '9+' : unreadCount}
                        </span>
                      )}
                      <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${messengerOpen || messengerActive ? 'rotate-180' : ''}`} />
                    </button>
                    {(messengerOpen || messengerActive) && (
                      <div className="ml-4 mt-0.5 space-y-0.5 border-l border-slate-700/60 pl-3 max-h-64 overflow-y-auto">
                        {MESSENGER_SIDEBAR_LINKS.map(sub => {
                          const subActive = isMessengerSubLinkActive(pathname, sub);
                          const icon = sub.href === '/dashboard/messenger'
                            ? <MessageCircle className="w-3.5 h-3.5" />
                            : sub.href.includes('/wiki')
                              ? <BookOpen className="w-3.5 h-3.5" />
                              : sub.href.includes('/files')
                                ? <FolderOpen className="w-3.5 h-3.5" />
                                : sub.href.includes('/calendar')
                                  ? <CalendarDays className="w-3.5 h-3.5" />
                                  : sub.href.includes('/tasks')
                                    ? <LayoutGrid className="w-3.5 h-3.5" />
                                    : <FileText className="w-3.5 h-3.5" />;
                          return (
                            <Link
                              key={sub.href}
                              href={sub.href}
                              onClick={onClose}
                              className={`flex items-center gap-2.5 px-2 py-2 rounded-lg transition-all text-xs ${
                                subActive
                                  ? 'bg-sky-600/20 text-sky-300 font-semibold'
                                  : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'
                              }`}
                            >
                              <span className={subActive ? 'text-sky-400' : ''}>{icon}</span>
                              {sub.label}
                              {sub.exact && unreadCount > 0 && (
                                <span className="ml-auto bg-sky-500/80 text-white text-[9px] font-bold rounded-full min-w-[1rem] h-3.5 px-1 flex items-center justify-center">
                                  {unreadCount > 9 ? '9+' : unreadCount}
                                </span>
                              )}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* AI 완전 자동 주식 (슈퍼유저 이메일만 — DOM 미렌더) */}
              {isStrictStockSuperuser && (() => {
                const stActive = isStockSuperuserPath(pathname);
                return (
                  <div>
                    <button
                      type="button"
                      onClick={() => setStockTraderOpen(o => !o)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm w-full ${
                        stActive
                          ? 'bg-amber-600/20 text-amber-300 font-semibold border border-amber-500/20'
                          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                      }`}
                    >
                      <span className={`shrink-0 ${stActive ? 'text-amber-400' : ''}`}>
                        <TrendingUp className="w-4 h-4" />
                      </span>
                      <span className="flex-1 text-left">AI 자동주식</span>
                      <span className="text-[9px] text-amber-500/80 font-medium">SU</span>
                      <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${stockTraderOpen || stActive ? 'rotate-180' : ''}`} />
                    </button>
                    {(stockTraderOpen || stActive) && (
                      <div className="ml-4 mt-0.5 space-y-0.5 border-l border-slate-700/60 pl-3">
                        {STOCK_SUPERUSER_LINKS.map(sub => {
                          const subActive = isStockSuperuserLinkActive(pathname, sub);
                          return (
                            <Link
                              key={sub.href}
                              href={sub.href}
                              onClick={onClose}
                              className={`flex items-center gap-2.5 px-2 py-2 rounded-lg transition-all text-xs ${
                                subActive
                                  ? 'bg-amber-600/20 text-amber-300 font-semibold'
                                  : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'
                              }`}
                            >
                              {sub.label}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}

              {isSuperuser && (
                <Link
                  href="/dashboard/superuser/caps"
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm ${
                    pathname.startsWith('/dashboard/superuser/caps')
                      ? 'bg-purple-600/20 text-purple-300 font-semibold border border-purple-500/20'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                >
                  <Camera className="w-4 h-4 shrink-0 text-purple-400" />
                  <span className="flex-1">캡스 CCTV</span>
                  <span className="text-[9px] text-purple-500/80 font-medium">SU</span>
                </Link>
              )}

              {/* 구매관리 */}
              {hasPurchaseModuleMenu && purchaseSectionsVisible.length > 0 && (() => {
                const purchaseActive = isPurchasePath(pathname);
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
                      <span className="flex-1 text-left">구매관리</span>
                      <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${purchaseOpen || purchaseActive ? 'rotate-180' : ''}`} />
                    </button>
                    {(purchaseOpen || purchaseActive) && (
                      <div className="ml-4 mt-0.5 space-y-2 border-l border-slate-700/60 pl-3 max-h-72 overflow-y-auto">
                        <Link
                          href="/dashboard/purchase-mgmt"
                          onClick={onClose}
                          className={`flex items-center gap-2.5 px-2 py-2 rounded-lg transition-all text-xs ${
                            pathname === '/dashboard/purchase-mgmt'
                              ? 'bg-teal-600/20 text-teal-300 font-semibold'
                              : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'
                          }`}
                        >
                          <ShoppingCart className="w-3.5 h-3.5" />
                          구매관리 개요
                        </Link>
                        {purchaseSectionsVisible.map(section => (
                          <div key={section.id}>
                            <p className="text-[9px] font-semibold text-slate-600 uppercase tracking-wider px-2 pt-1">{section.label}</p>
                            <div className="space-y-0.5">
                              {section.items.map(sub => {
                                const subActive = pathname === sub.href || pathname.startsWith(`${sub.href}/`);
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
                                    <span className={subActive ? 'text-teal-400' : ''}>{purchaseIcon(sub.href)}</span>
                                    {sub.label}
                                  </Link>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* 영업관리 */}
              {hasSalesModuleMenu && salesSectionsVisible.length > 0 && (() => {
                const salesActive = isSalesPath(pathname);
                return (
                  <div>
                    <button
                      onClick={() => setSalesOpen(o => !o)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm w-full ${
                        salesActive
                          ? 'bg-indigo-600/20 text-indigo-300 font-semibold border border-indigo-500/20'
                          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                      }`}
                    >
                      <span className={`shrink-0 ${salesActive ? 'text-indigo-400' : ''}`}><BarChart2 className="w-4 h-4" /></span>
                      <span className="flex-1 text-left">영업관리</span>
                      <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${salesOpen || salesActive ? 'rotate-180' : ''}`} />
                    </button>
                    {(salesOpen || salesActive) && (
                      <div className="ml-4 mt-0.5 space-y-2 border-l border-slate-700/60 pl-3 max-h-72 overflow-y-auto">
                        <Link
                          href="/dashboard/sales-mgmt"
                          onClick={onClose}
                          className={`flex items-center gap-2.5 px-2 py-2 rounded-lg transition-all text-xs ${
                            pathname === '/dashboard/sales-mgmt'
                              ? 'bg-indigo-600/20 text-indigo-300 font-semibold'
                              : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'
                          }`}
                        >
                          <BarChart2 className="w-3.5 h-3.5" />
                          영업관리 개요
                        </Link>
                        {salesSectionsVisible.map(section => (
                          <div key={section.id}>
                            <p className="text-[9px] font-semibold text-slate-600 uppercase tracking-wider px-2 pt-1">{section.label}</p>
                            <div className="space-y-0.5">
                              {section.items.map(sub => {
                                const subActive = pathname === sub.href || pathname.startsWith(`${sub.href}/`);
                                return (
                                  <Link
                                    key={sub.href}
                                    href={sub.href}
                                    onClick={onClose}
                                    className={`flex items-center gap-2.5 px-2 py-2 rounded-lg transition-all text-xs ${
                                      subActive
                                        ? 'bg-indigo-600/20 text-indigo-300 font-semibold'
                                        : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'
                                    }`}
                                  >
                                    <span className={subActive ? 'text-indigo-400' : ''}>{salesIcon(sub.href)}</span>
                                    {sub.label}
                                  </Link>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* 회계관리 (영림원 구조) */}
              {hasAccountingMenu && (() => {
                const accountingActive = pathname.startsWith('/dashboard/accounting');
                return (
                  <div>
                    <button
                      onClick={() => setAccountingOpen(o => !o)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm w-full ${
                        accountingActive
                          ? 'bg-teal-600/20 text-teal-300 font-semibold border border-teal-500/20'
                          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                      }`}
                    >
                      <span className={`shrink-0 ${accountingActive ? 'text-teal-400' : ''}`}>
                        <BookOpenCheck className="w-4 h-4" />
                      </span>
                      <span className="flex-1 text-left">회계관리</span>
                      <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${accountingOpen || accountingActive ? 'rotate-180' : ''}`} />
                    </button>
                    {(accountingOpen || accountingActive) && (
                      <div className="ml-4 mt-0.5 space-y-0.5 border-l border-slate-700/60 pl-3 max-h-64 overflow-y-auto">
                        <Link
                          href="/dashboard/accounting"
                          onClick={onClose}
                          className={`flex items-center gap-2.5 px-2 py-2 rounded-lg transition-all text-xs ${
                            pathname === '/dashboard/accounting'
                              ? 'bg-teal-600/20 text-teal-300 font-semibold'
                              : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'
                          }`}
                        >
                          <BookOpenCheck className="w-3.5 h-3.5" />
                          회계 개요
                        </Link>
                        {accountingSubMenus.map(sub => {
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

              {/* 인사/급여관리 (영림원 구조) */}
              {hasHrSystemMenu && (() => {
                const hrSystemActive = pathname.startsWith('/dashboard/hr-system');
                return (
                  <div>
                    <button
                      onClick={() => setHrSystemOpen(o => !o)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm w-full ${
                        hrSystemActive
                          ? 'bg-cyan-600/20 text-cyan-300 font-semibold border border-cyan-500/20'
                          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                      }`}
                    >
                      <span className={`shrink-0 ${hrSystemActive ? 'text-cyan-400' : ''}`}>
                        <UsersRound className="w-4 h-4" />
                      </span>
                      <span className="flex-1 text-left">인사/급여</span>
                      <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${hrSystemOpen || hrSystemActive ? 'rotate-180' : ''}`} />
                    </button>
                    {(hrSystemOpen || hrSystemActive) && (
                      <div className="ml-4 mt-0.5 space-y-0.5 border-l border-slate-700/60 pl-3">
                        {HR_SYSTEM_SIDEBAR_LINKS.map(sub => {
                          const subActive = pathname === sub.href || pathname.startsWith(`${sub.href}/`);
                          return (
                            <Link
                              key={sub.href}
                              href={sub.href}
                              onClick={onClose}
                              className={`flex items-center gap-2.5 px-2 py-2 rounded-lg transition-all text-xs ${
                                subActive
                                  ? 'bg-cyan-600/20 text-cyan-300 font-semibold'
                                  : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'
                              }`}
                            >
                              <UsersRound className="w-3.5 h-3.5" />
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
                  </Link>
                );
              })}

              {/* 구분선 */}
              <div className="my-2 border-t border-slate-800" />

              {(effectiveAccess.keywords || isSuperuser) && (
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
              )}

              {(effectiveAccess.settings || isSuperuser) && (
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
              )}

              <div className="hidden md:block">
                <NotificationHub label="알림" />
              </div>

              {isSuperuser && (
                <Link
                  href="/dashboard/dev-console"
                  onClick={onClose}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm mt-1 ${
                    pathname.startsWith('/dashboard/dev-console')
                      ? 'bg-purple-600/20 text-purple-300 font-semibold border border-purple-500/20'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-purple-300'
                  }`}
                >
                  <ListTodo className="w-4 h-4 shrink-0" />
                  개발 큐
                </Link>
              )}
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

        {/* 출퇴근 */}
        {!accessLoading && (menuAccess.hrCalendar || isSuperuser) && currentStore?.storeId && user && (
          <SidebarAttendanceButtons onClose={onClose} />
        )}

        {/* 휴무·연차 (오늘/내일) */}
        {!accessLoading && (menuAccess.report || menuAccess.hrCalendar) && currentStore?.storeId && (
          <div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest px-3 mb-2">휴무 · 연차</p>
            {absenceLoading ? (
              <div className="h-20 mx-1 bg-slate-800/60 rounded-xl animate-pulse" />
            ) : (
              <Link
                href="/dashboard/hr/calendar?tab=leave"
                onClick={onClose}
                className="block mx-1 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 rounded-xl px-3 py-2.5 transition-colors space-y-2.5"
              >
                {absences.map(group => (
                  <div key={group.date}>
                    <p className="text-[10px] text-slate-500 mb-1">{group.dayLabel}</p>
                    {group.entries.length === 0 ? (
                      <p className="text-[11px] text-slate-600 pl-0.5">없음</p>
                    ) : (
                      <ul className="space-y-1">
                        {group.entries.map(entry => (
                          <li key={`${group.date}-${entry.name}`} className="flex items-center justify-between gap-2 text-[11px]">
                            <span className="text-slate-200 truncate">{entry.name}</span>
                            <span className="text-slate-500 shrink-0">{entry.tags.join(' · ')}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
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
          const isSU = isSuperuserEmail(user.email);
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
          className={`fixed top-0 left-0 h-full w-[min(17.5rem,88vw)] flex flex-col bg-slate-900 border-r border-slate-800/60 z-50 transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/60 safe-top">
            <Link href="/dashboard" onClick={onClose} className="flex items-center gap-2 group min-w-0">
              <div className="w-7 h-7 bg-teal-500 group-hover:bg-teal-400 rounded-lg flex items-center justify-center shrink-0 transition-colors">
                <span className="text-black font-black text-xs">P</span>
              </div>
              <h2 className="text-lg font-bold text-slate-100 group-hover:text-teal-300 tracking-tight transition-colors truncate">Pitaya OS</h2>
            </Link>
            <button
              onClick={onClose}
              className="touch-target flex items-center justify-center text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors shrink-0"
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
