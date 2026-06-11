import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { canDecryptCustomerPII } from '@/lib/customerDecryptAuth';
import { enqueueChurnRetentionMessages } from '@/lib/customerChurnScore.server';

interface ChurnQueueBody {
  storeId?: string;
  cusCode?: string;
  cusCodes?: string[];
}

export async function POST(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: ChurnQueueBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const storeId = String(body.storeId || '').trim();
  if (!storeId) {
    return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  }

  const auth = await canDecryptCustomerPII(user.uid, user.email, storeId);
  if (!auth.allowed) {
    return NextResponse.json({ error: '발송 권한이 없습니다 (관리자/master만 허용)' }, { status: 403 });
  }

  const codes = [
    ...(body.cusCodes || []),
    ...(body.cusCode ? [body.cusCode] : []),
  ].map(c => String(c).trim()).filter(Boolean);

  if (!codes.length) {
    return NextResponse.json({ error: 'cusCode 또는 cusCodes 필요' }, { status: 400 });
  }

  try {
    const result = await enqueueChurnRetentionMessages(storeId, codes);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
