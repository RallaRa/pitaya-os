import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { adminDb } from '@/lib/firebase/admin';
import { closePoll, getMessengerPoll } from '@/lib/messenger/polls.server';

export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ pollId: string }> };

/** GET /api/messenger/polls/[pollId]?storeId= */
export async function GET(req: Request, ctx: RouteCtx) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { pollId } = await ctx.params;
  const storeId = new URL(req.url).searchParams.get('storeId') || '';
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  try {
    const poll = await getMessengerPoll(storeId, pollId);
    if (!poll) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const ballot = await adminDb.collection('polls').doc(pollId).collection('ballots').doc(user.uid).get();
    return NextResponse.json({
      ok: true,
      poll,
      hasVoted: ballot.exists,
      myOptionIndex: ballot.exists ? ballot.data()?.optionIndex : null,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** PUT /api/messenger/polls/[pollId] — 수동 종료 */
export async function PUT(req: Request, ctx: RouteCtx) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { pollId } = await ctx.params;
  try {
    const body = await req.json();
    const storeId = String(body.storeId || '');
    if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

    const poll = await closePoll(storeId, pollId, user.email || '사용자');
    return NextResponse.json({ ok: true, poll });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
