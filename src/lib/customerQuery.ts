import { adminDb } from '@/lib/firebase/admin';
import { maskName } from '@/lib/encryption';
import { normDateYMD } from '@/lib/dateUtils';
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';
import {
  buildVisitDatesMap,
  computeVisitCycle,
  mergeVisitCycle,
  type VisitCycleStatus,
} from '@/lib/customerVisitCycle';

export type CustomerSortField =
  | 'cusCode'
  | 'point'
  | 'totalPurchase'
  | 'visitCount'
  | 'joinDate'
  | 'lastVisitDate'
  | 'grade'
  | 'avgCycleDays'
  | 'daysSinceLastVisit'
  | 'expectedNextVisit';

export interface CustomerRow {
  cusCode: string;
  nameMasked: string;
  phoneMasked: string;
  grade: string;
  cusGubun: string;
  cusClass: string;
  point: number;
  joinDate: string;
  writeDate: string;
  visitCount: number;
  totalPurchase: number;
  lastVisitDate: string;
  totalVisits: number;
  totalSales: number;
  lastVisit: string;
  distinctVisitDays: number;
  avgCycleDays: number | null;
  medianCycleDays: number | null;
  daysSinceLastVisit: number | null;
  expectedNextVisit: string | null;
  cycleStatus: VisitCycleStatus;
  cycleStatusLabel: string;
}

export interface CustomerQueryParams {
  storeId: string;
  grade?: string;
  search?: string;
  joinFrom?: string;
  joinTo?: string;
  visitFrom?: string;
  visitTo?: string;
  cycleStatus?: VisitCycleStatus | '';
  sortBy?: CustomerSortField;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
  exportAll?: boolean;
}

export interface CustomerQueryResult {
  customers: CustomerRow[];
  total: number;
  page: number;
  stats: {
    totalCustomers: number;
    monthlyVisitors: number;
    newCustomers: number;
    avgSpend: number;
    overdueCount: number;
    dueSoonCount: number;
    withCycleData: number;
  };
  grades: string[];
}

export { normDateYMD };

