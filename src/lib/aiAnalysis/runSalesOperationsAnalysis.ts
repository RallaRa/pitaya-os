import { addDaysYMD, getKSTTodayYMD } from '@/lib/dateUtils';
import { getDisplayNetSales, posDailySalesDocId, type SalesDocData } from '@/lib/posDailySales';
import { dailyReportDocId } from '@/lib/reportCompare';
import { adminDb } from '@/lib/firebase/admin';
import { computeVisitTrend } from '@/lib/customerVisitTrend';
import { buildVisitDatesMap } from '@/lib/customerVisitCycle';
import type { SalesOperationsAnalysis } from './types';

type SalesDayRow = SalesDocData & { date: string; customerCount?: number; transCount?: number };

function pct(a: number, b: number): number | null {
  if (!b) return null;
  return Math.round(((a - b) / b) * 1000) / 10;
}

function daysBetween(fromYmd: string, toYmd: string): number {
  const a = new Date(`${fromYmd}T12:00:00+09:00`);
  const b = new Date(`${toYmd}T12:00:00+09:00`);
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

async function loadSalesDay(storeId: string, date: string): Promise<SalesDayRow | null> {
  const posSnap = await adminDb.collection('pos_daily_sales')
    .doc(posDailySalesDocId(storeId, date))
    .get();
  if (posSnap.exists) return { date, ...(posSnap.data() as SalesDocData) };

  const reportSnap = await adminDb.collection('daily_reports')
    .doc(dailyReportDocId(storeId, date))
    .get();
  if (reportSnap.exists) return { date, ...(reportSnap.data() as SalesDocData) };

  return null;
}

async function loadSalesRange(storeId: string, start: string, end: string) {
  const days: string[] = [];
  for (let d = start; d <= end; d = addDaysYMD(d, 1)) days.push(d);
  const rows = await Promise.all(days.map(date => loadSalesDay(storeId, date)));
  return rows.filter(Boolean) as SalesDayRow[];
}

function aggregatePeriod(rows: SalesDayRow[]) {
  let net = 0;
  let cust = 0;
  let days = 0;
  for (const r of rows) {
    const n = getDisplayNetSales(r);
    const c = Number(r.customerCount ?? r.transCount ?? 0);
    if (n <= 0 && c <= 0) continue;
    net += n;
    cust += c;
    days++;
  }
  return { net, cust, days, ticket: cust > 0 ? net / cust : 0 };
}

export async function runSalesOperationsAnalysis(storeId: string): Promise<SalesOperationsAnalysis> {
  const asOf = getKSTTodayYMD();
  const d7s = addDaysYMD(asOf, -6);
  const d7ps = addDaysYMD(asOf, -13);
  const d7pe = addDaysYMD(asOf, -7);
  const d28s = addDaysYMD(asOf, -27);
  const d28ps = addDaysYMD(asOf, -55);
  const d28pe = addDaysYMD(asOf, -28);
  const d90s = addDaysYMD(asOf, -89);

  const [last7, prev7, last28, prev28, salesSnap, custSnap, linesSnap] = await Promise.all([
    loadSalesRange(storeId, d7s, asOf),
    loadSalesRange(storeId, d7ps, d7pe),
    loadSalesRange(storeId, d28s, asOf),
    loadSalesRange(storeId, d28ps, d28pe),
    adminDb.collection('pos_customer_sales').where('storeId', '==', storeId).get(),
    adminDb.collection('pos_customers').where('storeId', '==', storeId).get(),
    adminDb.collection('pos_customer_purchase_lines').where('storeId', '==', storeId).get(),
  ]);

  const p7 = aggregatePeriod(last7);
  const p7p = aggregatePeriod(prev7);
  const p28 = aggregatePeriod(last28);
  const p28p = aggregatePeriod(prev28);

  const salesDocs = salesSnap.docs.map(d => d.data() as { cusCode?: string; date?: string; totalSale?: number; visitCount?: number });
  const visitDatesMap = buildVisitDatesMap(salesDocs);

  const spendMap = new Map<string, number>();
  for (const r of salesDocs) {
    const code = String(r.cusCode || '');
    if (!code) continue;
    spendMap.set(code, (spendMap.get(code) || 0) + Number(r.totalSale || 0));
  }

  const trends: Record<string, number> = { churned: 0, decreasing: 0, increasing: 0, stable: 0, new: 0 };
  const trendLifetimeSpend: Record<string, number> = { churned: 0, decreasing: 0, increasing: 0, stable: 0 };
  const dormant = { d31_60: 0, d61_180: 0, d181plus: 0, active30: 0 };

  for (const doc of custSnap.docs) {
    const c = doc.data();
    const code = String(c.cusCode || '');
    const visitDates = visitDatesMap.get(code) || [];
    const trend = computeVisitTrend(visitDates, asOf);
    trends[trend.segment] = (trends[trend.segment] || 0) + 1;
    if (trendLifetimeSpend[trend.segment] != null) {
      trendLifetimeSpend[trend.segment] += spendMap.get(code) || 0;
    }

    const last = visitDates.sort().pop() || String(c.lastVisitDate || '').slice(0, 10);
    if (!last) continue;
    const d = daysBetween(last, asOf);
    if (d <= 30) dormant.active30++;
    else if (d <= 60) dormant.d31_60++;
    else if (d <= 180) dormant.d61_180++;
    else dormant.d181plus++;
  }

  const memberStats = (s: string, e: string) => {
    const codes = new Set<string>();
    let visits = 0;
    let spend = 0;
    for (const r of salesDocs) {
      const date = String(r.date || '').slice(0, 10);
      if (date < s || date > e) continue;
      codes.add(String(r.cusCode || ''));
      visits += Number(r.visitCount || 1);
      spend += Number(r.totalSale || 0);
    }
    return { visitors: codes.size, visits, spend, ticket: visits ? spend / visits : 0 };
  };
  const m7 = memberStats(d7s, asOf);
  const m7p = memberStats(d7ps, d7pe);

  type ItemRow = { qty: number; amt: number; buyers: Set<string>; cat: string };
  const itemWindow = (s: string, e: string) => {
    const map: Record<string, ItemRow> = {};
    for (const doc of linesSnap.docs) {
      const x = doc.data();
      const date = String(x.date || '');
      if (date < s || date > e || date < d90s) continue;
      const name = String(x.goodsName || '').trim();
      if (!name) continue;
      if (!map[name]) map[name] = { qty: 0, amt: 0, buyers: new Set(), cat: String(x.categoryName || '') };
      map[name].qty += Number(x.saleCount || 0);
      map[name].amt += Number(x.totalPrice || 0);
      map[name].buyers.add(String(x.cusCode || ''));
    }
    return map;
  };

  const itemThis = itemWindow(d7s, asOf);
  const itemPrev = itemWindow(d7ps, d7pe);

  const itemDeclines = [];
  const itemGains = [];
  for (const [name, cur] of Object.entries(itemThis)) {
    const prev = itemPrev[name];
    if (prev && prev.amt >= 50000) {
      const p = pct(cur.amt, prev.amt);
      if (p != null && p <= -15) {
        itemDeclines.push({
          name, cat: cur.cat, prev: Math.round(prev.amt), cur: Math.round(cur.amt), pct: p,
          buyersPrev: prev.buyers.size, buyersCur: cur.buyers.size,
        });
      }
    }
    if (prev && prev.amt >= 30000) {
      const p = pct(cur.amt, prev.amt);
      if (p != null && p >= 15) {
        itemGains.push({
          name, cat: cur.cat, prev: Math.round(prev.amt), cur: Math.round(cur.amt), pct: p,
          buyersPrev: prev.buyers.size, buyersCur: cur.buyers.size,
        });
      }
    }
  }
  itemDeclines.sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0));
  itemGains.sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));

  const catMixFn = (s: string, e: string) => {
    const cats: Record<string, number> = {};
    for (const doc of linesSnap.docs) {
      const x = doc.data();
      const date = String(x.date || '');
      if (date < s || date > e || date < d90s) continue;
      const cat = String(x.categoryName || '기타');
      cats[cat] = (cats[cat] || 0) + Number(x.totalPrice || 0);
    }
    return cats;
  };
  const catThis = catMixFn(d7s, asOf);
  const catPrev = catMixFn(d7ps, d7pe);
  const categoryMix = Object.keys({ ...catThis, ...catPrev }).map(cat => ({
    cat,
    last7: Math.round(catThis[cat] || 0),
    prev7: Math.round(catPrev[cat] || 0),
    pct: pct(catThis[cat] || 0, catPrev[cat] || 0),
  })).sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0));

  const decCodes: string[] = [];
  for (const doc of custSnap.docs) {
    const code = String(doc.data().cusCode || '');
    if (computeVisitTrend(visitDatesMap.get(code) || [], asOf).segment === 'decreasing') {
      decCodes.push(code);
    }
  }
  const decSet = new Set(decCodes);
  const decItems: Record<string, { amt: number; buyers: Set<string> }> = {};
  for (const doc of linesSnap.docs) {
    const x = doc.data();
    const code = String(x.cusCode || '');
    const date = String(x.date || '');
    if (!decSet.has(code) || date < d28s) continue;
    const name = String(x.goodsName || '').trim();
    if (!name) continue;
    if (!decItems[name]) decItems[name] = { amt: 0, buyers: new Set() };
    decItems[name].amt += Number(x.totalPrice || 0);
    decItems[name].buyers.add(code);
  }
  const decreasingSegmentTopItems28d = Object.entries(decItems)
    .sort((a, b) => b[1].amt - a[1].amt)
    .slice(0, 10)
    .map(([name, v]) => ({ name, amt28d: Math.round(v.amt), buyers: v.buyers.size }));

  const prevBuyers = new Set<string>();
  const curBuyers = new Set<string>();
  for (const doc of linesSnap.docs) {
    const x = doc.data();
    const date = String(x.date || '');
    const code = String(x.cusCode || '');
    if (date >= d7ps && date <= d7pe) prevBuyers.add(code);
    if (date >= d7s && date <= asOf) curBuyers.add(code);
  }
  const lostBuyers = [...prevBuyers].filter(c => c && !curBuyers.has(c));
  const lostItemMap: Record<string, number> = {};
  for (const doc of linesSnap.docs) {
    const x = doc.data();
    const code = String(x.cusCode || '');
    const date = String(x.date || '');
    if (!lostBuyers.includes(code) || date < d7ps || date > d7pe) continue;
    const name = String(x.goodsName || '').trim();
    if (!name) continue;
    lostItemMap[name] = (lostItemMap[name] || 0) + Number(x.totalPrice || 0);
  }
  const lostTopItems = Object.entries(lostItemMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, amtPrev7]) => ({ name, amtPrev7: Math.round(amtPrev7) }));

  const weeklyTrend = [];
  for (let w = 0; w < 13; w++) {
    const end = addDaysYMD(asOf, -w * 7);
    const start = addDaysYMD(end, -6);
    const rows = await loadSalesRange(storeId, start, end);
    const agg = aggregatePeriod(rows);
    weeklyTrend.unshift({
      week: `${start}~${end}`,
      net: Math.round(agg.net),
      cust: agg.cust,
      ticket: Math.round(agg.ticket),
    });
  }

  const dowLabels = ['일', '월', '화', '수', '목', '금', '토'];
  const dowNet = Object.fromEntries(dowLabels.map(d => [d, { net: 0, n: 0, cust: 0 }]));
  for (const r of last28) {
    const day = dowLabels[new Date(`${r.date}T12:00:00+09:00`).getDay()];
    dowNet[day].net += getDisplayNetSales(r);
    dowNet[day].cust += Number(r.customerCount ?? r.transCount ?? 0);
    dowNet[day].n++;
  }
  const weakDays = Object.entries(dowNet)
    .map(([dow, v]) => ({
      dow,
      avgNet: v.n ? Math.round(v.net / v.n) : 0,
      avgCust: v.n ? Math.round(v.cust / v.n) : 0,
      days: v.n,
    }))
    .sort((a, b) => a.avgNet - b.avgNet);

  return {
    asOf,
    storeId,
    headline: {
      last7: { ...p7, netWoW: pct(p7.net, p7p.net), custWoW: pct(p7.cust, p7p.cust), ticketWoW: pct(p7.ticket, p7p.ticket) },
      prev7: p7p,
      last28: { ...p28, netMoM: pct(p28.net, p28p.net), custMoM: pct(p28.cust, p28p.cust) },
      prev28: p28p,
    },
    memberFlow: {
      last7: m7,
      prev7: m7p,
      visitorWoW: pct(m7.visitors, m7p.visitors),
      visitWoW: pct(m7.visits, m7p.visits),
      spendPerVisitWoW: pct(m7.ticket, m7p.ticket),
      lostBuyersCount: lostBuyers.length,
      lostTopItems,
    },
    customerHealth: { trends, trendLifetimeSpend, dormant },
    itemDeclines: itemDeclines.slice(0, 12),
    itemGains: itemGains.slice(0, 10),
    categoryMix,
    decreasingSegmentTopItems28d,
    weakDays,
    weeklyTrend,
  };
}
