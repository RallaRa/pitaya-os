'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useStore } from '@/context/StoreContext';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  Users, TrendingUp, UserPlus, ShoppingBag, RefreshCw,
  Search, ChevronLeft, ChevronRight, Lock, Unlock, Loader2,
  BarChart2, PieChart as PieIcon, List, Download, ArrowUp, ArrowDown, ArrowUpDown,
} from 'lucide-react';
import { getAuthHeaders } from '@/lib/getAuthHeaders';
import * as XLSX from 'xlsx';
import type { CustomerSortField } from '@/lib/customerQuery';

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
}

interface Stats {
  totalCustomers: number;
  monthlyVisitors: number;
  newCustomers: number;
  avgSpend: number;
}

interface AnalysisData {
  dowPattern:        { dow: string; visits: number; sales: number }[];
  returnRate:        number;
  freqDistribution:  { label: string; count: number }[];
  gradeDistribution: { grade: string; count: number; totalSales: number }[];
  newCustomerTrend:  { month: string; count: number }[];
  totalCustomers:    number;
}

interface DecryptedInfo { cusCode: string; name: string; phone: string; birth: string }

const GRADE_COLORS = ['#14b8a6','#f97316','#a78bfa','#fb7185','#34d399','#60a5fa','#fbbf24'];
const TABS = ['고객 목록', '방문 분석', '등급 현황'] as const;

type SortField = CustomerSortField;

