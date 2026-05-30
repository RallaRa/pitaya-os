import { adminDb } from '@/lib/firebase/admin';
import { maskName } from '@/lib/encryption';
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';

export type CustomerSortField =
  | 'cusCode'
  | 'point'
  | 'totalPurchase'
  | 'visitCount'
  | 'joinDate'
  | 'lastVisitDate'
  | 'grade';

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
}

export interface CustomerQueryParams {
  storeId: string;
  grade?: string;
  search?: string;
  joinFrom?: string;
  joinTo?: string;
  visitFrom?: string;
  visitTo?: string;
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
  };
  grades: string[];
}

/** YYYY-MM-DD 추출 (POS 다양한 형식 대응) */
export function normDateYMD(raw: string): string {
  if (!raw) return '';
  const iso = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const compact = raw.replace(/\D/g, '');
  if (compact.length >= 8) {
    return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
  }
  return raw.slice(0, 10);
}

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
        av = a.totalVisits; bv = b.totalVisits; break;
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

  const salesMap: Record<string, { totalSales: number; visits: number; lastVisit: string }> = {};
  for (const d of salesSnap.docs) {
    const r = d.data();
    const code = r.cusCode as string;
    if (!code) continue;
    if (!salesMap[code]) salesMap[code] = { totalSales: 0, visits: 0, lastVisit: '' };
    salesMap[code].totalSales += Number(r.totalSale || 0);
    salesMap[code].visits += Number(r.visitCount || 1);
    if (!salesMap[code].lastVisit || String(r.date) > salesMap[code].lastVisit) {
      salesMap[code].lastVisit = String(r.date || '');
    }
  }

  const allRows: CustomerRow[] = snap.map(d => {
    const r = d.data();
    const cusCode = String(r.cusCode || '');
    const joinDate = String(r.joinDate || r.writeDate || '');
    const lastVisitDate = String(r.lastVisitDate || r.writeDate || '');
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
      visitCount: Number(r.visitCount || 0),
      totalPurchase: Number(r.totalPurchase || 0),
      lastVisitDate,
      totalVisits: salesMap[cusCode]?.visits || Number(r.visitCount || 0),
      totalSales: salesMap[cusCode]?.totalSales || Number(r.totalPurchase || 0),
      lastVisit: salesMap[cusCode]?.lastVisit || lastVisitDate,
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

  const sorted = sortCustomers(filtered, sortBy, sortOrder);
  const total = sorted.length;
  const maxExport = 20000;
  const pageLimit = exportAll ? Math.min(total, maxExport) : Math.min(limit, 100);
  const customers = exportAll
    ? sorted.slice(0, maxExport)
    : sorted.slice((page - 1) * pageLimit, page * pageLimit);

  const nowYM = new Date().toISOString().slice(0, 7);
  const monthCodes = new Set(
    salesSnap.docs
      .filter(d => String(d.data().date || '').startsWith(nowYM))
      .map(d => d.data().cusCode as string),
  );
  const newCodes = new Set(
    snap
      .filter(d => {
        const wd = String(d.data().joinDate || d.data().writeDate || '');
        return normDateYMD(wd).startsWith(nowYM);
      })
      .map(d => d.data().cusCode as string),
  );
  const totalSalesSum = salesSnap.docs.reduce((s, d) => s + Number(d.data().totalSale || 0), 0);
  const totalVisitsSum = salesSnap.docs.reduce((s, d) => s + Number(d.data().visitCount || 1), 0);

  return {
    customers,
    total,
    page,
    stats: {
      totalCustomers: allRows.length,
      monthlyVisitors: monthCodes.size,
      newCustomers: newCodes.size,
      avgSpend: totalVisitsSum > 0 ? Math.round(totalSalesSum / totalVisitsSum) : 0,
    },
    grades: [...new Set(allRows.map(c => c.grade).filter(Boolean))].sort(),
  };
}
