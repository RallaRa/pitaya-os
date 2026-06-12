'use client';

import { useState, useEffect, useCallback, useRef, Suspense, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useStore } from '@/context/StoreContext';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line,
} from 'recharts';
import {
  Users, TrendingUp, UserPlus, ShoppingBag, RefreshCw,
  Search, ChevronLeft, ChevronRight, Lock, Unlock, Loader2,
  BarChart2, PieChart as PieIcon, List, Download, ArrowUp, ArrowDown, ArrowUpDown,
  History, Eye, EyeOff, ClipboardList, Send, UserSearch,
} from 'lucide-react';
import { getAuthHeaders, getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import { overlay } from '@/components/overlay';
import { CustomerRegistrationFunnel } from '@/components/funnel';
import { useCustomers, fetchCustomersList } from '@/lib/queries';
import * as XLSX from 'xlsx';
import type { CustomerSortField } from '@/lib/customerQuery';
import type { VisitCycleStatus } from '@/lib/customerVisitCycle';
import type { VisitTrendSegment } from '@/lib/customerVisitTrend';
import {
  clearCustomerPiiSession,
  loadCustomerPiiSession,
  mergeDecryptedMaps,
  mergeDecryptedRows,
  saveCustomerPiiSession,
  type DecryptedCustomer,
} from '@/lib/customerPiiSession';
import { canDecryptCustomerPIIClient } from '@/lib/customerDecryptAuth.client';
import {
  clearPiiUnlockToken,
  isPiiUnlockTokenValid,
  loadPiiUnlockToken,
} from '@/lib/piiStepUp/piiUnlockSession.client';
import { isSuperuserEmail, isSuperuser } from '@/lib/auth/permissions';
import dynamic from 'next/dynamic';

const CustomerRequestPanel = dynamic(
  () => import('@/components/customers/CustomerRequestPanel'),
  { ssr: false },
);

const CustomerMessagePanel = dynamic(
  () => import('@/components/customers/CustomerMessagePanel'),
  { ssr: false },
);

const CustomerMessageHistoryTab = dynamic(
  () => import('@/components/customers/CustomerMessageHistoryTab'),
  { ssr: false },
);

const CustomerPurchaseHistoryPanel = dynamic(
  () => import('@/components/customers/CustomerPurchaseHistoryPanel'),
  { ssr: false },
);

const CustomerPurchaseAnalyticsTab = dynamic(
  () => import('@/components/customers/CustomerPurchaseAnalyticsTab'),
  { ssr: false },
);

const UnmatchedIdentityPanel = dynamic(
  () => import('@/components/customers/UnmatchedIdentityPanel'),
  { ssr: false },
);

const PiiUnlockModal = dynamic(
  () => import('@/components/customers/PiiUnlockModal'),
  { ssr: false },
);

/* ── 타입 ── */
interface Customer {
  id: string;
  cusCode: string;
  name: string;
  mobile: string;
  cusGubun: string;
  cusClass: string;
  grade: string;
  point: number;
  totalPurchase: number;
  visitCount: number;
  lastVisitDate: string;
  joinDate: string;
  distinctVisitDays: number;
  avgCycleDays: number | null;
  daysSinceLastVisit: number | null;
  expectedNextVisit: string | null;
  cycleStatus: VisitCycleStatus;
  cycleStatusLabel: string;
  visitTrend: VisitTrendSegment;
  visitTrendLabel: string;
  recentAvgDays: number | null;
  historicalAvgDays: number | null;
  trendRatio: number | null;
}

interface Stats {
  totalCustomers: number;
  monthlyVisitors: number;
  newCustomers: number;
  avgSpend: number;
  overdueCount?: number;
  dueSoonCount?: number;
  withCycleData?: number;
  churnedCount?: number;
  increasingCount?: number;
  decreasingCount?: number;
}

interface AnalysisData {
  dowPattern:        { dow: string; visits: number; sales: number }[];
  returnRate:        number;
  freqDistribution:  { label: string; count: number }[];
  newCustomerTrend:  { month: string; count: number }[];
  cycleDistribution?: { label: string; count: number }[];
  overdueCount?: number;
  dueSoonCount?: number;
  withCycleData?: number;
  churnedCount?: number;
  increasingCount?: number;
  decreasingCount?: number;
  stableCount?: number;
  salesHistoryDays?: number;
  totalCustomers:    number;
}

interface DecryptedInfo extends DecryptedCustomer {}

interface DecryptLogRow {
  id: string;
  requestedByEmail: string;
  groupId: string;
  customerCount: number;
  action: string;
  filters: Record<string, string> | null;
  createdAt: string;
}

const GRADE_COLORS = ['#14b8a6','#f97316','#a78bfa','#fb7185','#34d399','#60a5fa','#fbbf24'];
const TABS = ['고객 목록', '방문 분석', '구매 분석', '알림톡', '조회 이력'] as const;

type SortField = CustomerSortField;

export default function CustomersPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="w-6 h-6 animate-spin text-teal-400" />
      </div>
    }>
      <CustomersPageContent />
    </Suspense>
  );
}

function CustomersPageContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';

  /* ── 상태 ── */
  const [tab,          setTab]          = useState<typeof TABS[number]>('고객 목록');
  const [stats,        setStats]        = useState<Stats | null>(null);
  const [page,         setPage]         = useState(1);
  const [search,       setSearch]       = useState('');
  const [listError,    setListError]    = useState<string | null>(null);
  const [analysis,     setAnalysis]     = useState<AnalysisData | null>(null);
  const [analysisLoad, setAnalysisLoad] = useState(false);
  const [decryptedMap,   setDecryptedMap]   = useState<Record<string, DecryptedInfo>>({});
  const [decryptedRows,  setDecryptedRows]  = useState<Record<string, unknown>[]>([]);
  const [piiUnlocked,    setPiiUnlocked]    = useState(false);
  const [bulkDecrypting, setBulkDecrypting] = useState(false);
  const [decryptLogs,    setDecryptLogs]    = useState<DecryptLogRow[]>([]);
  const [logsLoading,    setLogsLoading]    = useState(false);
  const [logsPage,       setLogsPage]       = useState(1);
  const [logsTotal,      setLogsTotal]      = useState(0);
  const [groupId,      setGroupId]      = useState('');
  const [userRole,     setUserRole]     = useState('');
  const [canDecrypt,   setCanDecrypt]   = useState(false);
  const [sortBy,       setSortBy]       = useState<SortField>('lastVisitDate');
  const [sortOrder,    setSortOrder]    = useState<'asc' | 'desc'>('desc');
  const [joinFrom,     setJoinFrom]     = useState('');
  const [joinTo,       setJoinTo]       = useState('');
  const [visitFrom,    setVisitFrom]    = useState('');
  const [visitTo,      setVisitTo]      = useState('');
  const [joinFromDraft,setJoinFromDraft]= useState('');
  const [joinToDraft,  setJoinToDraft]  = useState('');
  const [visitFromDraft,setVisitFromDraft]= useState('');
  const [visitToDraft, setVisitToDraft] = useState('');
  const [exporting,    setExporting]    = useState(false);
  const [cycleFilter,  setCycleFilter]  = useState<VisitCycleStatus | ''>('');
  const [trendFilter,  setTrendFilter]  = useState<VisitTrendSegment | ''>('');
  const [requestPanel, setRequestPanel] = useState<{ cusCode: string; label: string } | null>(null);
  const [purchasePanel, setPurchasePanel] = useState<{ cusCode: string; label: string } | null>(null);
  const [messagePanelOpen, setMessagePanelOpen] = useState(false);
  const [unmatchedOpen, setUnmatchedOpen] = useState(false);
  const [unmatchedCount, setUnmatchedCount] = useState(0);
  const [piiUnlockOpen, setPiiUnlockOpen] = useState(false);
  const [stepUpToken, setStepUpToken] = useState<string | null>(null);
  const pendingDecryptRef = useRef(false);

  const pendingDeepLink = useRef<string | null>(null);

  const LIMIT = 50;
  const COL_COUNT = 15;
  const LOGS_LIMIT = 30;

  const clearPii = useCallback(() => {
    setPiiUnlocked(false);
    setDecryptedMap({});
    setDecryptedRows([]);
    setStepUpToken(null);
    clearCustomerPiiSession();
    clearPiiUnlockToken();
  }, []);

  /* 세션 복원 / 매장·계정 변경 시 */
  useEffect(() => {
    if (!user?.uid || !storeId) {
      clearPii();
      return;
    }
    const saved = loadCustomerPiiSession(user.uid, storeId);
    const savedToken = loadPiiUnlockToken(user.uid, storeId);
    if (saved && Object.keys(saved.decryptedMap).length > 0 && savedToken) {
      setDecryptedMap(saved.decryptedMap);
      setDecryptedRows(saved.decryptedRows || []);
      setPiiUnlocked(true);
      setStepUpToken(savedToken);
    } else {
      setDecryptedMap({});
      setDecryptedRows([]);
      setPiiUnlocked(false);
    }
  }, [user?.uid, storeId, clearPii]);

  /* 복호화 상태 sessionStorage 동기화 */
  useEffect(() => {
    if (!user?.uid || !storeId || !piiUnlocked || Object.keys(decryptedMap).length === 0) return;
    saveCustomerPiiSession({
      uid: user.uid,
      storeId,
      decryptedMap,
      decryptedRows,
      unlockedAt: Date.now(),
    });
  }, [user?.uid, storeId, piiUnlocked, decryptedMap, decryptedRows]);

  /* ── 복호화 권한 (서버 확인 + 클라이언트 fallback) ── */
  useEffect(() => {
    if (!user?.uid) {
      setCanDecrypt(false);
      return;
    }

    if (isSuperuserEmail(user.email)) {
      setCanDecrypt(true);
    }

    let cancelled = false;

    (async () => {
      try {
        const headers = await getAuthHeaders();
        const params = new URLSearchParams();
        if (storeId) params.set('storeId', storeId);

        const [authRes, userRes, permRes] = await Promise.all([
          fetch(`/api/customers/decrypt-auth?${params}`, { headers }),
          fetch(`/api/users?uid=${encodeURIComponent(user.uid)}`, { headers }),
          fetch(`/api/permissions?type=myAccess${storeId ? `&storeId=${encodeURIComponent(storeId)}` : ''}`, { headers }),
        ]);

        if (cancelled) return;

        let role = currentStore?.role || '';
        let gid = '';
        let isSuperuserFromApi = false;

        if (userRes.ok) {
          const u = await userRes.json();
          role = u.user?.role || u.user?.groupId || role;
          setUserRole(role);
        }

        if (permRes.ok) {
          const p = await permRes.json();
          isSuperuserFromApi = !!p.isSuperuser;
          gid = p.groupId || p.role || role;
          setGroupId(gid);
        } else if (role) {
          gid = role;
          setGroupId(role);
        }

        if (authRes.ok) {
          const d = await authRes.json();
          if (d.groupId) setGroupId(d.groupId);
          setCanDecrypt(!!d.allowed);
          return;
        }

        const allowed =
          isSuperuserEmail(user.email)
          || isSuperuser(user.email, role)
          || isSuperuserFromApi
          || canDecryptCustomerPIIClient(gid, user.email, currentStore?.role, isSuperuserFromApi);

        setCanDecrypt(allowed);
      } catch {
        if (!cancelled) {
          setCanDecrypt(
            isSuperuserEmail(user.email)
            || isSuperuser(user.email, currentStore?.role)
            || canDecryptCustomerPIIClient(groupId, user.email, currentStore?.role),
          );
        }
      }
    })();

    return () => { cancelled = true; };
  }, [user?.uid, user?.email, storeId, currentStore?.role]);

  const loadUnmatchedCount = useCallback(async () => {
    if (!storeId || !canDecrypt) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/customers/unmatched?storeId=${encodeURIComponent(storeId)}`, { headers });
      const data = await res.json();
      if (res.ok) setUnmatchedCount(data.total || 0);
    } catch { /* ignore */ }
  }, [storeId, canDecrypt]);

  useEffect(() => {
    void loadUnmatchedCount();
  }, [loadUnmatchedCount]);

  const buildFilterBody = useCallback(() => ({
    storeId,
    search: search.trim(),
    joinFrom,
    joinTo,
    visitFrom,
    visitTo,
    cycleStatus: cycleFilter,
    visitTrend: trendFilter,
    sortBy,
    sortOrder,
  }), [storeId, search, joinFrom, joinTo, visitFrom, visitTo, cycleFilter, trendFilter, sortBy, sortOrder]);

  const mapApiRow = useCallback((r: Record<string, unknown>): Customer => ({
    id: String(r.cusCode || ''),
    cusCode: String(r.cusCode || ''),
    name: String(r.nameMasked || ''),
    mobile: String(r.phoneMasked || ''),
    cusGubun: String(r.cusGubun || ''),
    cusClass: String(r.cusClass || r.grade || ''),
    grade: String(r.grade || r.cusClass || ''),
    point: Number(r.point || 0),
    totalPurchase: Number(r.totalSales ?? r.totalPurchase ?? 0),
    visitCount: Number(r.distinctVisitDays ?? r.totalVisits ?? r.visitCount ?? 0),
    lastVisitDate: String(r.lastVisit ?? r.lastVisitDate ?? ''),
    joinDate: String(r.joinDate || r.writeDate || ''),
    distinctVisitDays: Number(r.distinctVisitDays ?? 0),
    avgCycleDays: r.avgCycleDays != null ? Number(r.avgCycleDays) : null,
    daysSinceLastVisit: r.daysSinceLastVisit != null ? Number(r.daysSinceLastVisit) : null,
    expectedNextVisit: r.expectedNextVisit ? String(r.expectedNextVisit) : null,
    cycleStatus: (r.cycleStatus as VisitCycleStatus) || 'unknown',
    cycleStatusLabel: String(r.cycleStatusLabel || ''),
    visitTrend: (r.visitTrend as VisitTrendSegment) || 'unknown',
    visitTrendLabel: String(r.visitTrendLabel || ''),
    recentAvgDays: r.recentAvgDays != null ? Number(r.recentAvgDays) : null,
    historicalAvgDays: r.historicalAvgDays != null ? Number(r.historicalAvgDays) : null,
    trendRatio: r.trendRatio != null ? Number(r.trendRatio) : null,
  }), []);

  const {
    data: customerData,
    isLoading: loading,
    isError: customerListError,
    refetch: refetchCustomers,
  } = useCustomers({
    storeId,
    page,
    limit: LIMIT,
    search: search.trim(),
    sortBy,
    sortOrder,
    joinFrom,
    joinTo,
    visitFrom,
    visitTo,
    cycleStatus: cycleFilter,
    visitTrend: trendFilter,
    enabled: !!storeId && tab === '고객 목록',
  });

  const customers = useMemo(
    () => (customerData?.customers ?? []).map(mapApiRow),
    [customerData?.customers, mapApiRow],
  );
  const total = customerData?.total ?? 0;

  useEffect(() => {
    if (customerData?.stats) setStats(customerData.stats as unknown as Stats);
  }, [customerData?.stats]);

  useEffect(() => {
    setListError(customerListError ? '고객 목록을 불러오지 못했습니다. 잠시 후 새로고침하세요.' : null);
  }, [customerListError]);

  /* 알림·POS watcher 딥링크: ?cusCode=98001234&openRequests=1 */
  useEffect(() => {
    if (!storeId) return;
    const cusCode = searchParams.get('cusCode')?.trim();
    if (!cusCode) return;
    if (pendingDeepLink.current === cusCode) return;

    pendingDeepLink.current = cusCode;
    setSearch(cusCode);
    setPage(1);
    setTab('고객 목록');

    const openRequests = searchParams.get('openRequests');
    if (openRequests === '1' || openRequests === 'true') {
      setRequestPanel({ cusCode, label: cusCode });
    }

    router.replace('/dashboard/customers', { scroll: false });
  }, [storeId, searchParams, router]);

  useEffect(() => {
    const cusCode = pendingDeepLink.current;
    if (!cusCode || loading) return;

    const match = customers.find(c => c.cusCode === cusCode);
    if (!match) return;

    const dec = decryptedMap[match.cusCode];
    setRequestPanel(prev => {
      if (prev?.cusCode === cusCode && prev.label !== cusCode) return prev;
      return {
        cusCode: match.cusCode,
        label: dec?.name || match.name || match.cusCode,
      };
    });
    pendingDeepLink.current = null;
  }, [customers, loading, decryptedMap]);

  const applyDateFilters = () => {
    setJoinFrom(joinFromDraft);
    setJoinTo(joinToDraft);
    setVisitFrom(visitFromDraft);
    setVisitTo(visitToDraft);
    setPage(1);
  };

  const resetDateFilters = () => {
    setJoinFromDraft('');
    setJoinToDraft('');
    setVisitFromDraft('');
    setVisitToDraft('');
    setJoinFrom('');
    setJoinTo('');
    setVisitFrom('');
    setVisitTo('');
    setPage(1);
  };

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder(o => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder(field === 'cusCode' ? 'asc' : 'desc');
    }
    setPage(1);
  };

  const exportExcel = async () => {
    if (!storeId || exporting) return;
    setExporting(true);
    try {
      const d = await fetchCustomersList({
        storeId,
        page: 1,
        limit: LIMIT,
        exportAll: true,
        search: search.trim(),
        sortBy,
        sortOrder,
        joinFrom,
        joinTo,
        visitFrom,
        visitTo,
        cycleStatus: cycleFilter,
        visitTrend: trendFilter,
      });

      const rows = (d.customers || []).map((r: Record<string, unknown>) => ({
        고객코드: String(r.cusCode || ''),
        이름: String(r.nameMasked || ''),
        전화: String(r.phoneMasked || ''),
        회원구분: String(r.cusGubun || ''),
        포인트: Number(r.point || 0),
        총구매액: Number(r.totalSales ?? r.totalPurchase ?? 0),
        방문일수: Number(r.distinctVisitDays ?? r.totalVisits ?? 0),
        가입일: String(r.joinDate || r.writeDate || '').slice(0, 10),
        최종방문일: String(r.lastVisit ?? r.lastVisitDate ?? '').slice(0, 10),
        평균방문주기일: r.avgCycleDays != null ? Number(r.avgCycleDays) : '',
        마지막방문후일수: r.daysSinceLastVisit != null ? Number(r.daysSinceLastVisit) : '',
        예상재방문일: String(r.expectedNextVisit || '').slice(0, 10),
        방문상태: String(r.cycleStatusLabel || r.cycleStatus || ''),
        방문패턴: String(r.visitTrendLabel || r.visitTrend || ''),
        최근평균주기일: r.recentAvgDays != null ? Number(r.recentAvgDays) : '',
        과거평균주기일: r.historicalAvgDays != null ? Number(r.historicalAvgDays) : '',
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '고객목록');
      const suffix = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `고객목록_${suffix}.xlsx`);
      getAuthJsonHeaders().then(headers =>
        fetch('/api/customers/export-log', {
          method: 'POST',
          headers,
          body: JSON.stringify({ storeId, mode: 'masked', rowCount: rows.length, filters: buildFilterBody() }),
        }),
      ).catch(() => {});
    } catch (e) {
      console.error('[customers] export error:', e);
      alert('엑셀 다운로드에 실패했습니다.');
    } finally {
      setExporting(false);
    }
  };

  const runBulkDecrypt = async (unlockToken: string) => {
    if (!storeId || bulkDecrypting || !canDecrypt) return;

    setBulkDecrypting(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/customers/decrypt', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json', 'X-PII-Unlock-Token': unlockToken },
        body: JSON.stringify({ ...buildFilterBody(), stepUpToken: unlockToken }),
      });
      const d = await res.json();
      if (d.code === 'STEP_UP_REQUIRED') {
        setPiiUnlockOpen(true);
        return;
      }
      if (d.error) throw new Error(d.error);

      const incomingMap: Record<string, DecryptedInfo> = {};
      for (const row of d.customers || []) {
        incomingMap[row.cusCode] = {
          cusCode: row.cusCode,
          name: row.name,
          phone: row.phone,
          birth: row.birth,
        };
      }
      setDecryptedMap(prev => mergeDecryptedMaps(prev, incomingMap));
      setDecryptedRows(prev => mergeDecryptedRows(prev, d.customers || []));
      setPiiUnlocked(true);
      const added = Object.keys(incomingMap).length;
      alert(`${added.toLocaleString()}명 개인정보가 복호화되었습니다. (30분·마스킹 전까지 유지)`);
    } catch (e) {
      console.error('[customers] bulk decrypt error:', e);
      alert(e instanceof Error ? e.message : '복호화에 실패했습니다.');
    } finally {
      setBulkDecrypting(false);
    }
  };

  const handleBulkDecrypt = async () => {
    if (!storeId || bulkDecrypting || !canDecrypt) return;
    if (!confirm('현재 필터 조건의 고객 개인정보를 복호화합니다. 지문 확인 후 조회 이력이 기록됩니다. 계속할까요?')) return;

    const existing = stepUpToken || loadPiiUnlockToken(user?.uid || '', storeId);
    if (existing && isPiiUnlockTokenValid(user?.uid || '', storeId)) {
      setStepUpToken(existing);
      await runBulkDecrypt(existing);
      return;
    }

    pendingDecryptRef.current = true;
    setPiiUnlockOpen(true);
  };

  const handlePiiUnlocked = async (token: string) => {
    setStepUpToken(token);
    if (pendingDecryptRef.current) {
      pendingDecryptRef.current = false;
      await runBulkDecrypt(token);
    }
  };

  const exportDecryptedExcel = async () => {
    const uid = user?.uid || '';
    const token = stepUpToken || loadPiiUnlockToken(uid, storeId);
    if (!token || !isPiiUnlockTokenValid(uid, storeId)) {
      pendingDecryptRef.current = false;
      setPiiUnlockOpen(true);
      return;
    }

    const sourceRows = decryptedRows.length > 0
      ? decryptedRows
      : Object.values(decryptedMap).map(d => ({
          cusCode: d.cusCode,
          name: d.name,
          phone: d.phone,
          birth: d.birth,
        }));
    if (sourceRows.length === 0) {
      alert('먼저 개인정보 복호화를 실행하세요.');
      return;
    }
    setExporting(true);
    try {
      const rows = sourceRows.map(r => ({
        고객코드: String(r.cusCode || ''),
        이름: String(r.name || ''),
        전화: String(r.phone || ''),
        생년월일: String(r.birth || '').slice(0, 10),
        회원구분: String(r.cusGubun || ''),
        포인트: Number(r.point || 0),
        총구매액: Number(r.totalPurchase || 0),
        방문일수: Number(r.visitCount || 0),
        가입일: String(r.joinDate || '').slice(0, 10),
        최종방문일: String(r.lastVisitDate || '').slice(0, 10),
        평균방문주기일: r.avgCycleDays != null ? Number(r.avgCycleDays) : '',
        마지막방문후일수: r.daysSinceLastVisit != null ? Number(r.daysSinceLastVisit) : '',
        예상재방문일: String(r.expectedNextVisit || '').slice(0, 10),
        방문상태: String(r.cycleStatusLabel || r.cycleStatus || ''),
        방문패턴: String(r.visitTrendLabel || r.visitTrend || ''),
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '고객목록_복호화');
      XLSX.writeFile(wb, `고객목록_복호화_${new Date().toISOString().slice(0, 10)}.xlsx`);
      const headers = await getAuthJsonHeaders();
      await fetch('/api/customers/export-log', {
        method: 'POST',
        headers,
        body: JSON.stringify({ storeId, mode: 'decrypted', rowCount: rows.length, filters: buildFilterBody() }),
      });
    } catch (e) {
      console.error('[customers] decrypted export error:', e);
      alert('복호화 엑셀 다운로드에 실패했습니다.');
    } finally {
      setExporting(false);
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortBy !== field) return <ArrowUpDown className="w-3 h-3 opacity-40" />;
    return sortOrder === 'asc'
      ? <ArrowUp className="w-3 h-3 text-teal-400" />
      : <ArrowDown className="w-3 h-3 text-teal-400" />;
  };

  const CycleBadge = ({ status, label }: { status: VisitCycleStatus; label: string }) => {
    const cls: Record<VisitCycleStatus, string> = {
      overdue: 'bg-red-900/40 text-red-400 border-red-500/30',
      due_soon: 'bg-amber-900/40 text-amber-400 border-amber-500/30',
      active: 'bg-emerald-900/40 text-emerald-400 border-emerald-500/30',
      new: 'bg-blue-900/40 text-blue-400 border-blue-500/30',
      unknown: 'bg-slate-800 text-slate-500 border-slate-600/30',
    };
    return (
      <span className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] border whitespace-nowrap ${cls[status]}`}>
        {label}
      </span>
    );
  };

  const TrendBadge = ({ trend, label }: { trend: VisitTrendSegment; label: string }) => {
    const cls: Record<VisitTrendSegment, string> = {
      churned: 'bg-rose-950/50 text-rose-400 border-rose-500/30',
      increasing: 'bg-teal-900/40 text-teal-300 border-teal-500/30',
      decreasing: 'bg-orange-900/40 text-orange-400 border-orange-500/30',
      stable: 'bg-slate-800 text-slate-400 border-slate-600/30',
      new: 'bg-blue-900/40 text-blue-400 border-blue-500/30',
      unknown: 'bg-slate-800 text-slate-500 border-slate-600/30',
    };
    return (
      <span className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] border whitespace-nowrap ${cls[trend]}`}>
        {label}
      </span>
    );
  };

  const openTrendList = (trend: VisitTrendSegment) => {
    setTab('고객 목록');
    setTrendFilter(trend);
    setCycleFilter('');
    setPage(1);
  };

  /* ── 통계/등급 (API) ── */
  const loadStats = useCallback(async () => {
    if (!storeId) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/customers?storeId=${storeId}&limit=1`, { headers });
      const d = await res.json();
      if (!d.error) {
        setStats(d.stats || null);
      }
    } catch (e) {
      console.error('[customers] stats error:', e);
    }
  }, [storeId]);

  /* ── 분석 데이터 조회 ── */
  const loadAnalysis = useCallback(async () => {
    if (!storeId) return;
    setAnalysisLoad(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/customers/analysis?storeId=${storeId}`, { headers });
      const d = await res.json();
      if (!d.error) setAnalysis(d);
    } catch { /* silent */ }
    finally { setAnalysisLoad(false); }
  }, [storeId]);

  useEffect(() => { if (tab === '방문 분석') loadAnalysis(); }, [tab, loadAnalysis]);

  const loadDecryptLogs = useCallback(async () => {
    if (!storeId || !canDecrypt) return;
    setLogsLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `/api/customers/decrypt-logs?storeId=${storeId}&page=${logsPage}&limit=${LOGS_LIMIT}`,
        { headers },
      );
      const d = await res.json();
      if (!d.error) {
        setDecryptLogs(d.logs || []);
        setLogsTotal(d.total ?? 0);
      }
    } catch { /* silent */ }
    finally { setLogsLoading(false); }
  }, [storeId, canDecrypt, logsPage]);

  useEffect(() => {
    if (tab === '조회 이력') loadDecryptLogs();
  }, [tab, loadDecryptLogs]);

  const formatFilterSummary = (filters: Record<string, string> | null) => {
    if (!filters) return '전체';
    const parts: string[] = [];
    if (filters.search) parts.push(`검색:${filters.search}`);
    if (filters.cycleStatus) parts.push(`상태:${filters.cycleStatus}`);
    if (filters.joinFrom || filters.joinTo) parts.push(`가입 ${filters.joinFrom || '…'}~${filters.joinTo || '…'}`);
    if (filters.visitFrom || filters.visitTo) parts.push(`방문 ${filters.visitFrom || '…'}~${filters.visitTo || '…'}`);
    return parts.length ? parts.join(' · ') : '전체';
  };

  const paginatedCustomers = customers;
  const totalPages = Math.ceil(total / LIMIT) || 1;

  /* ── 탭 버튼 ── */
  const TabBtn = ({ label }: { label: typeof TABS[number] }) => (
    <button
      onClick={() => setTab(label)}
      className={`px-4 py-2 text-sm rounded-lg transition-all shrink-0 whitespace-nowrap ${
        tab === label
          ? 'bg-teal-600/20 text-teal-300 font-semibold border border-teal-500/30'
          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="p-4 md:p-6 space-y-5 text-slate-200 min-h-0">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Users className="w-6 h-6 text-teal-400" />
          <h1 className="text-lg font-bold">고객 관리</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (!storeId) return;
              overlay.open(
                <CustomerRegistrationFunnel
                  storeId={storeId}
                  onClose={() => overlay.close()}
                  onDone={() => {
                    void refetchCustomers();
                    overlay.toast('고객이 등록되었습니다', { variant: 'success' });
                  }}
                />,
                { className: 'max-w-lg w-full', closeOnBackdrop: false },
              );
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-teal-600 hover:bg-teal-500 text-black"
          >
            <UserPlus className="w-3.5 h-3.5" />
            고객 등록
          </button>
          {canDecrypt && (
            <button
              type="button"
              onClick={() => setUnmatchedOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-900/40 border border-amber-600/40 text-amber-200 hover:bg-amber-800/50"
            >
              <UserSearch className="w-3.5 h-3.5" />
              공개주문 미매치
              {unmatchedCount > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-500 text-slate-900 text-[10px] font-bold">
                  {unmatchedCount}
                </span>
              )}
            </button>
          )}
          <button
            onClick={() => {
              if (tab === '고객 목록') void refetchCustomers();
              else if (tab === '조회 이력') loadDecryptLogs();
              else { loadStats(); loadAnalysis(); }
              void loadUnmatchedCount();
            }}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />새로고침
          </button>
        </div>
      </div>

      {/* 통계 카드 */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9 gap-3">
          <StatCard icon={<Users className="w-4 h-4 text-teal-400" />}
            label="전체 고객" value={stats.totalCustomers.toLocaleString()} unit="명" />
          <StatCard icon={<TrendingUp className="w-4 h-4 text-orange-400" />}
            label="이달 방문" value={stats.monthlyVisitors.toLocaleString()} unit="명" />
          <StatCard icon={<UserPlus className="w-4 h-4 text-purple-400" />}
            label="이달 신규" value={stats.newCustomers.toLocaleString()} unit="명" />
          <StatCard icon={<ShoppingBag className="w-4 h-4 text-green-400" />}
            label="평균 객단가" value={stats.avgSpend.toLocaleString()} unit="원" />
          <StatCard icon={<BarChart2 className="w-4 h-4 text-amber-400" />}
            label="재방문 임박" value={(stats.dueSoonCount ?? 0).toLocaleString()} unit="명"
            onClick={() => { setTab('고객 목록'); setCycleFilter('due_soon'); setTrendFilter(''); setPage(1); }} />
          <StatCard icon={<BarChart2 className="w-4 h-4 text-red-400" />}
            label="이탈 위험" value={(stats.overdueCount ?? 0).toLocaleString()} unit="명"
            onClick={() => { setTab('고객 목록'); setCycleFilter('overdue'); setTrendFilter(''); setPage(1); }} />
          <StatCard icon={<Users className="w-4 h-4 text-rose-400" />}
            label="방문 끊김" value={(stats.churnedCount ?? 0).toLocaleString()} unit="명"
            onClick={() => openTrendList('churned')} />
          <StatCard icon={<TrendingUp className="w-4 h-4 text-teal-300" />}
            label="방문 증가" value={(stats.increasingCount ?? 0).toLocaleString()} unit="명"
            onClick={() => openTrendList('increasing')} />
          <StatCard icon={<TrendingUp className="w-4 h-4 text-orange-300 rotate-180" />}
            label="방문 감소" value={(stats.decreasingCount ?? 0).toLocaleString()} unit="명"
            onClick={() => openTrendList('decreasing')} />
        </div>
      )}

      {/* 탭 */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3 overflow-x-auto scrollbar-thin-x flex-nowrap -mx-1 px-1">
        {TABS.filter(t => {
          if (t === '조회 이력' || t === '알림톡') return canDecrypt;
          return true;
        }).map(t => <TabBtn key={t} label={t} />)}
      </div>

      {/* ── 탭 콘텐츠 ── */}

      {/* 고객 목록 탭 */}
      {tab === '고객 목록' && (
        <div className="space-y-3">
          {/* 기간 · 검색 · 필터 */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <p className="text-[10px] text-slate-500 mb-1">가입일</p>
                <div className="flex items-center gap-1.5">
                  <input type="date" value={joinFromDraft} onChange={e => setJoinFromDraft(e.target.value)}
                    className="px-2 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200" />
                  <span className="text-slate-600 text-xs">~</span>
                  <input type="date" value={joinToDraft} onChange={e => setJoinToDraft(e.target.value)}
                    className="px-2 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200" />
                </div>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 mb-1">최종방문일</p>
                <div className="flex items-center gap-1.5">
                  <input type="date" value={visitFromDraft} onChange={e => setVisitFromDraft(e.target.value)}
                    className="px-2 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200" />
                  <span className="text-slate-600 text-xs">~</span>
                  <input type="date" value={visitToDraft} onChange={e => setVisitToDraft(e.target.value)}
                    className="px-2 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200" />
                </div>
              </div>
              <button onClick={applyDateFilters}
                className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-xs font-medium">
                기간 조회
              </button>
              <button onClick={resetDateFilters}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs">
                초기화
              </button>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[160px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                <input
                  type="text"
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1); }}
                  placeholder="고객코드 검색..."
                  className="w-full pl-8 pr-3 py-2 bg-slate-800/60 border border-slate-700 rounded-lg text-xs text-slate-200 placeholder-slate-600 outline-none focus:border-teal-500"
                />
              </div>
              <select
                value={cycleFilter}
                onChange={e => { setCycleFilter(e.target.value as VisitCycleStatus | ''); setPage(1); }}
                className="px-3 py-2 bg-slate-800/60 border border-slate-700 rounded-lg text-xs text-slate-300 outline-none focus:border-teal-500"
              >
                <option value="">전체 상태</option>
                <option value="active">정상</option>
                <option value="due_soon">재방문 임박</option>
                <option value="overdue">이탈 위험</option>
                <option value="new">신규(1회)</option>
              </select>
              <select
                value={trendFilter}
                onChange={e => { setTrendFilter(e.target.value as VisitTrendSegment | ''); setPage(1); }}
                className="px-3 py-2 bg-slate-800/60 border border-slate-700 rounded-lg text-xs text-slate-300 outline-none focus:border-teal-500"
              >
                <option value="">전체 패턴</option>
                <option value="churned">방문 끊김</option>
                <option value="increasing">방문 증가</option>
                <option value="decreasing">방문 감소</option>
                <option value="stable">안정</option>
              </select>
              <button
                onClick={exportExcel}
                disabled={exporting || loading}
                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-700/40 hover:bg-emerald-600/50 border border-emerald-600/40 text-emerald-300 rounded-lg text-xs font-medium disabled:opacity-50"
              >
                {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                마스킹 엑셀
              </button>
              {canDecrypt && (
                <>
                  <button
                    onClick={handleBulkDecrypt}
                    disabled={bulkDecrypting || loading}
                    className="flex items-center gap-1.5 px-3 py-2 bg-violet-700/40 hover:bg-violet-600/50 border border-violet-600/40 text-violet-300 rounded-lg text-xs font-medium disabled:opacity-50"
                  >
                    {bulkDecrypting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                    {piiUnlocked ? '현재 목록 추가 복호화' : '개인정보 복호화'}
                  </button>
                  {piiUnlocked && (
                    <>
                      <button
                        onClick={clearPii}
                        className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-300 rounded-lg text-xs font-medium"
                      >
                        <EyeOff className="w-3.5 h-3.5" />
                        마스킹
                      </button>
                      <button
                        onClick={exportDecryptedExcel}
                        disabled={exporting}
                        className="flex items-center gap-1.5 px-3 py-2 bg-violet-700/40 hover:bg-violet-600/50 border border-violet-600/40 text-violet-300 rounded-lg text-xs font-medium disabled:opacity-50"
                      >
                        {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                        복호화 엑셀
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setMessagePanelOpen(true)}
                    disabled={loading || total === 0}
                    className="flex items-center gap-1.5 px-3 py-2 bg-teal-700/40 hover:bg-teal-600/50 border border-teal-600/40 text-teal-300 rounded-lg text-xs font-medium disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    알림톡 발송
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab('조회 이력')}
                    className="flex items-center gap-1.5 px-3 py-2 bg-slate-800/60 hover:bg-slate-700 border border-slate-700 text-slate-400 rounded-lg text-xs"
                  >
                    <History className="w-3.5 h-3.5" />
                    조회 이력
                  </button>
                </>
              )}
            </div>

            {piiUnlocked && (
              <p className="text-[10px] text-violet-400/90 flex items-center gap-1">
                <Unlock className="w-3 h-3" />
                {Object.keys(decryptedMap).length.toLocaleString()}명 복호화 표시 중 · 지문 승인 후 30분 · 마스킹 전까지 유지
              </p>
            )}

            {(joinFrom || joinTo || visitFrom || visitTo) && (
              <p className="text-[10px] text-slate-500">
                적용 필터:
                {joinFrom || joinTo ? ` 가입 ${joinFrom || '…'}~${joinTo || '…'}` : ''}
                {visitFrom || visitTo ? ` · 방문 ${visitFrom || '…'}~${visitTo || '…'}` : ''}
                · {total.toLocaleString()}명 · 정렬 {sortBy} {sortOrder === 'asc' ? '↑' : '↓'}
              </p>
            )}
          </div>

          {/* 테이블 */}
          <div className="bg-slate-900/60 rounded-xl border border-slate-800 overflow-x-auto scrollbar-thin-x">
            <table className="w-full min-w-[720px] text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-500">
                  <th className="text-left px-3 py-2.5 font-medium">
                    <button type="button" onClick={() => handleSort('cusCode')} className="inline-flex items-center gap-1 hover:text-slate-300">
                      고객코드 <SortIcon field="cusCode" />
                    </button>
                  </th>
                  <th className="text-left px-3 py-2.5 font-medium">이름</th>
                  <th className="text-left px-3 py-2.5 font-medium">전화</th>
                  <th className="text-left px-3 py-2.5 font-medium">회원구분</th>
                  <th className="text-right px-3 py-2.5 font-medium">
                    <button type="button" onClick={() => handleSort('point')} className="inline-flex items-center gap-1 hover:text-slate-300 ml-auto">
                      포인트 <SortIcon field="point" />
                    </button>
                  </th>
                  <th className="text-right px-3 py-2.5 font-medium">
                    <button type="button" onClick={() => handleSort('totalPurchase')} className="inline-flex items-center gap-1 hover:text-slate-300 ml-auto">
                      총구매 <SortIcon field="totalPurchase" />
                    </button>
                  </th>
                  <th className="text-right px-3 py-2.5 font-medium">
                    <button type="button" onClick={() => handleSort('visitCount')} className="inline-flex items-center gap-1 hover:text-slate-300 ml-auto">
                      방문 <SortIcon field="visitCount" />
                    </button>
                  </th>
                  <th className="text-left px-3 py-2.5 font-medium">
                    <button type="button" onClick={() => handleSort('joinDate')} className="inline-flex items-center gap-1 hover:text-slate-300">
                      가입일 <SortIcon field="joinDate" />
                    </button>
                  </th>
                  <th className="text-left px-3 py-2.5 font-medium">
                    <button type="button" onClick={() => handleSort('lastVisitDate')} className="inline-flex items-center gap-1 hover:text-slate-300">
                      최근방문 <SortIcon field="lastVisitDate" />
                    </button>
                  </th>
                  <th className="text-right px-3 py-2.5 font-medium">
                    <button type="button" onClick={() => handleSort('avgCycleDays')} className="inline-flex items-center gap-1 hover:text-slate-300 ml-auto">
                      방문주기 <SortIcon field="avgCycleDays" />
                    </button>
                  </th>
                  <th className="text-right px-3 py-2.5 font-medium">
                    <button type="button" onClick={() => handleSort('daysSinceLastVisit')} className="inline-flex items-center gap-1 hover:text-slate-300 ml-auto">
                      경과일 <SortIcon field="daysSinceLastVisit" />
                    </button>
                  </th>
                  <th className="text-left px-3 py-2.5 font-medium">
                    <button type="button" onClick={() => handleSort('expectedNextVisit')} className="inline-flex items-center gap-1 hover:text-slate-300">
                      예상재방문 <SortIcon field="expectedNextVisit" />
                    </button>
                  </th>
                  <th className="text-center px-3 py-2.5 font-medium">상태</th>
                  <th className="text-center px-3 py-2.5 font-medium">패턴</th>
                  <th className="text-center px-3 py-2.5 font-medium">요청</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={COL_COUNT + 1} className="text-center py-10 text-slate-600">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                  </td></tr>
                ) : listError ? (
                  <tr><td colSpan={COL_COUNT + 1} className="text-center py-10 text-red-400/80 text-xs">
                    {listError}
                  </td></tr>
                ) : paginatedCustomers.length === 0 ? (
                  <tr><td colSpan={COL_COUNT + 1} className="text-center py-10 text-slate-600">
                    고객 데이터가 없습니다.<br />
                    <span className="text-slate-500 text-[11px]">POS: sync-customers + migrate(구매이력) 실행 필요</span>
                  </td></tr>
                ) : paginatedCustomers.map(c => {
                  const dec = decryptedMap[c.cusCode];
                  return (
                    <tr key={c.cusCode} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition">
                      <td className="px-3 py-2 font-mono text-slate-400">{c.cusCode}</td>
                      <td className="px-3 py-2">
                        {dec ? (
                          <span className="text-teal-300 font-medium">{dec.name || ''}</span>
                        ) : (
                          <span className="text-slate-500">{c.name || ''}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-400 font-mono text-[10px]">
                        {dec?.phone || c.mobile || ''}
                      </td>
                      <td className="px-3 py-2 text-slate-400">{c.cusGubun || ''}</td>
                      <td className="px-3 py-2 text-right text-slate-300">{c.point.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-slate-300">
                        {c.totalPurchase ? c.totalPurchase.toLocaleString() : ''}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-400">{c.visitCount || ''}</td>
                      <td className="px-3 py-2 text-slate-500">{c.joinDate?.slice(0, 10) || ''}</td>
                      <td className="px-3 py-2 text-slate-500">{c.lastVisitDate?.slice(0, 10) || ''}</td>
                      <td className="px-3 py-2 text-right text-violet-300">
                        {c.avgCycleDays != null ? `${c.avgCycleDays}일` : '-'}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-400">
                        {c.daysSinceLastVisit != null ? `${c.daysSinceLastVisit}일` : '-'}
                      </td>
                      <td className="px-3 py-2 text-slate-500">{c.expectedNextVisit?.slice(0, 10) || '-'}</td>
                      <td className="px-3 py-2 text-center">
                        <CycleBadge status={c.cycleStatus} label={c.cycleStatusLabel} />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <TrendBadge trend={c.visitTrend} label={c.visitTrendLabel} />
                        {c.recentAvgDays != null && c.historicalAvgDays != null && (
                          <p className="text-[9px] text-slate-600 mt-0.5">
                            {c.recentAvgDays}일 / {c.historicalAvgDays}일
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setPurchasePanel({
                              cusCode: c.cusCode,
                              label: dec?.name || c.name || c.cusCode,
                            })}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition"
                            title="구매 이력"
                          >
                            <ShoppingBag className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setRequestPanel({
                              cusCode: c.cusCode,
                              label: dec?.name || c.name || c.cusCode,
                            })}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] text-slate-400 hover:text-teal-400 hover:bg-slate-800 transition"
                            title="고객 요청 이력"
                          >
                            <ClipboardList className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 페이지네이션 */}
          {(totalPages > 1 || total > 0) && (
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>
                {total.toLocaleString()}명
                {totalPages > 1 && ` · ${((page - 1) * LIMIT + 1)}~${Math.min(page * LIMIT, total)}번째`}
              </span>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                  className="p-1 rounded hover:bg-slate-800 disabled:opacity-30 transition">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span>{page} / {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                  className="p-1 rounded hover:bg-slate-800 disabled:opacity-30 transition">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 방문 분석 탭 */}
      {tab === '방문 분석' && (
        <div className="space-y-5">
          {analysisLoad ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-teal-400" />
            </div>
          ) : analysis ? (
            <>
              {/* 방문 주기 · 이탈 */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-violet-400">{analysis.withCycleData ?? 0}</p>
                  <p className="text-[10px] text-slate-500 mt-1">주기 분석 가능</p>
                </div>
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-amber-400">{analysis.dueSoonCount ?? 0}</p>
                  <p className="text-[10px] text-slate-500 mt-1">재방문 임박</p>
                </div>
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-red-400">{analysis.overdueCount ?? 0}</p>
                  <p className="text-[10px] text-slate-500 mt-1">이탈 위험</p>
                </div>
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-teal-400">{analysis.salesHistoryDays ?? 0}</p>
                  <p className="text-[10px] text-slate-500 mt-1">구매이력 일수</p>
                </div>
              </div>

              {/* 방문 패턴 변화 */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                <p className="text-xs font-semibold text-slate-400 mb-1">방문 패턴 변화</p>
                <p className="text-[10px] text-slate-500 mb-3">
                  최근 90일 vs 과거 평균 방문 간격 비교 · 60일+ 미방문은 방문 끊김
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <button type="button" onClick={() => openTrendList('churned')}
                    className="text-center bg-rose-950/30 hover:bg-rose-950/50 border border-rose-800/40 rounded-xl p-4 transition">
                    <p className="text-2xl font-bold text-rose-400">{analysis.churnedCount ?? 0}</p>
                    <p className="text-[10px] text-slate-500 mt-1">방문 끊김</p>
                  </button>
                  <button type="button" onClick={() => openTrendList('increasing')}
                    className="text-center bg-teal-950/30 hover:bg-teal-950/50 border border-teal-800/40 rounded-xl p-4 transition">
                    <p className="text-2xl font-bold text-teal-300">{analysis.increasingCount ?? 0}</p>
                    <p className="text-[10px] text-slate-500 mt-1">방문 증가</p>
                  </button>
                  <button type="button" onClick={() => openTrendList('decreasing')}
                    className="text-center bg-orange-950/30 hover:bg-orange-950/50 border border-orange-800/40 rounded-xl p-4 transition">
                    <p className="text-2xl font-bold text-orange-400">{analysis.decreasingCount ?? 0}</p>
                    <p className="text-[10px] text-slate-500 mt-1">방문 감소</p>
                  </button>
                  <button type="button" onClick={() => openTrendList('stable')}
                    className="text-center bg-slate-800/60 hover:bg-slate-800 border border-slate-700 rounded-xl p-4 transition">
                    <p className="text-2xl font-bold text-slate-300">{analysis.stableCount ?? 0}</p>
                    <p className="text-[10px] text-slate-500 mt-1">안정</p>
                  </button>
                </div>
              </div>

              {(analysis.withCycleData ?? 0) === 0 && (analysis.salesHistoryDays ?? 0) < 30 && (
                <p className="text-xs text-amber-400/90 bg-amber-950/30 border border-amber-800/40 rounded-lg px-3 py-2">
                  방문 주기 분석을 위해 POS에서 구매 이력 동기화가 필요합니다.
                  POS PC: <code className="text-amber-300">node bridge.js migrate YYYY-MM-DD YYYY-MM-DD</code>
                  (회원별 품목 이력 포함)
                </p>
              )}

              {/* 재방문율 */}
              <div className="flex items-center gap-4 bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                <div className="text-center">
                  <p className="text-3xl font-bold text-teal-400">{analysis.returnRate}%</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">재방문율</p>
                </div>
                <div className="flex-1 space-y-1">
                  <p className="text-xs text-slate-400">2회 이상 방문 고객 비율</p>
                  <div className="w-full bg-slate-700 rounded-full h-2">
                    <div
                      className="bg-teal-500 h-2 rounded-full transition-all"
                      style={{ width: `${analysis.returnRate}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* 요일별 방문 패턴 */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                <p className="text-xs font-semibold text-slate-400 mb-3">요일별 방문 패턴</p>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={analysis.dowPattern} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="dow" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                    <Tooltip
                      contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                      labelStyle={{ color: '#e2e8f0', fontSize: 11 }}
                      itemStyle={{ color: '#14b8a6', fontSize: 11 }}
                      formatter={(v: number) => [v.toLocaleString() + '회', '방문']}
                    />
                    <Bar dataKey="visits" fill="#14b8a6" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* 방문 주기 분포 */}
              {analysis.cycleDistribution && analysis.cycleDistribution.some(b => b.count > 0) && (
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                  <p className="text-xs font-semibold text-slate-400 mb-3">평균 방문 주기 분포</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {analysis.cycleDistribution.map((b, i) => (
                      <div key={b.label} className="text-center bg-slate-800/60 rounded-lg p-3">
                        <p className="text-xl font-bold" style={{ color: GRADE_COLORS[i] }}>
                          {b.count.toLocaleString()}
                        </p>
                        <p className="text-[10px] text-slate-500 mt-0.5">{b.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 방문 빈도 분포 */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                <p className="text-xs font-semibold text-slate-400 mb-3">방문 빈도 분포</p>
                <div className="grid grid-cols-4 gap-2">
                  {analysis.freqDistribution.map((b, i) => (
                    <div key={b.label} className="text-center bg-slate-800/60 rounded-lg p-3">
                      <p className="text-xl font-bold" style={{ color: GRADE_COLORS[i] }}>
                        {b.count.toLocaleString()}
                      </p>
                      <p className="text-[10px] text-slate-500 mt-0.5">{b.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* 월별 신규고객 추이 */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                <p className="text-xs font-semibold text-slate-400 mb-3">월별 신규 고객 추이</p>
                <ResponsiveContainer width="100%" height={140}>
                  <LineChart data={analysis.newCustomerTrend} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }}
                      tickFormatter={v => v.slice(5)} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                    <Tooltip
                      contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                      labelStyle={{ color: '#e2e8f0', fontSize: 11 }}
                      itemStyle={{ color: '#a78bfa', fontSize: 11 }}
                      formatter={(v: number) => [v + '명', '신규 고객']}
                    />
                    <Line type="monotone" dataKey="count" stroke="#a78bfa" strokeWidth={2}
                      dot={{ r: 3, fill: '#a78bfa' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <p className="text-center py-16 text-slate-600 text-sm">데이터가 없습니다</p>
          )}
        </div>
      )}

      {/* 구매 분석 탭 */}
      {tab === '구매 분석' && storeId && (
        <CustomerPurchaseAnalyticsTab storeId={storeId} />
      )}

      {tab === '알림톡' && canDecrypt && storeId && (
        <CustomerMessageHistoryTab
          storeId={storeId}
          onOpenSend={() => setTab('고객 목록')}
        />
      )}

      {/* 조회 이력 탭 */}
      {tab === '조회 이력' && (
        <div className="space-y-3">
          {!canDecrypt ? (
            <p className="text-center py-16 text-slate-500 text-sm">개인정보 조회 이력은 관리자(점장·관리자·슈퍼유저)만 열람할 수 있습니다.</p>
          ) : logsLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-teal-400" />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500">
                  고객 개인정보 복호화 버튼 클릭 이력 · 총 {logsTotal.toLocaleString()}건
                </p>
                <button
                  onClick={loadDecryptLogs}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200"
                >
                  <RefreshCw className="w-3.5 h-3.5" />새로고침
                </button>
              </div>
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-500">
                      <th className="text-left px-3 py-2.5 font-medium">일시</th>
                      <th className="text-left px-3 py-2.5 font-medium">조회자</th>
                      <th className="text-left px-3 py-2.5 font-medium">권한</th>
                      <th className="text-right px-3 py-2.5 font-medium">고객수</th>
                      <th className="text-left px-3 py-2.5 font-medium">필터 조건</th>
                    </tr>
                  </thead>
                  <tbody>
                    {decryptLogs.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-12 text-slate-600">
                          조회 이력이 없습니다.
                        </td>
                      </tr>
                    ) : decryptLogs.map(log => (
                      <tr key={log.id} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                        <td className="px-3 py-2 text-slate-400 whitespace-nowrap">
                          {log.createdAt ? new Date(log.createdAt).toLocaleString('ko-KR') : '-'}
                        </td>
                        <td className="px-3 py-2 text-slate-300">{log.requestedByEmail || '-'}</td>
                        <td className="px-3 py-2 text-slate-500">{log.groupId || '-'}</td>
                        <td className="px-3 py-2 text-right text-violet-300 font-medium">
                          {log.customerCount.toLocaleString()}명
                        </td>
                        <td className="px-3 py-2 text-slate-500">{formatFilterSummary(log.filters)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {Math.ceil(logsTotal / LOGS_LIMIT) > 1 && (
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>{logsTotal.toLocaleString()}건</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setLogsPage(p => Math.max(1, p - 1))} disabled={logsPage <= 1}
                      className="p-1 rounded hover:bg-slate-800 disabled:opacity-30">
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span>{logsPage} / {Math.ceil(logsTotal / LOGS_LIMIT)}</span>
                    <button onClick={() => setLogsPage(p => Math.min(Math.ceil(logsTotal / LOGS_LIMIT), p + 1))}
                      disabled={logsPage >= Math.ceil(logsTotal / LOGS_LIMIT)}
                      className="p-1 rounded hover:bg-slate-800 disabled:opacity-30">
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {purchasePanel && storeId && (
        <CustomerPurchaseHistoryPanel
          storeId={storeId}
          cusCode={purchasePanel.cusCode}
          cusLabel={purchasePanel.label}
          onClose={() => setPurchasePanel(null)}
        />
      )}

      {requestPanel && storeId && (
        <CustomerRequestPanel
          storeId={storeId}
          cusCode={requestPanel.cusCode}
          customerLabel={requestPanel.label}
          onClose={() => setRequestPanel(null)}
        />
      )}

      {messagePanelOpen && storeId && (
        <CustomerMessagePanel
          storeId={storeId}
          filterBody={buildFilterBody()}
          filteredTotal={total}
          onClose={() => setMessagePanelOpen(false)}
        />
      )}

      {piiUnlockOpen && storeId && user?.uid && (
        <PiiUnlockModal
          open={piiUnlockOpen}
          storeId={storeId}
          uid={user.uid}
          onClose={() => {
            setPiiUnlockOpen(false);
            pendingDecryptRef.current = false;
          }}
          onUnlocked={(token) => {
            setPiiUnlockOpen(false);
            void handlePiiUnlocked(token);
          }}
        />
      )}

      {unmatchedOpen && storeId && (
        <UnmatchedIdentityPanel
          storeId={storeId}
          open={unmatchedOpen}
          onClose={() => setUnmatchedOpen(false)}
          onLinked={() => void loadUnmatchedCount()}
        />
      )}
    </div>
  );
}

function StatCard({ icon, label, value, unit, onClick }: {
  icon: React.ReactNode; label: string; value: string; unit: string; onClick?: () => void;
}) {
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? e => { if (e.key === 'Enter' || e.key === ' ') onClick(); } : undefined}
      className={`bg-slate-900/60 border border-slate-800 rounded-xl p-3.5${onClick ? ' cursor-pointer hover:border-slate-600 transition' : ''}`}
    >
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-xl font-bold text-slate-100">
        {value}<span className="text-xs text-slate-500 ml-1 font-normal">{unit}</span>
      </p>
    </div>
  );
}
