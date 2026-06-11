'use client';

import { overlay } from '@/components/overlay';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { BarChart3, Loader2, Square } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase/firebase';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import type { MessengerPoll } from '@/lib/messenger/pollTypes';
import { POLL_TYPE_LABELS } from '@/lib/messenger/pollTypes';

interface PollCardProps {
  pollId: string;
  storeId: string;
  title: string;
  subtitle?: string;
  footer?: string;
  isMine?: boolean;
}

function pollFromDoc(id: string, data: Record<string, unknown>): MessengerPoll {
  return {
    id,
    storeId: String(data.storeId || ''),
    roomId: String(data.roomId || ''),
    messageId: data.messageId ? String(data.messageId) : undefined,
    question: String(data.question || ''),
    type: (data.type || 'multiple') as MessengerPoll['type'],
    options: Array.isArray(data.options) ? data.options.map(String) : [],
    isAnonymous: !!data.isAnonymous,
    endsAt: String(data.endsAt || ''),
    voteCounts: (data.voteCounts || {}) as MessengerPoll['voteCounts'],
    totalVotes: Number(data.totalVotes || 0),
    createdBy: String(data.createdBy || ''),
    createdByName: data.createdByName ? String(data.createdByName) : undefined,
    status: (data.status || 'open') as MessengerPoll['status'],
    createdAt: undefined,
  };
}

export default function PollCard({ pollId, storeId, title, subtitle, footer }: PollCardProps) {
  const { user } = useAuth();
  const [poll, setPoll] = useState<MessengerPoll | null>(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [myOptionIndex, setMyOptionIndex] = useState<number | null>(null);
  const [voting, setVoting] = useState(false);
  const [closing, setClosing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!pollId) return;
    const unsub = onSnapshot(doc(db, 'polls', pollId), snap => {
      if (snap.exists()) {
        setPoll(pollFromDoc(snap.id, snap.data() as Record<string, unknown>));
      }
      setLoading(false);
    });
    return () => unsub();
  }, [pollId]);

  useEffect(() => {
    if (!storeId || !pollId) return;
    getAuthJsonHeaders()
      .then(headers => fetch(`/api/messenger/polls/${pollId}?storeId=${encodeURIComponent(storeId)}`, { headers }))
      .then(r => r.json())
      .then(d => {
        if (d.ok) {
          setHasVoted(!!d.hasVoted);
          setMyOptionIndex(typeof d.myOptionIndex === 'number' ? d.myOptionIndex : null);
        }
      })
      .catch(() => {});
  }, [pollId, storeId, poll?.totalVotes, poll?.status]);

  const maxCount = useMemo(() => {
    if (!poll) return 1;
    return Math.max(1, ...poll.options.map((_, i) => poll.voteCounts[String(i)] || 0));
  }, [poll]);

  const isOpen = poll?.status === 'open' && new Date(poll.endsAt).getTime() > Date.now();
  const canVote = isOpen && !hasVoted;
  const isCreator = !!user?.uid && poll?.createdBy === user.uid;

  const handleVote = useCallback(async (optionIndex: number) => {
    if (!storeId || !pollId || voting || !canVote) return;
    setVoting(true);
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch(`/api/messenger/polls/${pollId}/vote`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ storeId, optionIndex }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setHasVoted(true);
      setMyOptionIndex(optionIndex);
    } catch (e: unknown) {
      await overlay.alert(e instanceof Error ? e.message : '투표 실패');
    } finally {
      setVoting(false);
    }
  }, [canVote, pollId, storeId, voting]);

  const handleClose = useCallback(async () => {
    if (!storeId || !pollId || closing || !isOpen) return;
    if (!confirm('투표를 지금 종료할까요?')) return;
    setClosing(true);
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch(`/api/messenger/polls/${pollId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ storeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      overlay.toast('투표를 종료했습니다.', { variant: 'success' });
    } catch (e: unknown) {
      await overlay.alert(e instanceof Error ? e.message : '종료 실패');
    } finally {
      setClosing(false);
    }
  }, [closing, isOpen, pollId, storeId]);

  if (loading || !poll) {
    return (
      <div className="min-w-[240px] p-4 flex items-center gap-2 text-slate-400 text-xs">
        <Loader2 className="w-4 h-4 animate-spin" /> 투표 불러오는 중…
      </div>
    );
  }

  return (
    <div className="min-w-[240px] max-w-[320px] rounded-xl border-l-4 border-violet-500/60 bg-slate-900/90 border border-slate-700 overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-800/80">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[10px] uppercase tracking-wide text-violet-400 font-semibold flex items-center gap-1">
            <BarChart3 className="w-3 h-3" /> {POLL_TYPE_LABELS[poll.type]} · {isOpen ? '진행중' : '종료'}
          </p>
          {isOpen && isCreator && (
            <button
              type="button"
              disabled={closing}
              onClick={handleClose}
              className="text-[10px] text-slate-400 hover:text-red-400 inline-flex items-center gap-0.5 disabled:opacity-50"
              title="투표 종료"
            >
              <Square className="w-3 h-3" /> 종료
            </button>
          )}
        </div>
        <p className="text-sm font-semibold text-slate-100 mt-0.5">{title || poll.question}</p>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>

      <div className="px-3 py-2 space-y-2">
        {poll.options.map((opt, i) => {
          const count = poll.voteCounts[String(i)] || 0;
          const pct = poll.totalVotes ? Math.round((count / poll.totalVotes) * 100) : 0;
          const width = `${Math.round((count / maxCount) * 100)}%`;
          const selected = myOptionIndex === i;
          return (
            <div key={`${opt}-${i}`}>
              {canVote ? (
                <button
                  type="button"
                  disabled={voting}
                  onClick={() => handleVote(i)}
                  className="w-full text-left mb-1 px-2 py-1.5 rounded-lg border border-slate-700 hover:border-violet-500 text-xs text-slate-200 disabled:opacity-50"
                >
                  {opt}
                </button>
              ) : (
                <div className="flex justify-between text-[11px] mb-0.5">
                  <span className={selected ? 'text-violet-300 font-medium' : 'text-slate-300'}>{opt}</span>
                  <span className="text-slate-500">{count}표 ({pct}%)</span>
                </div>
              )}
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${selected ? 'bg-violet-500' : 'bg-teal-600/80'}`}
                  style={{ width: poll.totalVotes ? width : '0%' }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <p className="px-3 pb-3 text-[10px] text-slate-500">
        {footer || `총 ${poll.totalVotes}표`}
        {poll.isAnonymous ? ' · 익명' : ' · 기명'}
        {isOpen && poll.totalVotes > 0 ? ' · 실시간 집계' : ''}
      </p>
    </div>
  );
}
