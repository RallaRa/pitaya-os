'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Store, Shield, Users, ChevronRight, Layers, UserCog, Loader2, LayoutGrid, SlidersHorizontal, Database, CloudSun, TrendingUp, UserSquare, Building2, Tag, Package, CalendarDays, UserCircle, Target } from 'lucide-react';
import { getAuthHeaders, getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import { useAuth } from '@/context/AuthContext';
import { useStore } from '@/context/StoreContext';
import { isSuperuser } from '@/lib/auth/permissions';
import { isAdminLevelGroup, normalizeRole } from '@/lib/roleMapping';

type MenuAccess = {
  ai: boolean; sales: boolean; purchase: boolean; report: boolean;
  messenger: boolean; members: boolean; store: boolean;
  permissionGroup: boolean; memberGroup: boolean;
};

export default function SettingsPage() {
  const { user } = useAuth();
  const { currentStore, storesLoaded } = useStore();
  const [menuAccess, setMenuAccess] = useState<MenuAccess | null>(null);
  const [accessLoaded, setAccessLoaded] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);

  const [migrating, setMigrating]   = useState(false);
  const [migrateResult, setMigrateResult] = useState<{ migrated: number; skipped: number; message: string } | null>(null);
  const [migrateError, setMigrateError]   = useState<string | null>(null);

  const [backfilling, setBackfilling]     = useState(false);
  const [backfillResult, setBackfillResult] = useState<{ updated: number; failed: number; message: string } | null>(null);
  const [backfillError, setBackfillError]   = useState<string | null>(null);

  const [fixingNet, setFixingNet]       = useState(false);
  const [fixNetResult, setFixNetResult] = useState<{ fixed: number; candidates: number; message: string; details: { reportDate: string; oldNetSales: number; newNetSales: number; source: string }[] } | null>(null);
  const [fixNetError, setFixNetError]   = useState<string | null>(null);

  const [recalcing, setRecalcing]       = useState(false);
  const [recalcResult, setRecalcResult] = useState<{ fixed: number; total: number; message: string } | null>(null);
  const [recalcError, setRecalcError]   = useState<string | null>(null);

  const [posBreakdownMigrating, setPosBreakdownMigrating] = useState(false);
  const [posBreakdownResult, setPosBreakdownResult] = useState<{ updated: number; skipped: number; total: number; message: string } | null>(null);
  const [posBreakdownError, setPosBreakdownError]   = useState<string | null>(null);

  const [initingItems,   setInitingItems]   = useState(false);
  const [initItemsResult, setInitItemsResult] = useState<{ saved: number; skipped: number; total: number } | null>(null);
  const [initItemsError,  setInitItemsError]  = useState<string | null>(null);

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
    const storeId = currentStore?.storeId || '';
    const url = `/api/permissions?type=myAccess${storeId ? `&storeId=${storeId}` : ''}`;
    getAuthHeaders()
      .then(headers => fetch(url, { headers }))
      .then(r => r.json())
      .then(data => { if (data.menuAccess) setMenuAccess(data.menuAccess); })
      .finally(() => setAccessLoaded(true));
  }, [user?.uid, currentStore?.storeId, storesLoaded]);

  const personalMenus = [
    {
      href: '/dashboard/settings/account',
      icon: <UserCircle className="w-5 h-5 text-[#FEE500]" />,
      label: '내 계정',
      description: 'Google 로그인 정보 · 카카오 알림 연동',
    },
  ];

  const allMenus = [
    {
      key: 'members' as const,
      href: '/dashboard/hr/members',
      icon: <Users className="w-5 h-5 text-blue-400" />,
      label: '멤버 관리',
      description: '소속 신청 승인/거절 및 멤버 목록 확인',
    },
    {
      key: 'store' as const,
      href: '/dashboard/settings/store',
      icon: <Store className="w-5 h-5 text-teal-400" />,
      label: '매장 정보',
      description: '매장 정보, 지역, 연결 계정 관리',
    },
    {
      key: 'permissionGroup' as const,
      href: '/dashboard/settings/permission-group',
      icon: <Layers className="w-5 h-5 text-purple-400" />,
      label: '권한 그룹 관리',
      description: '그룹별 메뉴 접근 권한 설정',
    },
    {
      key: 'memberGroup' as const,
      href: '/dashboard/settings/member-group',
      icon: <UserCog className="w-5 h-5 text-yellow-400" />,
      label: '멤버-그룹 연결',
      description: '멤버에게 권한 그룹 배정',
    },
  ];

  const storeRole = normalizeRole(currentStore?.role || '');
  const adminOnlyMenus = [
    {
      href: '/dashboard/settings/annual-leave',
      icon: <CalendarDays className="w-5 h-5 text-emerald-400" />,
      label: '연차 생성',
      description: '입사일·만근 기준 연차 자동 계산 및 부여',
      show: isAdminLevelGroup(storeRole),
    },
    {
      href: '/dashboard/settings/leave-status',
      icon: <CalendarDays className="w-5 h-5 text-amber-400" />,
      label: '연차현황',
      description: '전체 사원 연차 현황 및 일괄 등록',
      show: isAdminLevelGroup(storeRole),
    },
    {
      href: '/dashboard/settings/modules',
      icon: <Package className="w-5 h-5 text-violet-400" />,
      label: '모듈 관리',
      description: '대시보드·매입·HR 등 기능 모듈 ON/OFF',
      show: isAdminLevelGroup(storeRole),
    },
    {
      href: '/dashboard/settings/widgets',
      icon: <LayoutGrid className="w-5 h-5 text-teal-400" />,
      label: '대시보드 위젯 권한',
      description: '역할별 위젯 표시 여부 설정',
      show: isAdminLevelGroup(storeRole),
    },
    {
      href: '/dashboard/settings/prediction-variables',
      icon: <SlidersHorizontal className="w-5 h-5 text-orange-400" />,
      label: 'AI 예측 변수 설정',
      description: '날씨·요일·이벤트가 매출에 미치는 영향 변수 관리',
      show: isAdminLevelGroup(storeRole),
    },
    {
      href: '/dashboard/settings/sales-targets',
      icon: <Target className="w-5 h-5 text-amber-400" />,
      label: '매출·객수 목표',
      description: '월별 순매출·총객수 목표 (기간별) — 대시보드 매출 목표에 반영',
      show: isAdminLevelGroup(storeRole),
    },
    {
      href: '/dashboard/settings/sales-categories',
      icon: <Tag className="w-5 h-5 text-rose-400" />,
      label: '매출 카테고리 키워드',
      description: 'POS 품목명 → 소고기·돼지·닭·양념 자동 분류 키워드',
      show: isAdminLevelGroup(storeRole),
    },
  ].filter(m => m.show);

  const isSuperuserUser = isSuperuser(user?.email, userRole || undefined);

  const superuserMenus = isSuperuserUser ? [
    {
      href: '/dashboard/settings/stores',
      icon: <Shield className="w-5 h-5 text-purple-400" />,
      label: '매장 승인 관리',
      description: '신규 매장 등록 승인·거절·수정·삭제',
    },
    {
      href: '/dashboard/settings/scraper-sources',
      icon: <Store className="w-5 h-5 text-teal-400" />,
      label: '스크래핑 소스 관리',
      description: '도매가 수집 사이트 추가·관리',
    },
  ] : [];

  const visibleMenus = menuAccess
    ? allMenus.filter(m => menuAccess[m.key])
    : [];

  const isMasterOrAdmin = isAdminLevelGroup(storeRole);
  const isMasterOrSuperuser = storeRole === 'superuser';

  const hrMenus = isMasterOrAdmin ? [
    {
      href: '/dashboard/hr-system',
      icon: <Users className="w-5 h-5 text-cyan-400" />,
      label: '인사/급여관리',
      description: '영림원형 인사·근태·급여 (발령·계산·명세)',
    },
    {
      href: '/dashboard/hr/employee-register',
      icon: <UserSquare className="w-5 h-5 text-cyan-400" />,
      label: '사원등록',
      description: '사원 인사카드·계정 연결·계약서/보건증/통장 AI 반영',
    },
    {
      href: '/dashboard/settings/departments',
      icon: <Building2 className="w-5 h-5 text-indigo-400" />,
      label: '부서 관리',
      description: '매장 부서 추가·수정·삭제',
    },
  ] : [];

  const handleFixNetSales = async (dryRun = false) => {
    if (!currentStore?.storeId) return;
    setFixingNet(true);
    setFixNetResult(null);
    setFixNetError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/fix-netsales', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId: currentStore.storeId, dryRun }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '재계산 실패');
      setFixNetResult(data);
    } catch (e: any) {
      setFixNetError(e.message || '오류 발생');
    } finally {
      setFixingNet(false);
    }
  };

  const handlePosBreakdownMigrate = async () => {
    if (!currentStore?.storeId) return;
    setPosBreakdownMigrating(true);
    setPosBreakdownResult(null);
    setPosBreakdownError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/migrate-pos-breakdown', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId: currentStore.storeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '보강 실패');
      setPosBreakdownResult({ updated: data.updated, skipped: data.skipped, total: data.total, message: data.message });
    } catch (e: any) {
      setPosBreakdownError(e.message || '오류 발생');
    } finally {
      setPosBreakdownMigrating(false);
    }
  };

  const handleRecalcNetSales = async () => {
    if (!currentStore?.storeId) return;
    setRecalcing(true);
    setRecalcResult(null);
    setRecalcError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/recalc-netsales', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId: currentStore.storeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '재계산 실패');
      setRecalcResult({ fixed: data.fixed, total: data.total, message: data.message });
    } catch (e: any) {
      setRecalcError(e.message || '오류 발생');
    } finally {
      setRecalcing(false);
    }
  };

  const handleBackfill = async () => {
    if (!currentStore?.storeId) return;
    setBackfilling(true);
    setBackfillResult(null);
    setBackfillError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/backfill-weather-news', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId: currentStore.storeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '백필 실패');
      setBackfillResult({ updated: data.updated, failed: data.failed, message: data.message });
    } catch (e: any) {
      setBackfillError(e.message || '오류 발생');
    } finally {
      setBackfilling(false);
    }
  };

  const handleMigrate = async () => {
    if (!currentStore?.storeId) return;
    setMigrating(true);
    setMigrateResult(null);
    setMigrateError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/migrate-pos-to-reports', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId: currentStore.storeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '마이그레이션 실패');
      setMigrateResult({ migrated: data.migrated, skipped: data.skipped, message: data.message });
    } catch (e: any) {
      setMigrateError(e.message || '오류 발생');
    } finally {
      setMigrating(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-teal-400">설정</h1>
        <p className="text-slate-400 text-sm mt-1">
          Pitaya OS 운영 환경을 설정합니다.
        </p>
      </div>

      {!accessLoaded || !storesLoaded ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-teal-400 animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          {visibleMenus.length === 0 && adminOnlyMenus.length === 0 && superuserMenus.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-8">접근 가능한 설정 항목이 없습니다.</p>
          ) : (
            [...personalMenus, ...superuserMenus, ...visibleMenus, ...hrMenus, ...adminOnlyMenus].map((menu) => (
              <Link
                key={menu.href}
                href={menu.href}
                className="flex items-center justify-between bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-teal-500/50 rounded-xl p-5 transition-all group"
              >
                <div className="flex items-center gap-4">
                  <div className="bg-slate-800 group-hover:bg-slate-700 p-3 rounded-xl transition-colors">
                    {menu.icon}
                  </div>
                  <div>
                    <p className="text-white font-bold">{menu.label}</p>
                    <p className="text-slate-400 text-sm">{menu.description}</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-teal-400 transition-colors" />
              </Link>
            ))
          )}

          {/* 데이터 관리 섹션 — master/admin만 표시 */}
          {isMasterOrAdmin && (
            <div className="mt-6 pt-6 border-t border-slate-800">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">데이터 관리</p>
              <div className="space-y-3">
                {/* POS 데이터 마이그레이션 */}
                <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
                  <div className="flex items-start gap-4">
                    <div className="bg-slate-800 p-3 rounded-xl flex-shrink-0">
                      <Database className="w-5 h-5 text-orange-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-bold">포스 데이터 매출 조회 반영</p>
                      <p className="text-slate-400 text-sm mt-0.5">
                        기존 POS 동기화 데이터를 매출 보고서 조회 화면에 반영합니다.
                        수동 입력 데이터가 있는 날짜는 건너뜁니다.
                      </p>

                      {migrateResult && (
                        <div className="mt-3 p-3 bg-teal-900/30 border border-teal-500/30 rounded-lg text-sm text-teal-300">
                          ✅ {migrateResult.message}
                          <span className="ml-2 text-slate-400 text-xs">
                            (반영 {migrateResult.migrated}건 / 스킵 {migrateResult.skipped}건)
                          </span>
                        </div>
                      )}
                      {migrateError && (
                        <div className="mt-3 p-3 bg-red-900/30 border border-red-500/30 rounded-lg text-sm text-red-300">
                          ❌ {migrateError}
                        </div>
                      )}

                      <button
                        onClick={handleMigrate}
                        disabled={migrating}
                        className="mt-3 flex items-center gap-2 px-4 py-2 bg-orange-700/40 hover:bg-orange-700/60 border border-orange-500/30 text-orange-300 text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
                      >
                        {migrating
                          ? <><Loader2 className="w-4 h-4 animate-spin" /> 처리 중...</>
                          : <><Database className="w-4 h-4" /> 지금 반영하기 (1회성)</>
                        }
                      </button>
                    </div>
                  </div>
                </div>

                {/* 순매출 재계산 — master/superuser만 */}
                {isMasterOrSuperuser && (
                  <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
                    <div className="flex items-start gap-4">
                      <div className="bg-slate-800 p-3 rounded-xl flex-shrink-0">
                        <TrendingUp className="w-5 h-5 text-emerald-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-bold">순매출 데이터 재계산</p>
                        <p className="text-slate-400 text-sm mt-0.5">
                          순매출이 총매출의 50% 미만인 이상 데이터를 POS 원본 기준으로 재계산합니다.
                          먼저 미리보기로 대상을 확인하세요.
                        </p>

                        {fixNetResult && (
                          <div className="mt-3 p-3 bg-emerald-900/30 border border-emerald-500/30 rounded-lg text-sm text-emerald-300">
                            ✅ {fixNetResult.message}
                            <span className="ml-2 text-slate-400 text-xs">
                              (대상 {fixNetResult.candidates}건{fixNetResult.fixed > 0 ? ` / 수정 ${fixNetResult.fixed}건` : ''})
                            </span>
                            {fixNetResult.details?.length > 0 && (
                              <div className="mt-2 space-y-0.5 max-h-32 overflow-y-auto">
                                {fixNetResult.details.map((d, i) => (
                                  <p key={i} className="text-[11px] text-slate-400 font-mono">
                                    {d.reportDate}: {d.oldNetSales.toLocaleString()} → {d.newNetSales.toLocaleString()}원 ({d.source})
                                  </p>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        {fixNetError && (
                          <div className="mt-3 p-3 bg-red-900/30 border border-red-500/30 rounded-lg text-sm text-red-300">
                            ❌ {fixNetError}
                          </div>
                        )}

                        <div className="mt-3 flex items-center gap-2">
                          <button
                            onClick={() => handleFixNetSales(true)}
                            disabled={fixingNet}
                            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-300 text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
                          >
                            {fixingNet
                              ? <><Loader2 className="w-4 h-4 animate-spin" /> 처리 중...</>
                              : '미리보기'
                            }
                          </button>
                          <button
                            onClick={() => handleFixNetSales(false)}
                            disabled={fixingNet}
                            className="flex items-center gap-2 px-4 py-2 bg-emerald-700/40 hover:bg-emerald-700/60 border border-emerald-500/30 text-emerald-300 text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
                          >
                            {fixingNet
                              ? <><Loader2 className="w-4 h-4 animate-spin" /> 처리 중...</>
                              : <><TrendingUp className="w-4 h-4" /> 재계산 실행</>
                            }
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 순매출 전체 재계산 (다중POS SUM) — master/superuser만 */}
                {isMasterOrSuperuser && (
                  <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
                    <div className="flex items-start gap-4">
                      <div className="bg-slate-800 p-3 rounded-xl flex-shrink-0">
                        <TrendingUp className="w-5 h-5 text-teal-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-bold">순매출 재계산 (다중POS 합산)</p>
                        <p className="text-slate-400 text-sm mt-0.5">
                          POS 브릿지 보고서 전체를 Finish_Total SUM 기준으로 순매출·반품금액을 재계산합니다.
                          다중 POS 환경에서 단일 POS 데이터만 반영된 경우 실행하세요.
                        </p>

                        {recalcResult && (
                          <div className="mt-3 p-3 bg-teal-900/30 border border-teal-500/30 rounded-lg text-sm text-teal-300">
                            ✅ {recalcResult.message}
                            <span className="ml-2 text-slate-400 text-xs">
                              (전체 {recalcResult.total}건 / 수정 {recalcResult.fixed}건)
                            </span>
                          </div>
                        )}
                        {recalcError && (
                          <div className="mt-3 p-3 bg-red-900/30 border border-red-500/30 rounded-lg text-sm text-red-300">
                            ❌ {recalcError}
                          </div>
                        )}

                        <button
                          onClick={handleRecalcNetSales}
                          disabled={recalcing}
                          className="mt-3 flex items-center gap-2 px-4 py-2 bg-teal-700/40 hover:bg-teal-700/60 border border-teal-500/30 text-teal-300 text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
                        >
                          {recalcing
                            ? <><Loader2 className="w-4 h-4 animate-spin" /> 처리 중...</>
                            : <><TrendingUp className="w-4 h-4" /> 순매출 재계산 실행</>
                          }
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* POS별 내역 보강 — master/superuser만 */}
                {isMasterOrSuperuser && (
                  <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
                    <div className="flex items-start gap-4">
                      <div className="bg-slate-800 p-3 rounded-xl flex-shrink-0">
                        <Database className="w-5 h-5 text-violet-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-bold">POS별 매출 내역 보강</p>
                        <p className="text-slate-400 text-sm mt-0.5">
                          일마감 내역에 POS 1~N 개별 매출이 표시되도록 기존 데이터를 보강합니다.
                          보강 전 포스PC에서 <code className="bg-slate-800 px-1 rounded text-violet-300 text-xs">node bridge.js migrate 날짜범위</code>를
                          먼저 실행하세요.
                        </p>

                        {posBreakdownResult && (
                          <div className="mt-3 p-3 bg-violet-900/30 border border-violet-500/30 rounded-lg text-sm text-violet-300">
                            ✅ {posBreakdownResult.message}
                            <span className="ml-2 text-slate-400 text-xs">
                              (전체 {posBreakdownResult.total}건 / 보강 {posBreakdownResult.updated}건 / 데이터없음 {posBreakdownResult.skipped}건)
                            </span>
                          </div>
                        )}
                        {posBreakdownError && (
                          <div className="mt-3 p-3 bg-red-900/30 border border-red-500/30 rounded-lg text-sm text-red-300">
                            ❌ {posBreakdownError}
                          </div>
                        )}

                        <button
                          onClick={handlePosBreakdownMigrate}
                          disabled={posBreakdownMigrating}
                          className="mt-3 flex items-center gap-2 px-4 py-2 bg-violet-700/40 hover:bg-violet-700/60 border border-violet-500/30 text-violet-300 text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
                        >
                          {posBreakdownMigrating
                            ? <><Loader2 className="w-4 h-4 animate-spin" /> 처리 중...</>
                            : <><Database className="w-4 h-4" /> POS별 내역 보강 실행</>
                          }
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* 품목 초기 데이터 — master/superuser만 */}
                {isMasterOrSuperuser && (
                  <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
                    <div className="flex items-start gap-4">
                      <div className="bg-slate-800 p-3 rounded-xl flex-shrink-0">
                        <Tag className="w-5 h-5 text-teal-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-bold">품목 초기 데이터 로드</p>
                        <p className="text-slate-400 text-sm mt-0.5">
                          한돈 38 · 수입육 41 · 계육및기타 34 · 한우 74 = 총 187개 기본 품목을
                          Firestore에 저장합니다. 기존에 같은 구분+부위+등급이 있으면 스킵됩니다.
                        </p>

                        {initItemsResult && (
                          <div className="mt-3 p-3 bg-teal-900/30 border border-teal-500/30 rounded-lg text-sm text-teal-300">
                            ✅ 저장 완료: {initItemsResult.saved}개 저장 / {initItemsResult.skipped}개 스킵 (총 {initItemsResult.total}개)
                          </div>
                        )}
                        {initItemsError && (
                          <div className="mt-3 p-3 bg-red-900/30 border border-red-500/30 rounded-lg text-sm text-red-300">
                            ❌ {initItemsError}
                          </div>
                        )}

                        <div className="mt-3 flex items-center gap-2">
                          <button
                            onClick={async () => {
                              if (!currentStore?.storeId) return;
                              setInitingItems(true); setInitItemsResult(null); setInitItemsError(null);
                              try {
                                const headers = await getAuthJsonHeaders();
                                const res = await fetch('/api/admin/init-items', {
                                  method: 'POST', headers,
                                  body: JSON.stringify({ storeId: currentStore.storeId, mode: 'skip' }),
                                });
                                const data = await res.json();
                                if (!res.ok) throw new Error(data.error || '실패');
                                setInitItemsResult(data);
                              } catch (e: any) { setInitItemsError(e.message); }
                              finally { setInitingItems(false); }
                            }}
                            disabled={initingItems}
                            className="flex items-center gap-2 px-4 py-2 bg-teal-700/40 hover:bg-teal-700/60 border border-teal-500/30 text-teal-300 text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
                          >
                            {initingItems ? <><Loader2 className="w-4 h-4 animate-spin" /> 처리 중...</> : <><Tag className="w-4 h-4" /> 초기 데이터 로드 (스킵 모드)</>}
                          </button>
                          <button
                            onClick={async () => {
                              if (!currentStore?.storeId || !confirm('기존 품목을 전부 삭제하고 초기화합니까?')) return;
                              setInitingItems(true); setInitItemsResult(null); setInitItemsError(null);
                              try {
                                const headers = await getAuthJsonHeaders();
                                const res = await fetch('/api/admin/init-items', {
                                  method: 'POST', headers,
                                  body: JSON.stringify({ storeId: currentStore.storeId, mode: 'reset' }),
                                });
                                const data = await res.json();
                                if (!res.ok) throw new Error(data.error || '실패');
                                setInitItemsResult(data);
                              } catch (e: any) { setInitItemsError(e.message); }
                              finally { setInitingItems(false); }
                            }}
                            disabled={initingItems}
                            className="flex items-center gap-2 px-4 py-2 bg-red-700/30 hover:bg-red-700/50 border border-red-500/30 text-red-300 text-sm rounded-lg transition-colors disabled:opacity-50"
                          >
                            전체 초기화
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 날씨/뉴스 백필 — master/superuser만 */}
                {isMasterOrSuperuser && (
                  <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
                    <div className="flex items-start gap-4">
                      <div className="bg-slate-800 p-3 rounded-xl flex-shrink-0">
                        <CloudSun className="w-5 h-5 text-sky-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-bold">날씨/뉴스 데이터 채우기</p>
                        <p className="text-slate-400 text-sm mt-0.5">
                          POS 보고서 중 날씨·뉴스 정보가 없는 항목을 채웁니다.
                          네이버 뉴스 API 키가 등록된 경우 뉴스도 함께 저장됩니다.
                        </p>

                        {backfillResult && (
                          <div className="mt-3 p-3 bg-teal-900/30 border border-teal-500/30 rounded-lg text-sm text-teal-300">
                            ✅ {backfillResult.message}
                            <span className="ml-2 text-slate-400 text-xs">
                              (업데이트 {backfillResult.updated}건 / 실패 {backfillResult.failed}건)
                            </span>
                          </div>
                        )}
                        {backfillError && (
                          <div className="mt-3 p-3 bg-red-900/30 border border-red-500/30 rounded-lg text-sm text-red-300">
                            ❌ {backfillError}
                          </div>
                        )}

                        <button
                          onClick={handleBackfill}
                          disabled={backfilling}
                          className="mt-3 flex items-center gap-2 px-4 py-2 bg-sky-700/40 hover:bg-sky-700/60 border border-sky-500/30 text-sky-300 text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
                        >
                          {backfilling
                            ? <><Loader2 className="w-4 h-4 animate-spin" /> 처리 중...</>
                            : <><CloudSun className="w-4 h-4" /> 날씨/뉴스 채우기</>
                          }
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
