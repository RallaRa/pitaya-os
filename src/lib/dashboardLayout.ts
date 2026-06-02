import type { LayoutItem } from 'react-grid-layout';

export const GRID_COLS = 12;
export const DASHBOARD_LAYOUT_VERSION = 3;

export interface WidgetMeta {
  id: string;
  title: string;
  defaultItem: LayoutItem;
  permKey: string;
}

/** 12열 그리드 — 겹침 없는 기본 배치 (rowHeight 80px 기준) */
export const WIDGET_META: WidgetMeta[] = [
  {
    id: 'sales_prediction',
    title: 'AI 매출 예측',
    defaultItem: { i: 'sales_prediction', x: 0, y: 0, w: 12, h: 11, minW: 6, minH: 7, maxW: 12, maxH: 20 },
    permKey: 'sales_prediction',
  },
  {
    id: 'today_sales',
    title: '당일 매출 현황',
    defaultItem: { i: 'today_sales', x: 0, y: 9, w: 3, h: 3, minW: 3, minH: 3, maxW: 6, maxH: 8 },
    permKey: 'today_sales',
  },
  {
    id: 'sales_compare',
    title: '매출 비교',
    defaultItem: { i: 'sales_compare', x: 3, y: 9, w: 5, h: 3, minW: 3, minH: 3, maxW: 8, maxH: 8 },
    permKey: 'sales_compare',
  },
  {
    id: 'weather',
    title: '오늘 날씨',
    defaultItem: { i: 'weather', x: 8, y: 9, w: 4, h: 3, minW: 4, minH: 2, maxW: 12, maxH: 5 },
    permKey: 'weather',
  },
  {
    id: 'quick_menu',
    title: '빠른 메뉴',
    defaultItem: { i: 'quick_menu', x: 0, y: 12, w: 3, h: 3, minW: 2, minH: 2, maxW: 6, maxH: 6 },
    permKey: 'quick_menu',
  },
  {
    id: 'weekly_analysis',
    title: 'AI 주간 분석',
    defaultItem: { i: 'weekly_analysis', x: 3, y: 12, w: 4, h: 4, minW: 3, minH: 3, maxW: 12, maxH: 6 },
    permKey: 'weekly_analysis',
  },
  {
    id: 'yesterday_analysis',
    title: '전일 판매 분석',
    defaultItem: { i: 'yesterday_analysis', x: 7, y: 12, w: 5, h: 4, minW: 3, minH: 3, maxW: 12, maxH: 6 },
    permKey: 'yesterday_analysis',
  },
  {
    id: 'news',
    title: '정육 최신 뉴스',
    defaultItem: { i: 'news', x: 0, y: 16, w: 12, h: 4, minW: 3, minH: 2, maxW: 12, maxH: 6 },
    permKey: 'news',
  },
  {
    id: 'ai_insight',
    title: 'AI 종합 운영의견',
    defaultItem: { i: 'ai_insight', x: 0, y: 20, w: 12, h: 6, minW: 8, minH: 5, maxW: 12, maxH: 10 },
    permKey: 'ai_insight',
  },
  {
    id: 'total_partner',
    title: 'AI 토탈 운영파트너',
    defaultItem: { i: 'total_partner', x: 0, y: 26, w: 12, h: 6, minW: 8, minH: 5, maxW: 12, maxH: 10 },
    permKey: 'total_partner',
  },
];

export const DEFAULT_ACTIVE = [
  'sales_prediction',
  'today_sales',
  'sales_compare',
  'weather',
  'quick_menu',
  'weekly_analysis',
  'yesterday_analysis',
  'news',
  'ai_insight',
  'total_partner',
];

export const PRIORITY_WIDGET_ID = 'sales_prediction';

const META_BY_ID = new Map(WIDGET_META.map(m => [m.id, m]));

function clampItem(item: LayoutItem, meta: WidgetMeta): LayoutItem {
  const w = Math.min(Math.max(item.w ?? meta.defaultItem.w ?? 3, meta.defaultItem.minW ?? 1), GRID_COLS);
  const h = Math.max(item.h ?? meta.defaultItem.h ?? 3, meta.defaultItem.minH ?? 1);
  const x = Math.min(Math.max(item.x ?? 0, 0), GRID_COLS - w);
  const y = Math.max(item.y ?? 0, 0);
  return { ...meta.defaultItem, ...item, x, y, w, h };
}

