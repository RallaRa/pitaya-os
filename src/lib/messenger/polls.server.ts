import { adminDb } from '@/lib/firebase/admin';
import { FieldValue, type DocumentData } from 'firebase-admin/firestore';
import { postMessengerCard } from '@/lib/messenger/channels.server';
import {
  buildPollResultFields,
  defaultOptionsForType,
  type MessengerPoll,
  type PollInput,
  type PollStatus,
  type PollType,
  pollOptionKeys,
} from '@/lib/messenger/pollTypes';
import { cardPreviewText } from '@/lib/messenger/types';

const COL = 'polls';

function tsToIso(v: unknown): string | undefined {
  if (!v) return undefined;
  if (typeof v === 'object' && v !== null && 'toDate' in v) {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  return String(v);
}

function pollFromSnap(id: string, data: DocumentData): MessengerPoll {
  return {
    id,
    storeId: String(data.storeId || ''),
    roomId: String(data.roomId || ''),
    messageId: data.messageId ? String(data.messageId) : undefined,
    question: String(data.question || ''),
    type: (data.type || 'multiple') as PollType,
    options: Array.isArray(data.options) ? data.options.map(String) : [],
    isAnonymous: !!data.isAnonymous,
    endsAt: String(data.endsAt || ''),
    voteCounts: (data.voteCounts || {}) as MessengerPoll['voteCounts'],
    totalVotes: Number(data.totalVotes || 0),
    createdBy: String(data.createdBy || ''),
    createdByName: data.createdByName ? String(data.createdByName) : undefined,
    status: (data.status || 'open') as PollStatus,
    closedAt: tsToIso(data.closedAt),
    createdAt: tsToIso(data.createdAt),
  };
}

function initVoteCounts(options: string[]): Record<string, number> {
  return Object.fromEntries(pollOptionKeys(options).map(k => [k, 0]));
}

export async function getMessengerPoll(storeId: string, pollId: string): Promise<MessengerPoll | null> {
  const snap = await adminDb.collection(COL).doc(pollId).get();
  if (!snap.exists) return null;
  const poll = pollFromSnap(snap.id, snap.data()!);
  if (poll.storeId !== storeId) return null;
  return poll;
}

export async function createMessengerPoll(
  input: PollInput,
  actor: { uid: string; name: string },
): Promise<MessengerPoll> {
  const options = defaultOptionsForType(input.type, input.options);
  if (options.length < 2) throw new Error('선택지는 2개 이상 필요합니다');

  const ref = adminDb.collection(COL).doc();
  const payload = {
    storeId: input.storeId,
    roomId: input.roomId,
    question: input.question.trim(),
    type: input.type,
    options,
    isAnonymous: !!input.isAnonymous,
    endsAt: input.endsAt,
    voteCounts: initVoteCounts(options),
    totalVotes: 0,
    createdBy: actor.uid,
    createdByName: actor.name,
    status: 'open',
    createdAt: FieldValue.serverTimestamp(),
  };
  await ref.set(payload);

  const preview = cardPreviewText('poll', { title: input.question });
  const msgRef = await adminDb.collection('chat_messages').add({
    roomId: input.roomId,
    senderUid: actor.uid,
    senderName: actor.name,
    text: preview,
    type: 'poll',
    pollId: ref.id,
    cardData: {
      title: input.question,
      subtitle: input.isAnonymous ? '익명 투표' : '기명 투표',
      footer: `마감: ${input.endsAt.slice(0, 16).replace('T', ' ')}`,
    },
    createdAt: FieldValue.serverTimestamp(),
    readBy: [actor.uid],
  });

  await ref.update({ messageId: msgRef.id });

  const roomDoc = await adminDb.collection('chat_rooms').doc(input.roomId).get();
  const members: string[] = roomDoc.data()?.members || [];
  const roomUpdate: Record<string, unknown> = {
    lastMessage: preview,
    lastMessageAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  members.forEach(uid => {
    if (uid !== actor.uid) {
      roomUpdate[`unreadCount.${uid}`] = FieldValue.increment(1);
    }
  });
  await adminDb.collection('chat_rooms').doc(input.roomId).update(roomUpdate);

  const snap = await ref.get();
  return pollFromSnap(snap.id, snap.data()!);
}

export async function castPollVote(
  storeId: string,
  pollId: string,
  optionIndex: number,
  actor: { uid: string; name: string },
): Promise<MessengerPoll> {
  const poll = await getMessengerPoll(storeId, pollId);
  if (!poll) throw new Error('투표를 찾을 수 없습니다');
  if (poll.status !== 'open') throw new Error('종료된 투표입니다');
  if (new Date(poll.endsAt).getTime() <= Date.now()) {
    await closePoll(storeId, pollId, 'system');
    throw new Error('마감된 투표입니다');
  }
  if (optionIndex < 0 || optionIndex >= poll.options.length) {
    throw new Error('잘못된 선택지입니다');
  }

  const ballotRef = adminDb.collection(COL).doc(pollId).collection('ballots').doc(actor.uid);
  const ballotSnap = await ballotRef.get();
  if (ballotSnap.exists) throw new Error('이미 투표했습니다');

  const key = String(optionIndex);
  await adminDb.runTransaction(async tx => {
    const pRef = adminDb.collection(COL).doc(pollId);
    const pSnap = await tx.get(pRef);
    if (!pSnap.exists) throw new Error('투표를 찾을 수 없습니다');
    const data = pSnap.data()!;
    if (data.status !== 'open') throw new Error('종료된 투표입니다');

    tx.set(ballotRef, {
      optionIndex,
      optionLabel: poll.options[optionIndex],
      voterName: poll.isAnonymous ? null : actor.name,
      votedAt: FieldValue.serverTimestamp(),
    });
    tx.update(pRef, {
      [`voteCounts.${key}`]: FieldValue.increment(1),
      totalVotes: FieldValue.increment(1),
    });
  });

  const updated = await getMessengerPoll(storeId, pollId);
  if (!updated) throw new Error('투표 반영 실패');
  return updated;
}

export async function closePoll(
  storeId: string,
  pollId: string,
  actorName: string,
): Promise<MessengerPoll> {
  const poll = await getMessengerPoll(storeId, pollId);
  if (!poll) throw new Error('투표를 찾을 수 없습니다');
  if (poll.status === 'closed') return poll;

  await adminDb.collection(COL).doc(pollId).update({
    status: 'closed',
    closedAt: FieldValue.serverTimestamp(),
  });

  const closed = await getMessengerPoll(storeId, pollId);
  if (!closed) throw new Error('종료 처리 실패');

  const winnerIdx = closed.options.reduce((best, _opt, i) => {
    const count = closed.voteCounts[String(i)] || 0;
    const bestCount = closed.voteCounts[String(best)] || 0;
    return count > bestCount ? i : best;
  }, 0);

  await postMessengerCard({
    roomId: closed.roomId,
    type: 'poll',
    text: `📊 투표 종료: ${closed.question}`,
    cardData: {
      title: `📊 투표 종료: ${closed.question}`,
      subtitle: `총 ${closed.totalVotes}표 · ${actorName}`,
      fields: buildPollResultFields(closed),
      footer: closed.totalVotes
        ? `1위: ${closed.options[winnerIdx]} (${closed.voteCounts[String(winnerIdx)] || 0}표)`
        : '참여 없음',
    },
  });

  return closed;
}

export async function runExpiredPollClosures(): Promise<{ closed: number }> {
  const nowIso = new Date().toISOString();
  const snap = await adminDb.collection(COL)
    .where('status', '==', 'open')
    .where('endsAt', '<=', nowIso)
    .limit(50)
    .get();

  let closed = 0;
  for (const doc of snap.docs) {
    const poll = pollFromSnap(doc.id, doc.data());
    try {
      await closePoll(poll.storeId, poll.id, '자동 마감');
      closed += 1;
    } catch (e) {
      console.error('[polls] close expired:', poll.id, e);
    }
  }
  return { closed };
}
