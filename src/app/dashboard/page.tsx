'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import type { LayoutItem } from 'react-grid-layout';

const ResponsiveGridLayout = dynamic(
  () => import('react-grid-layout').then(m => ({ default: m.ResponsiveGridLayout })),
  { ssr: false }
);
import { Plus, LayoutGrid, Lock, RotateCcw, Crown } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useStore } from '@/context/StoreContext';
import NewsWidget           from '@/components/widgets/NewsWidget';
import WeatherWidget        from '@/components/widgets/WeatherWidget';
import WeeklyAnalysisWidget from '@/components/widgets/WeeklyAnalysisWidget';
import YesterdayWidget      from '@/components/widgets/YesterdayWidget';
import QuickMenuWidget      from '@/components/widgets/QuickMenuWidget';
import AiInsightWidget        from '@/components/widgets/AiInsightWidget';
import SalesPredictionWidget  from '@/components/widgets/SalesPredictionWidget';
import TotalPartnerWidget     from '@/components/widgets/TotalPartnerWidget';
import TodaySalesWidget       from '@/components/widgets/TodaySalesWidget';
import SalesCompareWidget     from '@/components/widgets/SalesCompareWidget';
import { getAuthHeaders, getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import { isSuperuserEmail } from '@/lib/auth/permissions';
import { useLicense } from '@/hooks/useLicense';
import { db } from '@/lib/firebase/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

/* ── 타입 ── */
type GridLayout = readonly LayoutItem[];
type ResponsiveLayouts = Partial<Record<string, GridLayout>>;

/* ── 위젯 메타 ── */
interface WidgetMeta {
  id: string;
  title: string;
  defaultItem: LayoutItem;
  permKey: string;
}

const WIDGET_META: WidgetMeta[] = [
  {
    id: 'weather',
    title: '오늘 날씨',
    defaultItem: { i: 'weather', x: 0, y: 0, w: 6, h: 3, minW: 5, minH: 2, maxW: 12, maxH: 5 },
    permKey: 'weather',
  },
  {
    id: 'quick_menu',
    title: '빠른 메뉴',
    defaultItem: { i: 'quick_menu', x: 3, y: 0, w: 3, h: 3, minW: 2, minH: 2, maxW: 6, maxH: 6 },
    permKey: 'quick_menu',
  },
  {
    id: 'weekly_analysis',
    title: 'AI 주간 분석',
    defaultItem: { i: 'weekly_analysis', x: 6, y: 0, w: 3, h: 4, minW: 3, minH: 3, maxW: 12, maxH: 6 },
    permKey: 'weekly_analysis',
  },
  {
    id: 'yesterday_analysis',
    title: '전일 판매 분석',
    defaultItem: { i: 'yesterday_analysis', x: 9, y: 0, w: 3, h: 4, minW: 3, minH: 3, maxW: 12, maxH: 6 },
    permKey: 'yesterday_analysis',
  },
  {
    id: 'news',
    title: '정육 최신 뉴스',
    defaultItem: { i: 'news', x: 0, y: 3, w: 6, h: 4, minW: 3, minH: 2, maxW: 12, maxH: 6 },
    permKey: 'news',
  },
  {
    id: 'ai_insight',
    title: 'AI 인사이트',
    defaultItem: { i: 'ai_insight', x: 0, y: 7, w: 8, h: 5, minW: 5, minH: 4, maxW: 12, maxH: 8 },
    permKey: 'ai_insight',
  },
  {
    id: 'sales_prediction',
    title: 'AI 매출 예측',
    defaultItem: { i: 'sales_prediction', x: 0, y: 4, w: 12, h: 4, minW: 8, minH: 3, maxW: 12, maxH: 6 },
    permKey: 'sales_prediction',
  },
  {
    id: 'total_partner',
    title: 'AI 토탈 운영파트너',
    defaultItem: { i: 'total_partner', x: 0, y: 8, w: 12, h: 6, minW: 8, minH: 5, maxW: 12, maxH: 10 },
    permKey: 'total_partner',
  },
  {
    id: 'today_sales',
    title: '당일 매출 현황',
    defaultItem: { i: 'today_sales', x: 0, y: 0, w: 4, h: 5, minW: 3, minH: 4, maxW: 6, maxH: 8 },
    permKey: 'today_sales',
  },
  {
    id: 'sales_compare',
    title: '매출 비교',
    defaultItem: { i: 'sales_compare', x: 4, y: 0, w: 4, h: 5, minW: 3, minH: 4, maxW: 8, maxH: 8 },
    permKey: 'sales_compare',
  },
];

const DEFAULT_ACTIVE = ['weather', 'quick_menu', 'weekly_analysis', 'yesterday_analysis', 'news', 'sales_prediction', 'ai_insight', 'total_partner', 'today_sales', 'sales_compare'];

function makeDefaultLayout(ids: string[]): GridLayout {
  return WIDGET_META.filter(m => ids.includes(m.id)).map(m => ({ ...m.defaultItem }));
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

  const [editMode,      setEditMode]      = useState(false);
  const [activeWidgets, setActiveWidgets] = useState<string[]>(DEFAULT_ACTIVE);
  const [layouts,       setLayouts]       = useState<ResponsiveLayouts>({ lg: makeDefaultLayout(DEFAULT_ACTIVE) });
  const [widgetPerms,   setWidgetPerms]   = useState<Record<string, Record<string, boolean>>>({});
  const [userRole,      setUserRole]      = useState('user');
  const [showAddModal,  setShowAddModal]  = useState(false);
  const [isMobile,      setIsMobile]      = useState(false);
  const [layoutLoaded,  setLayoutLoaded]  = useState(false);
  const [containerW,    setContainerW]    = useState(1280);

  const containerRef = useRef<HTMLDivElement>(null);
  const saveTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* 모바일 감지 + 컨테이너 너비 */
  useEffect(() => {
    const update = () => {
      setIsMobile(window.innerWidth < 768);
      if (containerRef.current) setContainerW(containerRef.current.offsetWidth);
    };
    update();
    const ro = new ResizeObserver(update);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  /* 권한 조회 */
  useEffect(() => {
    if (!uid) return;
    getAuthHeaders()
      .then(headers => fetch(`/api/permissions?type=myAccess${storeId ? `&storeId=${storeId}` : ''}`, { headers }))
      .then(r => r.json())
      .then(d => { if (d.role) setUserRole(d.role); })
      .catch(() => {});
  }, [uid, storeId]);

  /* 위젯 권한 조회 */
  useEffect(() => {
    const q = storeId ? `?storeId=${storeId}` : '';
    getAuthHeaders()
      .then(headers => fetch(`/api/dashboard/widget-permissions${q}`, { headers }))
      .then(r => r.json())
      .then(d => setWidgetPerms(d.widgets || {}))
      .catch(() => {});
  }, [storeId]);

  /* 저장된 레이아웃 불러오기 */
  useEffect(() => {
    if (!uid) return;
    const params = new URLSearchParams({ uid });
    if (storeId) params.set('storeId', storeId);
    getAuthHeaders()
      .then(headers => fetch(`/api/dashboard/layout?${params}`, { headers }))
      .then(r => r.json())
      .then(d => {
        if (d.layout && d.activeWidgets) {
          let widgets: string[] = d.activeWidgets;
          let layout: LayoutItem[] = d.layout as LayoutItem[];
          if (!widgets.includes('total_partner')) {
            widgets = [...widgets, 'total_partner'];
            const meta = WIDGET_META.find(m => m.id === 'total_partner')!;
            layout = [...layout, { ...meta.defaultItem, y: Infinity }];
          }
          setLayouts({ lg: layout as GridLayout });
          setActiveWidgets(widgets);
        }
        setLayoutLoaded(true);
      })
      .catch(() => setLayoutLoaded(true));
  }, [uid, storeId]);

  /* 마스터 레이아웃 실시간 동기화 (슈퍼유저 변경 시 모든 유저 반영) */
  useEffect(() => {
    if (!storeId || !layoutLoaded) return;
    const unsubscribe = onSnapshot(
      doc(db, 'dashboard_layouts', `${storeId}_master`),
      snap => {
        if (!snap.exists()) return;
        const data = snap.data();
        if (data?.layout && data?.activeWidgets) {
          let widgets: string[] = data.activeWidgets;
          let layout: LayoutItem[] = data.layout;
          if (!widgets.includes('total_partner')) {
            widgets = [...widgets, 'total_partner'];
            const meta = WIDGET_META.find(m => m.id === 'total_partner')!;
            layout = [...layout, { ...meta.defaultItem, y: Infinity }];
          }
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
          body: JSON.stringify({ uid, layout: [...layout], activeWidgets: widgets, storeId: storeId || undefined }),
        })
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

  const visibleActive = activeWidgets.filter(id => allowedIds.includes(id));

  /* 현재 레이아웃 아이템들 (표시 중인 위젯만) */
  const currentLayout = (layouts.lg || []).filter((item: LayoutItem) => visibleActive.includes(item.i));

  /* onLayoutChange 핸들러 */
  const onLayoutChange = useCallback((newLayout: GridLayout) => {
    // 새 레이아웃과 기존 메타 병합 (minW/minH 등 유지)
    const merged: LayoutItem[] = visibleActive.map(id => {
      const meta    = WIDGET_META.find(m => m.id === id)!;
      const updated = [...newLayout].find(l => l.i === id);
      return updated ? { ...meta.defaultItem, ...updated } : { ...meta.defaultItem };
    });
    const next = { ...layouts, lg: merged as GridLayout };
    setLayouts(next);
    persistLayout(merged as GridLayout, activeWidgets);
  }, [visibleActive, layouts, activeWidgets, persistLayout]);

  /* 위젯 추가 */
  const addWidget = (id: string) => {
    if (activeWidgets.includes(id)) return;
    const meta = WIDGET_META.find(m => m.id === id);
    if (!meta) return;
    const newItem: LayoutItem = { ...meta.defaultItem, y: Infinity };
    const newActive           = [...activeWidgets, id];
    const newLayout           = [...(layouts.lg || []).filter((l: LayoutItem) => l.i !== id), newItem];
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

  /* 위젯 렌더 */
  const renderWidget = (id: string) => {
    switch (id) {
      case 'news':               return <NewsWidget           editMode={editMode} onRemove={() => removeWidget(id)} />;
      case 'weather':            return <WeatherWidget        editMode={editMode} onRemove={() => removeWidget(id)} storeId={storeId} />;
      case 'weekly_analysis':    return <WeeklyAnalysisWidget editMode={editMode} onRemove={() => removeWidget(id)} storeId={storeId} />;
      case 'yesterday_analysis': return <YesterdayWidget      editMode={editMode} onRemove={() => removeWidget(id)} storeId={storeId} />;
      case 'quick_menu':         return <QuickMenuWidget      editMode={editMode} onRemove={() => removeWidget(id)} />;
      case 'ai_insight':         return <AiInsightWidget        editMode={editMode} onRemove={() => removeWidget(id)} storeId={storeId} />;
      case 'sales_prediction':   return <SalesPredictionWidget  editMode={editMode} onRemove={() => removeWidget(id)} storeId={storeId} />;
      case 'total_partner':      return <TotalPartnerWidget     editMode={editMode} onRemove={() => removeWidget(id)} storeId={storeId} />;
      case 'today_sales':        return <TodaySalesWidget       editMode={editMode} onRemove={() => removeWidget(id)} storeId={storeId} />;
      case 'sales_compare':      return <SalesCompareWidget     editMode={editMode} onRemove={() => removeWidget(id)} storeId={storeId} />;
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

  /* 모바일 세로 스택 */
  if (isMobile) {
    return (
      <div className="flex flex-col min-h-full bg-slate-950 p-3 space-y-3">
        <div className="flex items-center px-1">
          <h1 className="text-slate-300 font-semibold text-sm flex-1">대시보드</h1>
          <span className="text-slate-600 text-[10px]">모바일 뷰</span>
        </div>
        {visibleActive.map(id => (
          <div key={id} className="h-64">{renderWidget(id)}</div>
        ))}
      </div>
    );
  }

  /* 데스크탑 그리드 */
  return (
    <div className="flex flex-col min-h-full bg-slate-950">
      {/* 슈퍼유저 편집 모드 배너 */}
      {editMode && isSuperuser && (
        <div className="flex items-center gap-2 px-6 py-2 bg-purple-900/40 border-b border-purple-700/40 shrink-0">
          <Crown className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
          <p className="text-purple-200 text-xs flex-1">레이아웃 편집 모드 — 변경사항이 모든 유저에게 적용됩니다</p>
        </div>
      )}

      {/* 툴바 */}
      <div className="flex items-center gap-2 px-6 py-3 border-b border-slate-800/60 shrink-0 flex-wrap">
        <h1 className="text-slate-400 text-xs font-semibold uppercase tracking-widest flex-1">대시보드</h1>

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
      <div ref={containerRef} className="flex-1 overflow-auto p-4">
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
            width={containerW}
            layouts={{ lg: currentLayout, md: currentLayout, sm: currentLayout }}
            breakpoints={{ lg: 1200, md: 996, sm: 768 }}
            cols={{ lg: 12, md: 10, sm: 6 }}
            rowHeight={80}
            margin={[12, 12]}
            dragConfig={{ enabled: editMode && isSuperuser, handle: '.widget-drag-handle' }}
            resizeConfig={{ enabled: editMode && isSuperuser }}
            onLayoutChange={onLayoutChange}
            autoSize
          >
            {visibleActive.map(id => {
              const item = currentLayout.find(l => l.i === id);
              if (!item) return null;
              return (
                <div key={id} className="relative">
                  {/* 드래그 핸들 (슈퍼유저 편집 모드에서만) */}
                  {editMode && isSuperuser && (
                    <div className="widget-drag-handle absolute inset-x-0 top-0 h-8 z-10 cursor-grab active:cursor-grabbing" />
                  )}
                  {renderWidget(id)}
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
