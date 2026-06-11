'use client';

import { getAuthHeaders } from '@/lib/getAuthHeaders';
import { WIDGET_META } from '@/lib/dashboardLayout';

export interface DashboardPrintSnapshot {
  storeName: string;
  generatedAt: string;
  widgets: { title: string; data: unknown }[];
}

export async function fetchDashboardPrintSnapshot(
  storeId: string,
  storeName: string,
  widgetIds: string[],
): Promise<DashboardPrintSnapshot> {
  const headers = await getAuthHeaders();
  const fetches: Promise<{ title: string; data: unknown }>[] = widgetIds.map(async id => {
    const meta = WIDGET_META.find(m => m.id === id);
    const title = meta?.title || id;
    try {
      let url = '';
      if (id === 'today_sales') url = `/api/dashboard/today-sales?storeId=${storeId}`;
      else if (id === 'sales_compare') url = `/api/dashboard/sales-compare?storeId=${storeId}`;
      else if (id === 'customer_visit') url = `/api/dashboard/customer-visit-summary?storeId=${storeId}`;
      else if (id === 'ai_insight') url = `/api/dashboard/comprehensive-opinion?storeId=${storeId}`;
      else if (id === 'cost_ratio') url = `/api/dashboard/cost-ratio?storeId=${storeId}`;
      else return { title, data: null };

      const res = await fetch(url, { headers });
      const data = await res.json();
      return { title, data };
    } catch {
      return { title, data: null };
    }
  });

  const widgets = await Promise.all(fetches);
  return {
    storeName,
    generatedAt: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
    widgets: widgets.filter(w => w.data),
  };
}

export function openDashboardPrintWindow(snapshot: DashboardPrintSnapshot) {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>대시보드 리포트</title>
<style>body{font-family:sans-serif;padding:24px;color:#111}h1{font-size:18px}h2{font-size:14px;margin-top:20px;border-bottom:1px solid #ddd;padding-bottom:4px}pre{font-size:11px;background:#f5f5f5;padding:12px;border-radius:8px;white-space:pre-wrap}</style></head>
<body><h1>${snapshot.storeName} · 대시보드 스냅샷</h1><p style="color:#666;font-size:12px">${snapshot.generatedAt}</p>
${snapshot.widgets.map(w => `<h2>${w.title}</h2><pre>${JSON.stringify(w.data, null, 2).slice(0, 2000)}</pre>`).join('')}
</body></html>`;

  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
}
