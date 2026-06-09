import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { canDecryptCustomerPII } from '@/lib/customerDecryptAuth';
import {
  dismissIdentity,
  getIdentityById,
  linkIdentityToCustomer,
} from '@/lib/publicOrderIdentity';

export const dynamic = 'force-dynamic';

/** PATCH — 기존 회원 연결 또는 무시 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  let body: { storeId?: string; action?: 'link' | 'dismiss'; cusCode?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const storeId = body.storeId || '';
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  const auth = await canDecryptCustomerPII(user.uid, user.email, storeId);
  if (!auth.allowed) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 });
  }

  try {
    if (body.action === 'dismiss') {
      await dismissIdentity(id, storeId, user.uid);
      return NextResponse.json({ ok: true });
    }

    const cusCode = (body.cusCode || '').trim();
    if (!cusCode) {
      return NextResponse.json({ error: 'cusCode required' }, { status: 400 });
    }

    await linkIdentityToCustomer({
      identityId: id,
      storeId,
      cusCode,
      uid: user.uid,
    });

    const identity = await getIdentityById(id);
    return NextResponse.json({ ok: true, identity });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

/** GET — 단건 조회 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const storeId = new URL(req.url).searchParams.get('storeId') || '';
  const { id } = await params;
  const identity = await getIdentityById(id);
  if (!identity || identity.storeId !== storeId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ identity });
}