function inDateRange(value: string, from?: string, to?: string): boolean {
  const d = normDateYMD(value);
  if (!d) return !from && !to;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

async function fetchAllCustomerDocs(storeId: string) {
  const docs: QueryDocumentSnapshot[] = [];
  let last: QueryDocumentSnapshot | undefined;
  while (true) {
    let q = adminDb.collection('pos_customers').where('storeId', '==', storeId).limit(1000);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    docs.push(...snap.docs);
    if (snap.docs.length < 1000) break;
    last = snap.docs[snap.docs.length - 1];
  }
  return docs;
}

function sortCustomers(list: CustomerRow[], sortBy: CustomerSortField, sortOrder: 'asc' | 'desc') {
  const dir = sortOrder === 'asc' ? 1 : -1;
  const num = (v: number | null | undefined, fallback = -1) =>
    v == null ? fallback : v;

  return [...list].sort((a, b) => {
    let av: string | number = '';
    let bv: string | number = '';
    switch (sortBy) {
      case 'cusCode':
        av = a.cusCode; bv = b.cusCode; break;
      case 'point':
        av = a.point; bv = b.point; break;
      case 'totalPurchase':
        av = a.totalSales; bv = b.totalSales; break;
      case 'visitCount':
        av = a.distinctVisitDays || a.totalVisits; bv = b.distinctVisitDays || b.totalVisits; break;
      case 'joinDate':
        av = normDateYMD(a.joinDate || a.writeDate);
        bv = normDateYMD(b.joinDate || b.writeDate);
        break;
      case 'lastVisitDate':
        av = normDateYMD(a.lastVisit || a.lastVisitDate);
        bv = normDateYMD(b.lastVisit || b.lastVisitDate);
        break;
      case 'grade':
        av = a.grade || a.cusClass; bv = b.grade || b.cusClass; break;
      case 'avgCycleDays':
        av = num(a.avgCycleDays, 99999); bv = num(b.avgCycleDays, 99999); break;
      case 'daysSinceLastVisit':
        av = num(a.daysSinceLastVisit, -1); bv = num(b.daysSinceLastVisit, -1); break;
      case 'expectedNextVisit':
        av = normDateYMD(a.expectedNextVisit || '');
        bv = normDateYMD(b.expectedNextVisit || '');
        break;
    }
    if (typeof av === 'number' && typeof bv === 'number') {
      return av === bv ? 0 : (av < bv ? -dir : dir);
    }
    return String(av).localeCompare(String(bv), 'ko') * dir;
  });
}

export async function queryCustomers(params: CustomerQueryParams): Promise<CustomerQueryResult> {
  const {
    storeId,
    grade = '',
    search = '',
    joinFrom = '',
    joinTo = '',
    visitFrom = '',
    visitTo = '',
    cycleStatus = '',
    sortBy = 'lastVisitDate',
    sortOrder = 'desc',
    page = 1,
    limit = 50,
    exportAll = false,
  } = params;

  const snap = await fetchAllCustomerDocs(storeId);

  const salesSnap = await adminDb.collection('pos_customer_sales')
    .where('storeId', '==', storeId)
    .get();

  const salesDocs = salesSnap.docs.map(d => d.data() as { cusCode?: string; date?: string; totalSale?: number; visitCount?: number });
  const visitDatesMap = buildVisitDatesMap(salesDocs);

  const salesMap: Record<string, { totalSales: number; visits: number; lastVisit: string }> = {};
  for (const r of salesDocs) {
    const code = r.cusCode as string;
    if (!code) continue;
    if (!salesMap[code]) salesMap[code] = { totalSales: 0, visits: 0, lastVisit: '' };
    salesMap[code].totalSales += Number(r.totalSale || 0);
    salesMap[code].visits += Number(r.visitCount || 1);
    const d = normDateYMD(String(r.date || ''));
    if (d && (!salesMap[code].lastVisit || d > salesMap[code].lastVisit)) {
      salesMap[code].lastVisit = d;
    }
  }

  const allRows: CustomerRow[] = snap.map(d => {
    const r = d.data();
    const cusCode = String(r.cusCode || '');
    const joinDate = String(r.joinDate || r.writeDate || '');
    const lastVisitDate = String(r.lastVisitDate || r.writeDate || '');
    const posVisitCount = Number(r.visitCount || 0);
    const lastVisit = salesMap[cusCode]?.lastVisit || normDateYMD(lastVisitDate);

    const cycleFromSales = computeVisitCycle(visitDatesMap.get(cusCode) || []);
    const cycle = mergeVisitCycle(cycleFromSales, posVisitCount, joinDate, lastVisit);

    return {
      cusCode,
      nameMasked: r.nameEncrypted ? '● 암호화됨' : maskName(String(r.name || '')),
      phoneMasked: String(r.phoneMasked || ''),
      grade: String(r.grade || ''),
      cusGubun: String(r.cusGubun || ''),
      cusClass: String(r.cusClass || r.grade || ''),
      point: Number(r.point) || 0,
      joinDate,
      writeDate: String(r.writeDate || r.joinDate || ''),
      visitCount: posVisitCount,
      totalPurchase: Number(r.totalPurchase || 0),
      lastVisitDate,
      totalVisits: salesMap[cusCode]?.visits || posVisitCount,
      totalSales: salesMap[cusCode]?.totalSales || Number(r.totalPurchase || 0),
      lastVisit,
      distinctVisitDays: cycle.distinctVisitDays,
      avgCycleDays: cycle.avgCycleDays,
      medianCycleDays: cycle.medianCycleDays,
      daysSinceLastVisit: cycle.daysSinceLastVisit,
      expectedNextVisit: cycle.expectedNextVisit,
      cycleStatus: cycle.cycleStatus,
      cycleStatusLabel: cycle.cycleStatusLabel,
    };
  });

  let filtered = allRows;

  if (grade) {
    filtered = filtered.filter(c => c.grade === grade || c.cusClass === grade);
  }
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    filtered = filtered.filter(c => c.cusCode.toLowerCase().includes(q));
  }
  if (joinFrom || joinTo) {
    filtered = filtered.filter(c => inDateRange(c.joinDate || c.writeDate, joinFrom, joinTo));
  }
  if (visitFrom || visitTo) {
    filtered = filtered.filter(c => inDateRange(c.lastVisit || c.lastVisitDate, visitFrom, visitTo));
  }
  if (cycleStatus) {
    filtered = filtered.filter(c => c.cycleStatus === cycleStatus);
  }

  const sorted = sortCustomers(filtered, sortBy, sortOrder);
  const total = sorted.length;
  const maxExport = 20000;
  const pageLimit = exportAll ? Math.min(total, maxExport) : Math.min(limit, 100);
  const customers = exportAll
    ? sorted.slice(0, maxExport)
    : sorted.slice((page - 1) * pageLimit, page * pageLimit);

  const nowYM = new Date().toISOString().slice(0, 7);
  const monthCodes = new Set(
    salesDocs
      .filter(r => normDateYMD(String(r.date || '')).startsWith(nowYM))
      .map(r => r.cusCode as string),
  );
  const newCodes = new Set(
    snap
      .filter(d => {
        const wd = String(d.data().joinDate || d.data().writeDate || '');
        return normDateYMD(wd).startsWith(nowYM);
      })
      .map(d => d.data().cusCode as string),
  );
  const totalSalesSum = salesDocs.reduce((s, r) => s + Number(r.totalSale || 0), 0);
  const totalVisitsSum = salesDocs.reduce((s, r) => s + Number(r.visitCount || 1), 0);

  const overdueCount = allRows.filter(c => c.cycleStatus === 'overdue').length;
  const dueSoonCount = allRows.filter(c => c.cycleStatus === 'due_soon').length;
  const withCycleData = allRows.filter(c => c.avgCycleDays != null).length;

  return {
    customers,
    total,
    page,
    stats: {
      totalCustomers: allRows.length,
      monthlyVisitors: monthCodes.size,
      newCustomers: newCodes.size,
      avgSpend: totalVisitsSum > 0 ? Math.round(totalSalesSum / totalVisitsSum) : 0,
      overdueCount,
      dueSoonCount,
      withCycleData,
    },
    grades: [...new Set(allRows.map(c => c.grade).filter(Boolean))].sort(),
  };
}
