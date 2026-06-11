import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { createMessengerPoll } from '@/lib/messenger/polls.server';
import type { PollType } from '@/lib/messenger/pollTypes';
import { POLL_TYPES } from '@/lib/messenger/pollTypes';

export const dynamic = 'force-dynamic';

/** POST /api/messenger/polls — 채팅방 투표 생성 */
export async function POST(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const storeId = String(body.storeId || '');
    const roomId = String(body.roomId || '');
    const question = String(body.question || '').trim();
    const type = String(body.type || 'multiple') as PollType;
    const endsAt = String(body.endsAt || '');

    if (!storeId || !roomId || !question || !endsAt) {
      return NextResponse.json({ error: 'storeId, roomId, question, endsAt required' }, { status: 400 });
    }
    if (!POLL_TYPES.includes(type)) {
      return NextResponse.json({ error: 'invalid poll type' }, { status: 400 });
    }

    const poll = await createMessengerPoll(
      {
        storeId,
        roomId,
        question,
        type,
        options: Array.isArray(body.options) ? body.options.map(String) : undefined,
        isAnonymous: !!body.isAnonymous,
        endsAt,
      },
      { uid: user.uid, name: user.email || '사용자' },
    );
    return NextResponse.json({ ok: true, poll });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
