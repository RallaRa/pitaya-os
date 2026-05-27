'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Store, Shield, Users, ChevronRight, Layers, UserCog, Loader2, LayoutGrid, SlidersHorizontal, Database, CloudSun, TrendingUp } from 'lucide-react';
import { getAuthHeaders } from '@/lib/getAuthHeaders';
import { useAuth } from '@/context/AuthContext';
import { useStore } from '@/context/StoreContext';

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

  const [migrating, setMigrating]   = useState(false);
  const [migrateResult, setMigrateResult] = useState<{ migrated: number; skipped: number; message: string } | null>(null);
  const [migrateError, setMigrateError]   = useState<string | null>(null);

  const [backfilling, setBackfilling]     = useState(false);
  const [backfillResult, setBackfillResult] = useState<{ updated: number; failed: number; message: string } | null>(null);
  const [backfillError, setBackfillError]   = useState<string | null>(null);

  const [fixingNet, setFixingNet]       = useState(false);
  const [fixNetResult, setFixNetResult] = useState<{ fixed: number; candidates: number; message: string; details: { reportDate: string; oldNetSales: number; newNetSales: number; source: string }[] } | null>(null);
  const [fixNetError, setFixNetError]   = useState<string | null>(null);

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

  const adminOnlyMenus = [
    {
      href: '/dashboard/settings/widgets',
      icon: <LayoutGrid className="w-5 h-5 text-teal-400" />,
      label: '대시보드 위젯 권한',
      description: '역할별 위젯 표시 여부 설정',
      show: ['master', 'superuser', 'admin', 'owner'].includes(currentStore?.role || ''),
    },
    {
      href: '/dashboard/settings/prediction-variables',
      icon: <SlidersHorizontal className="w-5 h-5 text-orange-400" />,
      label: 'AI 예측 변수 설정',
      description: '날씨·요일·이벤트가 매출에 미치는 영향 변수 관리',
      show: ['master', 'superuser', 'admin', 'owner'].includes(currentStore?.role || ''),
    },
  ].filter(m => m.show);

  const visibleMenus = menuAccess
    ? allMenus.filter(m => menuAccess[m.key])
    : [];

  const isMasterOrAdmin = ['master', 'superuser', 'admin'].includes(currentStore?.role || '');
  const isMasterOrSuperuser = ['master', 'superuser'].includes(currentStore?.role || '');

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
          {visibleMenus.length === 0 && adminOnlyMenus.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-8">접근 가능한 설정 항목이 없습니다.</p>
          ) : (
            [...visibleMenus, ...adminOnlyMenus].map((menu) => (
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
