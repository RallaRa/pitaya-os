import { NextResponse } from 'next/server';
import { verifyToken, getActualGroupId, isAdminGroup } from '@/lib/authVerify';
import { runCouponAiChat } from '@/lib/coupons/aiCouponChat';
import type { CouponDraft } from '@/lib/coupons/types';

export const maxDuration = 60;

export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: {
    storeId?: string;
    message?: string;
    history?: { role: string; content: string }[];
    draft?: Partial<CouponDraft>;
    storeName?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { storeId, message, history, draft, storeName } = body;
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  if (!message?.trim()) return NextResponse.json({ error: 'message required' }, { status: 400 });

  const groupId = await getActualGroupId(authUser.uid, storeId);
  if (!isAdminGroup(groupId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const result = await runCouponAiChat({
      message: message.trim(),
      history: history || [],
      currentDraft: draft,
      storeName,
    });
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'AI 오류';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
