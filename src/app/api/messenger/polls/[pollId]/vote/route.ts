import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { castPollVote } from '@/lib/messenger/polls.server';

export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ pollId: string }> };

/** POST /api/messenger/polls/[pollId]/vote */
export async function POST(req: Request, ctx: RouteCtx) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { pollId } = await ctx.params;
  try {
    const body = await req.json();
    const storeId = String(body.storeId || '');
    const optionIndex = Number(body.optionIndex);
    if (!storeId || Number.isNaN(optionIndex)) {
      return NextResponse.json({ error: 'storeId, optionIndex required' }, { status: 400 });
    }

    const poll = await castPollVote(
      storeId,
      pollId,
      optionIndex,
      { uid: user.uid, name: user.email || '사용자' },
    );
    return NextResponse.json({ ok: true, poll });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
