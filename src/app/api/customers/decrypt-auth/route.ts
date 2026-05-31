import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { canDecryptCustomerPII } from '@/lib/customerDecryptAuth';

/** GET — 고객 PII 복호화 UI/API 권한 (서버 기준) */
export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) {
    return NextResponse.json({ allowed: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';

  const auth = await canDecryptCustomerPII(authUser.uid, authUser.email, storeId);
  return NextResponse.json({
    allowed: auth.allowed,
    groupId: auth.groupId,
    email: auth.email,
  });
}