export default function CustomersPage() {
  const { user } = useAuth();
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';

  /* ── 상태 ── */
  const [tab,          setTab]          = useState<typeof TABS[number]>('고객 목록');
  const [customers,    setCustomers]    = useState<Customer[]>([]);
  const [stats,        setStats]        = useState<Stats | null>(null);
  const [grades,       setGrades]       = useState<string[]>([]);
  const [gradeFilter,  setGradeFilter]  = useState('');
  const [page,         setPage]         = useState(1);
  const [total,        setTotal]        = useState(0);
  const [search,       setSearch]       = useState('');
  const [loading,      setLoading]      = useState(true);
  const [listError,    setListError]    = useState<string | null>(null);
  const [analysis,     setAnalysis]     = useState<AnalysisData | null>(null);
  const [analysisLoad, setAnalysisLoad] = useState(false);
  const [decrypted,    setDecrypted]    = useState<Record<string, DecryptedInfo>>({});
  const [decryptLoad,  setDecryptLoad]  = useState<Record<string, boolean>>({});
  const [groupId,      setGroupId]      = useState('');
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

  const LIMIT = 50;
  const canDecrypt = groupId === 'master' || groupId === 'superuser';

  /* ── 권한 조회 ── */
  useEffect(() => {
    if (!user?.uid) return;
    getAuthHeaders()
      .then(h => fetch(`/api/permissions?type=myAccess${storeId ? `&storeId=${storeId}` : ''}`, { headers: h }))
      .then(r => r.json())
      .then(d => { if (d.groupId) setGroupId(d.groupId); })
      .catch(() => {});
  }, [user?.uid, storeId]);

  const buildQueryParams = useCallback((opts?: { page?: number; exportAll?: boolean }) => {
    const params = new URLSearchParams({
      storeId,
      page: String(opts?.page ?? page),
      limit: String(LIMIT),
      sortBy,
      sortOrder,
    });
    if (gradeFilter) params.set('grade', gradeFilter);
    if (search.trim()) params.set('search', search.trim());
    if (joinFrom) params.set('joinFrom', joinFrom);
    if (joinTo) params.set('joinTo', joinTo);
    if (visitFrom) params.set('visitFrom', visitFrom);
    if (visitTo) params.set('visitTo', visitTo);
    if (opts?.exportAll) params.set('exportAll', '1');
    return params;
  }, [storeId, page, sortBy, sortOrder, gradeFilter, search, joinFrom, joinTo, visitFrom, visitTo]);

  const mapApiRow = (r: Record<string, unknown>): Customer => ({
    id: String(r.cusCode || ''),
    cusCode: String(r.cusCode || ''),
    name: String(r.nameMasked || ''),
    mobile: String(r.phoneMasked || ''),
    cusGubun: String(r.cusGubun || ''),
    cusClass: String(r.cusClass || r.grade || ''),
    grade: String(r.grade || r.cusClass || ''),
    point: Number(r.point || 0),
    totalPurchase: Number(r.totalSales ?? r.totalPurchase ?? 0),
    visitCount: Number(r.totalVisits ?? r.visitCount ?? 0),
    lastVisitDate: String(r.lastVisit ?? r.lastVisitDate ?? ''),
    joinDate: String(r.joinDate || r.writeDate || ''),
  });

  /* ── 고객 목록 (API) ── */
  const loadCustomerList = useCallback(async () => {
    if (!storeId) {
      setCustomers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setListError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/customers?${buildQueryParams()}`, { headers });
      const d = await res.json();
      if (d.error) throw new Error(d.error);

      setCustomers((d.customers || []).map(mapApiRow));
      setTotal(d.total ?? 0);
      if (d.stats) setStats(d.stats);
      if (d.grades) setGrades(d.grades);
    } catch (e) {
      console.error('[customers] list error:', e);
      setListError('고객 목록을 불러오지 못했습니다. 잠시 후 새로고침하세요.');
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, [storeId, buildQueryParams]);

  useEffect(() => { loadCustomerList(); }, [loadCustomerList]);

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
      setSortOrder(field === 'cusCode' || field === 'grade' ? 'asc' : 'desc');
    }
    setPage(1);
  };

  const exportExcel = async () => {
    if (!storeId || exporting) return;
    setExporting(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/customers?${buildQueryParams({ exportAll: true, page: 1 })}`, { headers });
      const d = await res.json();
      if (d.error) throw new Error(d.error);

      const rows = (d.customers || []).map((r: Record<string, unknown>) => ({
        고객코드: String(r.cusCode || ''),
        이름: String(r.nameMasked || ''),
        전화: String(r.phoneMasked || ''),
        회원구분: String(r.cusGubun || ''),
        등급: String(r.cusClass || r.grade || ''),
        포인트: Number(r.point || 0),
        총구매액: Number(r.totalSales ?? r.totalPurchase ?? 0),
        방문횟수: Number(r.totalVisits ?? r.visitCount ?? 0),
        가입일: String(r.joinDate || r.writeDate || '').slice(0, 10),
        최종방문일: String(r.lastVisit ?? r.lastVisitDate ?? '').slice(0, 10),
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '고객목록');
      const suffix = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `고객목록_${suffix}.xlsx`);
    } catch (e) {
      console.error('[customers] export error:', e);
      alert('엑셀 다운로드에 실패했습니다.');
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

  /* ── 통계/등급 (API) ── */
  const loadStats = useCallback(async () => {
    if (!storeId) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/customers?storeId=${storeId}&limit=1`, { headers });
      const d = await res.json();
      if (!d.error) {
        setStats(d.stats || null);
        setGrades(d.grades || []);
        if (d.total > 0) setTotal(d.total);
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

  useEffect(() => { if (tab !== '고객 목록') loadAnalysis(); }, [tab, loadAnalysis]);

  /* ── PII 복호화 ── */
  const handleDecrypt = async (cusCode: string) => {
    if (decrypted[cusCode]) return;
    setDecryptLoad(p => ({ ...p, [cusCode]: true }));
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/customers/decrypt', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, cusCode }),
      });
      const d = await res.json();
      if (!d.error) setDecrypted(p => ({ ...p, [cusCode]: d }));
    } catch { /* silent */ }
    finally { setDecryptLoad(p => ({ ...p, [cusCode]: false })); }
  };

  const paginatedCustomers = customers;
  const totalPages = Math.ceil(total / LIMIT) || 1;

  /* ── 탭 버튼 ── */
  const TabBtn = ({ label }: { label: typeof TABS[number] }) => (
    <button
      onClick={() => setTab(label)}
      className={`px-4 py-2 text-sm rounded-lg transition-all ${
        tab === label
          ? 'bg-teal-600/20 text-teal-300 font-semibold border border-teal-500/30'
          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="p-4 md:p-6 space-y-5 text-slate-200 min-h-screen">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="w-6 h-6 text-teal-400" />
          <h1 className="text-lg font-bold">고객 관리</h1>
        </div>
        <button
          onClick={() => {
            if (tab === '고객 목록') loadCustomerList();
            else { loadStats(); loadAnalysis(); }
          }}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition"
        >
          <RefreshCw className="w-3.5 h-3.5" />새로고침
        </button>
      </div>

      {/* 통계 카드 */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={<Users className="w-4 h-4 text-teal-400" />}
            label="전체 고객" value={stats.totalCustomers.toLocaleString()} unit="명" />
          <StatCard icon={<TrendingUp className="w-4 h-4 text-orange-400" />}
            label="이달 방문" value={stats.monthlyVisitors.toLocaleString()} unit="명" />
          <StatCard icon={<UserPlus className="w-4 h-4 text-purple-400" />}
            label="이달 신규" value={stats.newCustomers.toLocaleString()} unit="명" />
          <StatCard icon={<ShoppingBag className="w-4 h-4 text-green-400" />}
            label="평균 객단가" value={stats.avgSpend.toLocaleString()} unit="원" />
        </div>
      )}

      {/* 탭 */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        {TABS.map(t => <TabBtn key={t} label={t} />)}
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
                value={gradeFilter}
                onChange={e => { setGradeFilter(e.target.value); setPage(1); }}
                className="px-3 py-2 bg-slate-800/60 border border-slate-700 rounded-lg text-xs text-slate-300 outline-none focus:border-teal-500"
              >
                <option value="">전체 등급</option>
                {grades.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
              <button
                onClick={exportExcel}
                disabled={exporting || loading}
                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-700/40 hover:bg-emerald-600/50 border border-emerald-600/40 text-emerald-300 rounded-lg text-xs font-medium disabled:opacity-50"
              >
                {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                엑셀 다운로드
              </button>
            </div>

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
          <div className="bg-slate-900/60 rounded-xl border border-slate-800 overflow-x-auto">
            <table className="w-full text-xs">
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
                  <th className="text-left px-3 py-2.5 font-medium">
                    <button type="button" onClick={() => handleSort('grade')} className="inline-flex items-center gap-1 hover:text-slate-300">
                      등급 <SortIcon field="grade" />
                    </button>
                  </th>
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
                  {canDecrypt && <th className="text-center px-3 py-2.5 font-medium">복호화</th>}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={canDecrypt ? 11 : 10} className="text-center py-10 text-slate-600">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                  </td></tr>
                ) : listError ? (
                  <tr><td colSpan={canDecrypt ? 11 : 10} className="text-center py-10 text-red-400/80 text-xs">
                    {listError}
                  </td></tr>
                ) : paginatedCustomers.length === 0 ? (
                  <tr><td colSpan={canDecrypt ? 11 : 10} className="text-center py-10 text-slate-600">
                    고객 데이터가 없습니다.<br />
                    <span className="text-slate-500 text-[11px]">POS PC에서 `node bridge.js sync-customers` 실행 필요</span>
                  </td></tr>
                ) : paginatedCustomers.map(c => {
                  const dec = decrypted[c.cusCode];
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
                      <td className="px-3 py-2">
                        {(c.cusClass || c.grade) ? (
                          <span className="px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 text-[10px]">{c.cusClass || c.grade}</span>
                        ) : ''}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-300">{c.point.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-slate-300">
                        {c.totalPurchase ? c.totalPurchase.toLocaleString() : ''}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-400">{c.visitCount || ''}</td>
                      <td className="px-3 py-2 text-slate-500">{c.joinDate?.slice(0, 10) || ''}</td>
                      <td className="px-3 py-2 text-slate-500">{c.lastVisitDate?.slice(0, 10) || ''}</td>
                      {canDecrypt && (
                        <td className="px-3 py-2 text-center">
                          {dec ? (
                            <button
                              onClick={() => setDecrypted(p => { const n = { ...p }; delete n[c.cusCode]; return n; })}
                              className="inline-flex items-center gap-1 text-[10px] text-teal-400 hover:text-teal-300 transition"
                              title="숨기기"
                            >
                              <Unlock className="w-3 h-3" />
                              <span className="hidden sm:inline">{dec.phone || '-'}</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => handleDecrypt(c.cusCode)}
                              disabled={decryptLoad[c.cusCode]}
                              className="inline-flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300 transition disabled:opacity-50"
                              title="복호화"
                            >
                              {decryptLoad[c.cusCode]
                                ? <Loader2 className="w-3 h-3 animate-spin" />
                                : <Lock className="w-3 h-3" />}
                            </button>
                          )}
                        </td>
                      )}
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

      {/* 등급 현황 탭 */}
      {tab === '등급 현황' && (
        <div className="space-y-5">
          {analysisLoad ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-teal-400" />
            </div>
          ) : analysis && analysis.gradeDistribution.length > 0 ? (
            <>
              {/* 파이차트 */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                <p className="text-xs font-semibold text-slate-400 mb-3">등급별 고객 비율</p>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={analysis.gradeDistribution}
                      dataKey="count"
                      nameKey="grade"
                      cx="50%" cy="50%"
                      outerRadius={80}
                      label={({ name, percent }) =>
                        `${name} ${Math.round((percent as number) * 100)}%`
                      }
                      labelLine={false}
                    >
                      {analysis.gradeDistribution.map((_, i) => (
                        <Cell key={i} fill={GRADE_COLORS[i % GRADE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                      formatter={(v: number) => [v.toLocaleString() + '명', '고객수']}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* 테이블 */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-500">
                      <th className="text-left px-3 py-2.5">등급</th>
                      <th className="text-right px-3 py-2.5">고객수</th>
                      <th className="text-right px-3 py-2.5">비율</th>
                      <th className="text-right px-3 py-2.5">총매출</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.gradeDistribution.map((g, i) => (
                      <tr key={g.grade} className="border-b border-slate-800/50 hover:bg-slate-800/20 transition">
                        <td className="px-3 py-2 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full shrink-0"
                            style={{ background: GRADE_COLORS[i % GRADE_COLORS.length] }} />
                          {g.grade}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-300">{g.count.toLocaleString()}명</td>
                        <td className="px-3 py-2 text-right text-slate-400">
                          {analysis.totalCustomers > 0
                            ? Math.round((g.count / analysis.totalCustomers) * 100) + '%'
                            : '-'}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-300">
                          {g.totalSales ? Math.round(g.totalSales / 10000).toLocaleString() + '만' : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="text-center py-16 text-slate-600 text-sm">등급 데이터가 없습니다</p>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, unit }: {
  icon: React.ReactNode; label: string; value: string; unit: string;
}) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3.5">
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
