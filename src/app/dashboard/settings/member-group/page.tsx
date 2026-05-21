'use client';

import { useState, useEffect, useCallback } from 'react';
import { useStore } from '@/context/StoreContext';
import { useAuth } from '@/context/AuthContext';
import { UserCog, Loader2, Users, Check, Clock, ChevronDown } from 'lucide-react';

interface PermissionGroup {
  groupId: string;
  groupName: string;
  isSystem?: boolean;
}

interface StoreUser {
  uid: string;
  name: string;
  email: string;
  groupId: string;
  photoURL?: string;
}

const GROUP_COLORS: Record<string, string> = {
  '':       'bg-orange-500',
  master:   'bg-yellow-500',
  admin:    'bg-blue-500',
  user:     'bg-indigo-400',
  staff:    'bg-slate-400',
  guest:    'bg-slate-600',
};

function groupDot(groupId: string) {
  return GROUP_COLORS[groupId] ?? 'bg-teal-400';
}

export default function MemberGroupPage() {
  const { currentStore } = useStore();
  const { user } = useAuth();

  const [groups, setGroups] = useState<PermissionGroup[]>([]);
  const [storeUsers, setStoreUsers] = useState<StoreUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // uid → 'saving' | 'saved' | null
  const [rowState, setRowState] = useState<Record<string, 'saving' | 'saved'>>({});

  // ── 데이터 로드 ──
  const fetchAll = useCallback(async () => {
    if (!currentStore?.storeId) { setIsLoading(false); return; }
    setIsLoading(true);
    setError('');
    try {
      const [groupsRes, usersRes] = await Promise.all([
        fetch(`/api/permissions?type=groups&storeId=${currentStore.storeId}`),
        fetch(`/api/users?storeId=${currentStore.storeId}`),
      ]);
      const [groupsData, usersData] = await Promise.all([groupsRes.json(), usersRes.json()]);
      setGroups(groupsData.groups || []);
      setStoreUsers(usersData.users || []);
    } catch {
      setError('데이터를 불러오지 못했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [currentStore?.storeId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── 그룹 변경 (자동 저장) ──
  const handleGroupChange = async (uid: string, newGroupId: string) => {
    setRowState(prev => ({ ...prev, [uid]: 'saving' }));
    setError('');
    try {
      const res = await fetch('/api/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'assignGroup',
          uid,
          storeId: currentStore?.storeId,
          groupId: newGroupId,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setStoreUsers(prev => prev.map(u => u.uid === uid ? { ...u, groupId: newGroupId } : u));
      setRowState(prev => ({ ...prev, [uid]: 'saved' }));
      setTimeout(() => setRowState(prev => { const n = { ...prev }; delete n[uid]; return n; }), 2000);
    } catch (e: any) {
      setError(e.message);
      setRowState(prev => { const n = { ...prev }; delete n[uid]; return n; });
    }
  };

  // ── 정렬: 대기 → 그룹순 → 이름순 ──
  const groupOrder = (gid: string) => {
    if (!gid) return 0;
    const idx = ['master', 'admin', 'user', 'staff', 'guest'].indexOf(gid);
    return idx === -1 ? 10 : idx + 1;
  };

  const sortedUsers = [...storeUsers].sort((a, b) => {
    const go = groupOrder(a.groupId) - groupOrder(b.groupId);
    if (go !== 0) return go;
    return (a.name || '').localeCompare(b.name || '');
  });

  const pendingCount = storeUsers.filter(u => !u.groupId).length;
  const groupName = (gid: string) => {
    if (!gid) return '대기';
    return groups.find(g => g.groupId === gid)?.groupName || gid;
  };

  // ── Early returns ──
  if (!currentStore?.storeId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400">
        <UserCog className="w-12 h-12 mb-3 opacity-30" />
        <p className="text-sm">매장을 먼저 선택해주세요.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6">

      {/* 헤더 */}
      <div className="flex items-center gap-2 mb-2">
        <UserCog className="w-5 h-5 text-teal-400" />
        <h1 className="text-lg font-bold text-teal-400">멤버-그룹 연결</h1>
      </div>
      <p className="text-slate-400 text-sm mb-6">스토어 멤버에게 권한 그룹을 배정합니다.</p>

      {/* 요약 칩 */}
      {!isLoading && (
        <div className="flex flex-wrap gap-2 mb-6">
          <div className="flex items-center gap-1.5 bg-slate-800 rounded-full px-3 py-1.5 text-xs">
            <Users className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-300">전체 <strong className="text-white">{storeUsers.length}명</strong></span>
          </div>
          {pendingCount > 0 && (
            <div className="flex items-center gap-1.5 bg-orange-900/30 border border-orange-700/40 rounded-full px-3 py-1.5 text-xs">
              <Clock className="w-3.5 h-3.5 text-orange-400" />
              <span className="text-orange-300">대기 <strong className="text-orange-200">{pendingCount}명</strong></span>
            </div>
          )}
          {['master', 'admin', 'user', 'staff'].map(gid => {
            const cnt = storeUsers.filter(u => u.groupId === gid).length;
            if (!cnt) return null;
            return (
              <div key={gid} className="flex items-center gap-1.5 bg-slate-800 rounded-full px-3 py-1.5 text-xs">
                <span className={`w-2 h-2 rounded-full ${groupDot(gid)}`} />
                <span className="text-slate-300">{groupName(gid)} <strong className="text-white">{cnt}명</strong></span>
              </div>
            );
          })}
        </div>
      )}

      {error && (
        <div className="bg-red-900/30 border border-red-500/30 rounded-xl p-3 mb-4 text-red-400 text-xs">
          {error}
          <button className="ml-2 underline" onClick={() => setError('')}>닫기</button>
        </div>
      )}

      {/* 테이블 */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-7 h-7 text-teal-400 animate-spin" />
        </div>
      ) : sortedUsers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-500">
          <Users className="w-10 h-10 mb-3 opacity-30" />
          <p className="text-sm">소속 멤버가 없습니다.</p>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
          {/* 테이블 헤더 */}
          <div className="grid grid-cols-[1fr_1fr_180px_60px] gap-0 border-b border-slate-700 px-4 py-2.5 bg-slate-800/60">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">이름</span>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">이메일</span>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">그룹 배정</span>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider text-center">상태</span>
          </div>

          {/* 행 목록 */}
          <div className="divide-y divide-slate-800">
            {sortedUsers.map((u, idx) => {
              const state = rowState[u.uid];
              const isPending = !u.groupId;

              return (
                <div
                  key={u.uid}
                  className={`grid grid-cols-[1fr_1fr_180px_60px] items-center gap-0 px-4 py-3 transition-colors
                    ${isPending ? 'bg-orange-900/10' : idx % 2 === 0 ? '' : 'bg-slate-800/20'}`}
                >
                  {/* 이름 */}
                  <div className="flex items-center gap-2 min-w-0 pr-3">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${groupDot(u.groupId)}`} />
                    <span className="text-white text-sm font-medium truncate">{u.name || u.uid}</span>
                  </div>

                  {/* 이메일 */}
                  <div className="min-w-0 pr-3">
                    <span className="text-slate-400 text-xs truncate block">{u.email}</span>
                  </div>

                  {/* 그룹 드롭다운 */}
                  <div className="relative">
                    <select
                      value={u.groupId}
                      onChange={e => handleGroupChange(u.uid, e.target.value)}
                      disabled={state === 'saving'}
                      className={`w-full appearance-none rounded-lg px-3 py-1.5 pr-7 text-xs font-medium cursor-pointer focus:outline-none focus:ring-1 focus:ring-teal-500 transition-colors disabled:opacity-60
                        ${isPending
                          ? 'bg-orange-900/30 border border-orange-700/50 text-orange-300'
                          : 'bg-slate-800 border border-slate-600 text-slate-200 hover:border-teal-600'}`}
                    >
                      <option value="">대기 (미배정)</option>
                      {groups.map(g => (
                        <option key={g.groupId} value={g.groupId}>
                          {g.groupName}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  </div>

                  {/* 상태 */}
                  <div className="flex justify-center">
                    {state === 'saving' && (
                      <Loader2 className="w-4 h-4 text-teal-400 animate-spin" />
                    )}
                    {state === 'saved' && (
                      <Check className="w-4 h-4 text-teal-400" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
