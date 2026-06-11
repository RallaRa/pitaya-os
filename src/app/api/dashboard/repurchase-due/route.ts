import { NextResponse } from 'next/server';
import { verifyToken, isActiveStoreMember, canManageStore } from '@/lib/authVerify';
import { fetchRepurchaseDueCustomers } from '@/lib/pos/repurchaseCycle.server';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const storeId = new URL(req.url).searchParams.get('storeId');
  if (!storeId) return NextResponse.json({ error: 'storeId 필요' }, { status: 400 });

  const member = await isActiveStoreMember(authUser.uid, storeId);
  if (!member && !await canManageStore(authUser.uid, storeId, authUser.email)) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 });
  }

  try {
    const data = await fetchRepurchaseDueCustomers(storeId);
    return NextResponse.json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'repurchase-due failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
