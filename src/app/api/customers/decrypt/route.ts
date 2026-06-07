import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyToken } from '@/lib/authVerify';
import { canDecryptCustomerPII } from '@/lib/customerDecryptAuth';
import { verifyPiiUnlockToken } from '@/lib/piiStepUp/unlockToken';
import { fetchCustomerPiiBulk } from '@/lib/customerPii';
import { queryCustomers, type CustomerQueryParams } from '@/lib/customerQuery';

export interface DecryptedCustomerRow {
  cusCode: string;
  name: string;
  phone: string;
  birth: string;
  cusGubun: string;
  cusClass: string;
  grade: string;
  point: number;
  totalPurchase: number;
  visitCount: number;
  joinDate: string;
  lastVisitDate: string;
  avgCycleDays: number | null;
  daysSinceLastVisit: number | null;
  expectedNextVisit: string | null;
  cycleStatus: string;
  cycleStatusLabel: string;
}

// POST /api/customers/decrypt
// Body: { storeId, ...CustomerQueryParams filters } — 현재 필터 기준 전체 복호화
export async function POST(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: CustomerQueryParams & { storeId?: string; stepUpToken?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { storeId, stepUpToken: bodyToken, ...filters } = body;
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  const auth = await canDecryptCustomerPII(user.uid, user.email, storeId);
  if (!auth.allowed) {
    return NextResponse.json({ error: '복호화 권한이 없습니다 (관리자/master만 허용)' }, { status: 403 });
  }

  const stepUpToken = req.headers.get('x-pii-unlock-token') || bodyToken;
  if (!verifyPiiUnlockToken(stepUpToken, user.uid, storeId)) {
    return NextResponse.json(
      { error: '본인 확인(지문 또는 휴대폰 승인)이 필요합니다', code: 'STEP_UP_REQUIRED' },
      { status: 403 },
    );
  }

  try {
    const queryResult = await queryCustomers({
      storeId,
      ...filters,
      exportAll: true,
      page: 1,
      limit: 20000,
    });

    const cusCodes = queryResult.customers.map(c => c.cusCode);
    const decryptedMap = await fetchCustomerPiiBulk(storeId, cusCodes);

    const customers: DecryptedCustomerRow[] = queryResult.customers.map(row => {
      const pii = decryptedMap.get(row.cusCode) || { name: '', phone: '', birth: '' };
      return {
        cusCode: row.cusCode,
        name: pii.name,
        phone: pii.phone,
        birth: pii.birth,
        cusGubun: row.cusGubun,
        cusClass: row.cusClass,
        grade: row.grade,
        point: row.point,
        totalPurchase: row.totalSales || row.totalPurchase,
        visitCount: row.distinctVisitDays || row.totalVisits || row.visitCount,
        joinDate: (row.joinDate || row.writeDate || '').slice(0, 10),
        lastVisitDate: (row.lastVisit || row.lastVisitDate || '').slice(0, 10),
        avgCycleDays: row.avgCycleDays,
        daysSinceLastVisit: row.daysSinceLastVisit,
        expectedNextVisit: row.expectedNextVisit?.slice(0, 10) || '',
        cycleStatus: row.cycleStatus,
        cycleStatusLabel: row.cycleStatusLabel,
      };
    });

    const filterSnapshot = {
      grade: filters.grade || '',
      search: filters.search || '',
      joinFrom: filters.joinFrom || '',
      joinTo: filters.joinTo || '',
      visitFrom: filters.visitFrom || '',
      visitTo: filters.visitTo || '',
      cycleStatus: filters.cycleStatus || '',
      visitTrend: filters.visitTrend || '',
      sortBy: filters.sortBy || 'lastVisitDate',
      sortOrder: filters.sortOrder || 'desc',
    };

    const logRef = await adminDb.collection('customer_decrypt_logs').add({
      storeId,
      action: 'bulk_decrypt',
      requestedBy: user.uid,
      requestedByEmail: auth.email,
      groupId: auth.groupId,
      customerCount: customers.length,
      filters: filterSnapshot,
      decryptedFields: ['name', 'phone', 'birth'],
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      logId: logRef.id,
      customers,
      total: customers.length,
      filteredTotal: queryResult.total,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
