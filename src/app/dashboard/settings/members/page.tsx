'use client';

import { useState, useEffect } from 'react';
import { useStore } from '@/context/StoreContext';
import { UserCheck, UserX, Loader2, Users, Clock } from 'lucide-react';

interface Member {
  mapId: string;
  uid: string;
  role: string;
  status: string;
  name?: string;
  email?: string;
  photoURL?: string;
  appliedAt?: any;
}

export default function MembersPage() {
  const { currentStore } = useStore();
  const [pendingMembers, setPendingMembers] = useState<Member[]>([]);
  const [activeMembers, setActiveMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState('');

  const fetchMembers = async () => {
    if (!currentStore?.storeId) return;
    setIsLoading(true);
    try {
      const [pendingRes, activeRes] = await Promise.all([
        fetch(`/api/store?storeId=${currentStore.storeId}&status=pending`),
        fetch(`/api/store?storeId=${currentStore.storeId}&status=active`),
      ]);
      const pendingData = await pendingRes.json();
      const activeData = await activeRes.json();
      setPendingMembers(pendingData.members || []);
      setActiveMembers(activeData.members || []);
    } catch {
      setError('멤버 목록을 불러오지 못했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchMembers(); }, [currentStore?.storeId]);

  const handleAction = async (targetUid: string, action: 'approve' | 'reject') => {
    if (!currentStore?.storeId) return;
    setActionLoading(targetUid);
    setError('');
    try {
      const res = await fetch('/api/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, targetUid, storeId: currentStore.storeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await fetchMembers();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActionLoading(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 text-teal-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-teal-400">멤버 관리</h1>
        <p className="text-slate-400 text-sm mt-1">
          {currentStore?.storeName} 매장의 소속 신청을 승인하거나 거절합니다.
        </p>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-500/30 rounded-xl p-4 mb-6 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* 승인 대기 중 */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-4 h-4 text-yellow-400" />
          <h2 className="text-base font-bold text-white">승인 대기</h2>
          {pendingMembers.length > 0 && (
            <span className="bg-yellow-500/20 text-yellow-400 text-xs font-bold px-2 py-0.5 rounded-full">
              {pendingMembers.length}
            </span>
          )}
        </div>

        {pendingMembers.length === 0 ? (
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 text-center">
            <p className="text-slate-500 text-sm">대기 중인 소속 신청이 없습니다.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendingMembers.map(member => (
              <div
                key={member.uid}
                className="bg-slate-900 border border-slate-700 rounded-xl p-4 flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {member.photoURL ? (
                    <img src={member.photoURL} alt="" className="w-10 h-10 rounded-full flex-shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0">
                      <span className="text-slate-400 text-sm font-bold">
                        {(member.name || member.email || '?')[0].toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-white font-bold text-sm truncate">{member.name || '이름 없음'}</p>
                    <p className="text-slate-400 text-xs truncate">{member.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleAction(member.uid, 'reject')}
                    disabled={actionLoading === member.uid}
                    className="flex items-center gap-1 bg-red-900/30 hover:bg-red-900/50 border border-red-500/30 hover:border-red-500/60 text-red-400 px-3 py-2 rounded-lg text-sm transition-all"
                  >
                    {actionLoading === member.uid
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <UserX className="w-3.5 h-3.5" />
                    }
                    거절
                  </button>
                  <button
                    onClick={() => handleAction(member.uid, 'approve')}
                    disabled={actionLoading === member.uid}
                    className="flex items-center gap-1 bg-teal-900/30 hover:bg-teal-900/50 border border-teal-500/30 hover:border-teal-500/60 text-teal-400 px-3 py-2 rounded-lg text-sm transition-all"
                  >
                    {actionLoading === member.uid
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <UserCheck className="w-3.5 h-3.5" />
                    }
                    승인
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 활성 멤버 */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-4 h-4 text-teal-400" />
          <h2 className="text-base font-bold text-white">현재 멤버</h2>
          <span className="bg-teal-500/20 text-teal-400 text-xs font-bold px-2 py-0.5 rounded-full">
            {activeMembers.length}
          </span>
        </div>

        {activeMembers.length === 0 ? (
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 text-center">
            <p className="text-slate-500 text-sm">활성 멤버가 없습니다.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {activeMembers.map(member => (
              <div
                key={member.uid}
                className="bg-slate-900 border border-slate-700 rounded-xl p-4 flex items-center gap-3"
              >
                {member.photoURL ? (
                  <img src={member.photoURL} alt="" className="w-9 h-9 rounded-full flex-shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0">
                    <span className="text-slate-400 text-sm font-bold">
                      {(member.name || member.email || '?')[0].toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-white font-bold text-sm truncate">{member.name || '이름 없음'}</p>
                  <p className="text-slate-400 text-xs truncate">{member.email}</p>
                </div>
                <span className="text-xs text-slate-400 bg-slate-800 px-2 py-1 rounded-lg flex-shrink-0">
                  {member.role === 'owner' ? '대표' : '직원'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
