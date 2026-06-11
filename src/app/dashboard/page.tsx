'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import type { LayoutItem } from 'react-grid-layout';

const ResponsiveGridLayout = dynamic(
  () => import('react-grid-layout').then(m => ({ default: m.ResponsiveGridLayout })),
  { ssr: false }
);

const AiInsightWidget = dynamic(
  () => import('@/components/widgets/AiInsightWidget'),
  { ssr: false, loading: () => <SkeletonWidget /> },
);
const SalesPredictionWidget = dynamic(
  () => import('@/components/widgets/SalesPredictionWidget'),
  { ssr: false, loading: () => <SkeletonWidget /> },
);
const TotalPartnerWidget = dynamic(
  () => import('@/components/widgets/TotalPartnerWidget'),
  { ssr: false, loading: () => <SkeletonWidget /> },
);
const WeeklyAnalysisWidget = dynamic(
  () => import('@/components/widgets/WeeklyAnalysisWidget'),
  { ssr: false, loading: () => <SkeletonWidget /> },
);

/** 모바일·태블릿·가로폰 — 그리드 대신 세로 스택 (Chrome Android/iOS 겹침 방지) */
const DASHBOARD_STACK_BREAKPOINT = 1024;
import { Plus, LayoutGrid, Lock, RotateCcw, Crown, Maximize2, Printer } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useStore } from '@/context/StoreContext';
import NewsWidget           from '@/components/widgets/NewsWidget';
import WeatherWidget        from '@/components/widgets/WeatherWidget';
import YesterdayWidget      from '@/components/widgets/YesterdayWidget';
import QuickMenuWidget      from '@/components/widgets/QuickMenuWidget';
import TodaySalesWidget       from '@/components/widgets/TodaySalesWidget';
import SalesCompareWidget     from '@/components/widgets/SalesCompareWidget';
import CustomerVisitWidget    from '@/components/widgets/CustomerVisitWidget';
import CostRatioWidget        from '@/components/widgets/CostRatioWidget';
import SalesCategoryWidget    from '@/components/widgets/SalesCategoryWidget';
import TimeSlotAovWidget      from '@/components/widgets/TimeSlotAovWidget';
import SalesHeatmapWidget     from '@/components/widgets/SalesHeatmapWidget';
import DowProfitabilityWidget from '@/components/widgets/DowProfitabilityWidget';
import DailyBriefingBar       from '@/components/dashboard/DailyBriefingBar';
import { useDashboardChrome } from '@/components/dashboard/DashboardChromeContext';
import { fetchDashboardPrintSnapshot, openDashboardPrintWindow } from '@/lib/dashboardPrintData';
import LazyWidgetMount from '@/components/dashboard/LazyWidgetMount';
import { SkeletonWidget } from '@/components/suspense';
import { getAuthHeaders, getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import {
  WIDGET_META,
  DEFAULT_ACTIVE,
  DASHBOARD_LAYOUT_VERSION,
  sortWidgetsForDisplay,
  makeDefaultLayout,
  resolveDashboardLayout,
  mergeLayoutChange,
  compactDashboardLayout,
  buildStackedLayout,
  type WidgetMeta,
} from '@/lib/dashboardLayout';
import DashboardGridItem from '@/components/dashboard/DashboardGridItem';
import { isSuperuserEmail } from '@/lib/auth/permissions';
import { useLicense } from '@/hooks/useLicense';
import { db } from '@/lib/firebase/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { verticalCompactor } from 'react-grid-layout';

type GridLayout = readonly LayoutItem[];
type ResponsiveLayouts = Partial<Record<string, GridLayout>>;

function ensureRequiredWidgets(widgets: string[]): string[] {
  let next = [...widgets];
  for (const id of ['ai_insight', 'total_partner', 'customer_visit'] as const) {
    if (!next.includes(id)) next = [...next, id];
  }
  return next;
}

function applyResolvedLayout(
  widgets: string[],
  savedLayout: LayoutItem[] | null | undefined,
  layoutVersion?: number,
) {
  const normalizedWidgets = ensureRequiredWidgets(widgets);
  const { layout, repaired } = resolveDashboardLayout(normalizedWidgets, savedLayout, layoutVersion);
  return { widgets: normalizedWidgets, layout, repaired };
}

/* ── 위젯 추가 모달 ── */
function WidgetAddModal({
  availableWidgets, onAdd, onClose,
}: {
  availableWidgets: WidgetMeta[];
  onAdd: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <h3 className="text-slate-200 font-semibold text-sm">위젯 추가</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-xl leading-none">&times;</button>
        </div>
        <div className="p-3 space-y-1.5">
          {availableWidgets.length === 0 ? (
            <p className="text-slate-600 text-sm text-center py-6">추가할 수 있는 위젯이 없습니다</p>
          ) : availableWidgets.map(w => (
            <button
              key={w.id}
              onClick={() => { onAdd(w.id); onClose(); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 bg-slate-800/50 hover:bg-slate-700 rounded-xl transition-colors text-left"
            >
              <LayoutGrid className="w-4 h-4 text-teal-400 shrink-0" />
              <div>
                <p className="text-slate-200 text-sm font-medium">{w.title}</p>
                <p className="text-slate-500 text-xs">{w.defaultItem.w}×{w.defaultItem.h} 기본 크기</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════ 메인 ══════════════════════════════ */
export default function DashboardPage() {
  const { user }         = useAuth();
  const { currentStore } = useStore();
  const { hasModule, loading: licenseLoading } = useLicense();

  const uid     = user?.uid || '';
  const storeId = currentStore?.storeId || '';
  const isSuperuser = isSuperuserEmail(user?.email);
  const chrome = useDashboardChrome();

  const [editMode,      setEditMode]      = useState(false);
  const [activeWidgets, setActiveWidgets] = useState<string[]>(DEFAULT_ACTIVE);
  const [layouts,       setLayouts]       = useState<ResponsiveLayouts>({ lg: makeDefaultLayout(DEFAULT_ACTIVE) });
  const [widgetPerms,   setWidgetPerms]   = useState<Record<string, Record<string, boolean>>>({});
  const [userRole,      setUserRole]      = useState('user');
  const [showAddModal,  setShowAddModal]  = useState(false);
  const [isMobile,      setIsMobile]      = useState(
    () => (typeof window !== 'undefined' ? window.innerWidth < DASHBOARD_STACK_BREAKPOINT : false),
  );
  const [layoutLoaded,  setLayoutLoaded]  = useState(false);
  const [containerW,    setContainerW]    = useState(1280);

  const containerRef = useRef<HTMLDivElement>(null);
  const saveTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* 모바일 감지 + 컨테이너 너비 */
  useEffect(() => {
    const update = () => {
      setIsMobile(window.innerWidth < DASHBOARD_STACK_BREAKPOINT);
      if (containerRef.current) setContainerW(containerRef.current.offsetWidth);
    };
    update();
    const ro = new ResizeObserver(update);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  /* 대시보드 초기 데이터 (권한·위젯권한·레이아웃) */
  useEffect(() => {
    if (!uid) return;
    const params = new URLSearchParams({ uid });
    if (storeId) params.set('storeId', storeId);
    getAuthHeaders()
      .then(headers => fetch(`/api/dashboard/bootstrap?${params}`, { headers }))
      .then(r => r.json())
      .then(d => {
        if (d.myAccess?.role) setUserRole(d.myAccess.role);
        setWidgetPerms(d.widgetPermissions?.widgets || {});
        const layoutData = d.layout;
        if (layoutData?.layout && layoutData?.activeWidgets) {
          const { widgets, layout, repaired } = applyResolvedLayout(
            layoutData.activeWidgets,
            layoutData.layout as LayoutItem[],
            layoutData.layoutVersion,
          );
          setLayouts({ lg: layout as GridLayout });
          setActiveWidgets(widgets);
          if (repaired) {
            getAuthJsonHeaders().then(headers =>
              fetch('/api/dashboard/layout', {
                method: 'PUT',
                headers,
                body: JSON.stringify({
                  uid,
                  layout,
                  activeWidgets: widgets,
                  storeId: storeId || undefined,
                  layoutVersion: DASHBOARD_LAYOUT_VERSION,
                }),
              }),
            ).catch(() => {});
          }
        }
        setLayoutLoaded(true);
      })
      .catch(() => setLayoutLoaded(true));
  }, [uid, storeId, user?.email]);

  /* 마스터 레이아웃 실시간 동기화 (슈퍼유저 변경 시 모든 유저 반영) */
  useEffect(() => {
    if (!storeId || !layoutLoaded) return;
    const unsubscribe = onSnapshot(
      doc(db, 'dashboard_layouts', `${storeId}_master`),
      snap => {
        if (!snap.exists()) return;
        const data = snap.data();
        if (data?.layout && data?.activeWidgets) {
          const { widgets, layout } = applyResolvedLayout(
            data.activeWidgets,
            data.layout as LayoutItem[],
            data.layoutVersion,
          );
          setLayouts({ lg: layout as GridLayout });
          setActiveWidgets(widgets);
        }
      },
      () => { /* 권한 없거나 문서 없으면 무시 */ },
    );
    return () => unsubscribe();
  }, [storeId, layoutLoaded]);

  /* 레이아웃 저장 (디바운스 1s, 슈퍼유저는 마스터로 저장) */
  const persistLayout = useCallback((layout: GridLayout, widgets: string[]) => {
    if (!uid || !layoutLoaded) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      getAuthJsonHeaders().then(headers =>
        fetch('/api/dashboard/layout', {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            uid,
            layout: [...layout],
            activeWidgets: widgets,
            storeId: storeId || undefined,
            layoutVersion: DASHBOARD_LAYOUT_VERSION,
          }),
        }),
      ).catch(() => {});
    }, 1000);
  }, [uid, layoutLoaded, storeId]);

  /* 권한에 따라 표시 가능한 위젯 */
  const allowedIds = WIDGET_META.filter(m => {
    const perms   = widgetPerms[m.permKey];
    if (!perms) return true;
    const roleKey = ['master', 'superuser'].includes(userRole) ? 'master' : userRole;
    return perms[roleKey] !== false;
  }).map(m => m.id);

  const visibleActive = sortWidgetsForDisplay(
    activeWidgets.filter(id => allowedIds.includes(id)),
  );

  /* 현재 레이아웃 아이템들 (표시 중인 위젯만) */
  const currentLayout = (layouts.lg || []).filter((item: LayoutItem) => visibleActive.includes(item.i));

  const narrowGridLayout: GridLayout = containerW < DASHBOARD_STACK_BREAKPOINT
    ? buildStackedLayout(visibleActive, currentLayout)
    : currentLayout;

  /* onLayoutChange 핸들러 */
  const onLayoutChange = useCallback((newLayout: GridLayout) => {
    const merged = mergeLayoutChange(visibleActive, [...newLayout]);
    const compacted = compactDashboardLayout(visibleActive, merged) as GridLayout;
    const next = { ...layouts, lg: compacted };
    setLayouts(next);
    persistLayout(compacted, activeWidgets);
  }, [visibleActive, layouts, activeWidgets, persistLayout]);

  /* 위젯 추가 */
  const addWidget = (id: string) => {
    if (activeWidgets.includes(id)) return;
    const meta = WIDGET_META.find(m => m.id === id);
    if (!meta) return;
    const newActive = [...activeWidgets, id];
    const { layout: newLayout } = resolveDashboardLayout(newActive, [...(layouts.lg || []), { ...meta.defaultItem }]);
    setLayouts({ lg: newLayout as GridLayout });
    setActiveWidgets(newActive);
    persistLayout(newLayout as GridLayout, newActive);
  };

  /* 위젯 제거 */
  const removeWidget = (id: string) => {
    const newActive = activeWidgets.filter(w => w !== id);
    const newLayout = (layouts.lg || []).filter((l: LayoutItem) => l.i !== id);
    setActiveWidgets(newActive);
    setLayouts({ lg: newLayout as GridLayout });
    persistLayout(newLayout as GridLayout, newActive);
  };

  /* 레이아웃 초기화 */
  const resetLayout = () => {
    const newActive = DEFAULT_ACTIVE.filter(id => allowedIds.includes(id));
    const newLayout = makeDefaultLayout(newActive);
    setLayouts({ lg: newLayout });
    setActiveWidgets(newActive);
    persistLayout(newLayout, newActive);
  };

  /* 추가 가능한 위젯 */
  const addableWidgets = WIDGET_META.filter(
    m => allowedIds.includes(m.id) && !visibleActive.includes(m.id)
  );

  const LAZY_WIDGET_IDS = new Set(['ai_insight', 'sales_prediction', 'total_partner', 'weekly_analysis']);

  const wrapLazyWidget = (id: string, node: React.ReactNode) =>
    LAZY_WIDGET_IDS.has(id) ? <LazyWidgetMount>{node}</LazyWidgetMount> : node;

  /* 위젯 렌더 */
  const renderWidget = (id: string) => {
    switch (id) {
      case 'news':               return wrapLazyWidget(id, <NewsWidget           editMode={editMode} onRemove={() => removeWidget(id)} />);
      case 'weather':            return wrapLazyWidget(id, <WeatherWidget        editMode={editMode} onRemove={() => removeWidget(id)} storeId={storeId} />);
      case 'weekly_analysis':    return wrapLazyWidget(id, <WeeklyAnalysisWidget editMode={editMode} onRemove={() => removeWidget(id)} storeId={storeId} />);
      case 'yesterday_analysis': return wrapLazyWidget(id, <YesterdayWidget      editMode={editMode} onRemove={() => removeWidget(id)} storeId={storeId} />);
      case 'quick_menu':         return wrapLazyWidget(id, <QuickMenuWidget      editMode={editMode} onRemove={() => removeWidget(id)} />);
      case 'ai_insight':         return wrapLazyWidget(id, <AiInsightWidget        editMode={editMode} onRemove={() => removeWidget(id)} storeId={storeId} mobileLayout={isMobile} />);
      case 'sales_prediction':   return wrapLazyWidget(id, <SalesPredictionWidget  editMode={editMode} onRemove={() => removeWidget(id)} storeId={storeId} mobileLayout={isMobile} />);
      case 'total_partner':      return wrapLazyWidget(id, <TotalPartnerWidget     editMode={editMode} onRemove={() => removeWidget(id)} storeId={storeId} mobileLayout={isMobile} />);
      case 'today_sales':        return wrapLazyWidget(id, <TodaySalesWidget       editMode={editMode} onRemove={() => removeWidget(id)} storeId={storeId} />);
      case 'sales_compare':      return wrapLazyWidget(id, <SalesCompareWidget     editMode={editMode} onRemove={() => removeWidget(id)} storeId={storeId} />);
      case 'customer_visit':     return wrapLazyWidget(id, <CustomerVisitWidget    editMode={editMode} onRemove={() => removeWidget(id)} storeId={storeId} />);
      case 'sales_heatmap':      return wrapLazyWidget(id, <SalesHeatmapWidget     editMode={editMode} onRemove={() => removeWidget(id)} storeId={storeId} />);
      case 'dow_profitability':  return wrapLazyWidget(id, <DowProfitabilityWidget editMode={editMode} onRemove={() => removeWidget(id)} storeId={storeId} />);
      case 'cost_ratio':         return wrapLazyWidget(id, <CostRatioWidget        editMode={editMode} onRemove={() => removeWidget(id)} storeId={storeId} />);
      case 'sales_category':     return wrapLazyWidget(id, <SalesCategoryWidget    editMode={editMode} onRemove={() => removeWidget(id)} storeId={storeId} />);
      case 'time_slot_aov':      return wrapLazyWidget(id, <TimeSlotAovWidget      editMode={editMode} onRemove={() => removeWidget(id)} storeId={storeId} />);
      default:                   return null;
    }
  };

  /* 모듈 라이선스 */
  if (!licenseLoading && !isSuperuser && !hasModule('dashboard')) {
    return (
      <div className="flex items-center justify-center min-h-full bg-slate-950 p-6">
        <div className="text-center max-w-sm">
          <p className="text-slate-400 font-medium">대시보드 모듈이 활성화되지 않았습니다</p>
          <p className="text-sm text-slate-600 mt-2">관리자에게 문의하세요</p>
        </div>
      </div>
    );
  }

  const handlePrintDashboard = async () => {
    if (!storeId) return;
    const snapshot = await fetchDashboardPrintSnapshot(
      storeId,
      currentStore?.storeName || '매장',
      visibleActive,
    );
    openDashboardPrintWindow(snapshot);
  };

  /* 모바일·태블릿 세로 스택 (그리드 겹침 없음) */
  if (isMobile) {
    return (
      <div className="dashboard-mobile-stack flex flex-col min-h-full bg-slate-950 p-3 pb-8 gap-4 w-full max-w-full overflow-x-hidden box-border touch-pan-y [-webkit-overflow-scrolling:touch]">
        <div className="flex items-center gap-2 px-1 shrink-0">
          <h1 className="text-slate-300 font-semibold text-sm flex-1">대시보드</h1>
          <button onClick={handlePrintDashboard} className="p-1.5 text-slate-500 hover:text-teal-400" title="PDF/인쇄"><Printer className="w-4 h-4" /></button>
        </div>
        <DailyBriefingBar storeId={storeId} />
        {visibleActive.map(id => (
          <section
            key={id}
            className="dashboard-mobile-widget w-full max-w-full shrink-0 relative isolate z-0 overflow-x-hidden box-border"
          >
            {renderWidget(id)}
          </section>
        ))}
      </div>
    );
  }

  /* 데스크탑 그리드 */
  return (
    <div className="flex flex-col h-full min-h-0 bg-slate-950">
      {/* 슈퍼유저 편집 모드 배너 */}
      {editMode && isSuperuser && (
        <div className="flex items-center gap-2 px-6 py-2 bg-purple-900/40 border-b border-purple-700/40 shrink-0">
          <Crown className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
          <p className="text-purple-200 text-xs flex-1">레이아웃 편집 모드 — 변경사항이 모든 유저에게 적용됩니다</p>
        </div>
      )}

      {/* 툴바 */}
      <DailyBriefingBar storeId={storeId} />
      <div className="flex items-center gap-2 px-6 py-3 border-b border-slate-800/60 shrink-0 flex-wrap">
        <h1 className="text-slate-400 text-xs font-semibold uppercase tracking-widest flex-1">대시보드</h1>

        <button
          onClick={() => chrome?.toggleDashboardFullscreen()}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg text-xs transition-colors"
          title="대시보드 전체화면"
        >
          <Maximize2 className="w-3.5 h-3.5" /> 전체화면
        </button>
        <button
          onClick={handlePrintDashboard}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg text-xs transition-colors"
        >
          <Printer className="w-3.5 h-3.5" /> PDF/인쇄
        </button>

        {editMode && isSuperuser && (
          <>
            <button
              onClick={() => setShowAddModal(true)}
              disabled={addableWidgets.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600/20 hover:bg-teal-600/30 border border-teal-500/30 text-teal-300 rounded-lg text-xs disabled:opacity-40 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> 위젯 추가
            </button>
            <button
              onClick={resetLayout}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg text-xs transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" /> 초기화
            </button>
          </>
        )}

        {isSuperuser && (
          <button
            onClick={() => setEditMode(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${
              editMode
                ? 'bg-purple-600 text-white font-semibold'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-400'
            }`}
          >
            {editMode
              ? <><Lock className="w-3.5 h-3.5" /> 편집 완료</>
              : <><LayoutGrid className="w-3.5 h-3.5" /> 편집 모드</>
            }
          </button>
        )}
      </div>

      {/* 그리드 영역 */}
      <div ref={containerRef} className="flex-1 min-h-0 overflow-y-auto p-4">
        {!layoutLoaded ? (
          /* 스켈레톤 */
          <div className="grid grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-48 bg-slate-800/40 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : visibleActive.length === 0 ? (
          /* 빈 상태 */
          <div className="flex flex-col items-center justify-center h-64 text-slate-600 gap-3">
            <LayoutGrid className="w-10 h-10 opacity-30" />
            <p className="text-sm">위젯이 없습니다</p>
            <button
              onClick={() => { setEditMode(true); setShowAddModal(true); }}
              className="flex items-center gap-1.5 px-4 py-2 bg-teal-600/20 border border-teal-500/30 text-teal-300 rounded-lg text-sm"
            >
              <Plus className="w-4 h-4" /> 위젯 추가
            </button>
          </div>
        ) : (
          <ResponsiveGridLayout
            className="dashboard-grid"
            width={containerW}
            layouts={{ lg: narrowGridLayout, md: narrowGridLayout, sm: narrowGridLayout }}
            breakpoints={{ lg: 1200, md: 996, sm: 768 }}
            cols={{ lg: 12, md: 12, sm: 12 }}
            rowHeight={80}
            margin={[16, 16]}
            compactor={verticalCompactor}
            dragConfig={{ enabled: editMode && isSuperuser, handle: '.widget-drag-handle' }}
            resizeConfig={{ enabled: editMode && isSuperuser }}
            onLayoutChange={onLayoutChange}
            autoSize
          >
            {visibleActive.map(id => {
              const meta = WIDGET_META.find(m => m.id === id);
              const item = currentLayout.find(l => l.i === id) || (meta ? { ...meta.defaultItem } : null);
              if (!item) return null;
              return (
                <div key={id} className="relative h-full min-h-0 flex flex-col">
                  {editMode && isSuperuser && (
                    <div className="widget-drag-handle absolute inset-x-0 top-0 h-8 z-10 cursor-grab active:cursor-grabbing" />
                  )}
                  <DashboardGridItem id={id}>
                    {renderWidget(id)}
                  </DashboardGridItem>
                </div>
              );
            })}
          </ResponsiveGridLayout>
        )}
      </div>

      {/* 위젯 추가 모달 */}
      {showAddModal && (
        <WidgetAddModal
          availableWidgets={addableWidgets}
          onAdd={addWidget}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}
