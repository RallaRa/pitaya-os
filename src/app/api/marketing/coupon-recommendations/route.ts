import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { canDecryptCustomerPII } from '@/lib/customerDecryptAuth';
import { verifyPiiUnlockToken } from '@/lib/piiStepUp/unlockToken';
import { buildMarketingRecommendations } from '@/lib/marketing/couponRecommendation.server';

export const dynamic = 'force-dynamic';

/** GET /api/marketing/coupon-recommendations?storeId= — 마스킹 미리보기 */
export async function GET(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  try {
    const result = await buildMarketingRecommendations(storeId, { includePii: false });
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[marketing/coupon-recommendations] GET:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** POST /api/marketing/coupon-recommendations — 지문 승인 후 이름·전화번호 포함 */
export async function POST(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { storeId?: string; stepUpToken?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const storeId = body.storeId || '';
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  const auth = await canDecryptCustomerPII(user.uid, user.email, storeId);
  if (!auth.allowed) {
    return NextResponse.json({ error: '복호화 권한이 없습니다 (관리자/master만 허용)' }, { status: 403 });
  }

  const stepUpToken = req.headers.get('x-pii-unlock-token') || body.stepUpToken;
  if (!verifyPiiUnlockToken(stepUpToken, user.uid, storeId)) {
    return NextResponse.json(
      { error: '본인 확인(지문 또는 휴대폰 승인)이 필요합니다', code: 'STEP_UP_REQUIRED' },
      { status: 403 },
    );
  }

  try {
    const result = await buildMarketingRecommendations(storeId, { includePii: true });
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[marketing/coupon-recommendations] POST:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