function rectsOverlap(a: LayoutItem, b: LayoutItem): boolean {
  if (a.i === b.i) return false;
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

export function sortWidgetsForDisplay(ids: string[]): string[] {
  const order = DEFAULT_ACTIVE.filter(id => ids.includes(id));
  const extras = ids.filter(id => !order.includes(id));
  return [...order, ...extras];
}

export function makeDefaultLayout(ids: string[]): LayoutItem[] {
  return sortWidgetsForDisplay(ids)
    .map(id => META_BY_ID.get(id))
    .filter(Boolean)
    .map(meta => ({ ...meta!.defaultItem }));
}

export function mergeLayoutWithActiveWidgets(widgets: string[], layout: LayoutItem[]): LayoutItem[] {
  const merged: LayoutItem[] = [];
  for (const id of sortWidgetsForDisplay(widgets)) {
    const meta = META_BY_ID.get(id);
    if (!meta) continue;
    const existing = layout.find(l => l.i === id);
    merged.push(existing ? clampItem(existing, meta) : { ...meta.defaultItem });
  }
  return merged;
}

export function hasLayoutOverlap(layout: LayoutItem[]): boolean {
  for (let i = 0; i < layout.length; i++) {
    for (let j = i + 1; j < layout.length; j++) {
      if (rectsOverlap(layout[i], layout[j])) return true;
    }
  }
  return false;
}

export function isLayoutInBounds(layout: LayoutItem[]): boolean {
  return layout.every(item => {
    const w = item.w ?? 1;
    const h = item.h ?? 1;
    return item.x >= 0 && item.y >= 0 && item.x + w <= GRID_COLS && w > 0 && h > 0;
  });
}

/** 겹치거나 범위를 벗어난 항목을 위→아래 순서로 재배치 */
export function compactDashboardLayout(widgets: string[], layout: LayoutItem[]): LayoutItem[] {
  const placed: LayoutItem[] = [];

  for (const id of sortWidgetsForDisplay(widgets)) {
    const meta = META_BY_ID.get(id);
    if (!meta) continue;
    const source = layout.find(l => l.i === id);
    const base = clampItem(source ?? meta.defaultItem, meta);

    let candidate: LayoutItem | null = null;

    if (source && isLayoutInBounds([base]) && !placed.some(p => rectsOverlap(base, p))) {
      candidate = base;
    } else {
      outer:
      for (let y = 0; y < 500; y++) {
        for (let x = 0; x <= GRID_COLS - base.w; x++) {
          const next = { ...base, x, y };
          if (!placed.some(p => rectsOverlap(next, p))) {
            candidate = next;
            break outer;
          }
        }
      }
    }

    placed.push(candidate ?? { ...meta.defaultItem });
  }

  return placed;
}

export function resolveDashboardLayout(
  widgets: string[],
  savedLayout: LayoutItem[] | null | undefined,
  layoutVersion?: number,
): { layout: LayoutItem[]; repaired: boolean } {
  const merged = mergeLayoutWithActiveWidgets(widgets, savedLayout || []);
  const versionStale = layoutVersion == null || layoutVersion < DASHBOARD_LAYOUT_VERSION;
  const invalid = versionStale || !isLayoutInBounds(merged) || hasLayoutOverlap(merged);

  if (!invalid) {
    return { layout: merged, repaired: false };
  }

  const compacted = compactDashboardLayout(widgets, merged);
  if (!hasLayoutOverlap(compacted) && isLayoutInBounds(compacted)) {
    return { layout: compacted, repaired: true };
  }

  return { layout: makeDefaultLayout(widgets), repaired: true };
}

export function mergeLayoutChange(
  visibleIds: string[],
  newLayout: LayoutItem[],
): LayoutItem[] {
  return visibleIds.flatMap(id => {
    const meta = META_BY_ID.get(id);
    if (!meta) return [];
    const updated = newLayout.find(l => l.i === id);
    return [updated ? clampItem({ ...meta.defaultItem, ...updated }, meta) : { ...meta.defaultItem }];
  });
}
