import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { queryCustomers, type CustomerSortField } from '@/lib/customerQuery';

const SORT_FIELDS: CustomerSortField[] = [
  'cusCode', 'point', 'totalPurchase', 'visitCount', 'joinDate', 'lastVisitDate', 'grade',
];

// GET /api/customers?storeId=...&grade=...&search=...&joinFrom=...&joinTo=...&visitFrom=...&visitTo=...&sortBy=...&sortOrder=...&page=...&limit=...&exportAll=1
export async function GET(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  const sortByParam = searchParams.get('sortBy') || 'lastVisitDate';
  const sortBy = SORT_FIELDS.includes(sortByParam as CustomerSortField)
    ? (sortByParam as CustomerSortField)
    : 'lastVisitDate';
  const sortOrder = searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc';
  const exportAll = searchParams.get('exportAll') === '1';

  try {
    const result = await queryCustomers({
      storeId,
      grade: searchParams.get('grade') || '',
      search: searchParams.get('search') || '',
      joinFrom: searchParams.get('joinFrom') || '',
      joinTo: searchParams.get('joinTo') || '',
      visitFrom: searchParams.get('visitFrom') || '',
      visitTo: searchParams.get('visitTo') || '',
      sortBy,
      sortOrder,
      page: Math.max(1, Number(searchParams.get('page') || '1')),
      limit: Math.min(100, Number(searchParams.get('limit') || '50')),
      exportAll,
    });

    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error';
    console.error('[customers GET]', e);
    if (msg.includes('FIREBASE_SERVICE_ACCOUNT_KEY') || msg.includes('Unexpected token')) {
      return NextResponse.json({ error: '서버 Firebase 설정 오류 (FIREBASE_SERVICE_ACCOUNT_KEY 확인)' }, { status: 503 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
