import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { canDecryptCustomerPII } from '@/lib/customerDecryptAuth';
import { updateStoreCustomerGrades } from '@/lib/customerGrade.server';

const DEFAULT_STORE = 'STR-1779194754785';

/** POST /api/customers/grade-update — 전체 등급 재산정 */
export async function POST(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let storeId = DEFAULT_STORE;
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.storeId) storeId = String(body.storeId);
  } catch { /* empty body ok */ }

  const auth = await canDecryptCustomerPII(user.uid, user.email, storeId);
  if (!auth.allowed) {
    return NextResponse.json({ error: '관리자/master 권한이 필요합니다' }, { status: 403 });
  }

  try {
    const result = await updateStoreCustomerGrades(storeId);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
