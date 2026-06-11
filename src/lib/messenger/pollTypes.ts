export const POLL_TYPES = ['multiple', 'yesno', 'date'] as const;
export type PollType = (typeof POLL_TYPES)[number];

export const POLL_TYPE_LABELS: Record<PollType, string> = {
  multiple: '객관식',
  yesno: '찬반',
  date: '날짜선택',
};

export type PollStatus = 'open' | 'closed';

export interface PollVoteCounts {
  [optionKey: string]: number;
}

export interface MessengerPoll {
  id: string;
  storeId: string;
  roomId: string;
  messageId?: string;
  question: string;
  type: PollType;
  options: string[];
  isAnonymous: boolean;
  endsAt: string;
  voteCounts: PollVoteCounts;
  totalVotes: number;
  createdBy: string;
  createdByName?: string;
  status: PollStatus;
  closedAt?: string;
  createdAt?: string;
}

export interface PollInput {
  storeId: string;
  roomId: string;
  question: string;
  type: PollType;
  options?: string[];
  isAnonymous?: boolean;
  endsAt: string;
}

export function defaultOptionsForType(type: PollType, options?: string[]): string[] {
  if (type === 'yesno') return ['찬성', '반대'];
  if (type === 'date') return (options || []).filter(Boolean);
  return (options || []).filter(Boolean);
}

export function pollOptionKeys(options: string[]): string[] {
  return options.map((_, i) => String(i));
}

export function buildPollResultFields(poll: MessengerPoll): Array<{ label: string; value: string }> {
  const max = Math.max(1, ...poll.options.map((_, i) => poll.voteCounts[String(i)] || 0));
  return poll.options.map((opt, i) => {
    const count = poll.voteCounts[String(i)] || 0;
    const pct = poll.totalVotes ? Math.round((count / poll.totalVotes) * 100) : 0;
    const bar = '█'.repeat(Math.round((count / max) * 8));
    return { label: opt, value: `${bar} ${count}표 (${pct}%)` };
  });
}
