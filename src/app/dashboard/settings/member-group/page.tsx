'use client';

import { useState, useEffect, useCallback } from 'react';
import { useStore } from '@/context/StoreContext';
import { useAuth } from '@/context/AuthContext';
import { UserCog, Loader2, Users, Check, Clock, ChevronDown, Save, X } from 'lucide-react';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';

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

  const [groups,      setGroups]      = useState<PermissionGroup[]>([]);
  const [storeUsers,  setStoreUsers]  = useState<StoreUser[]>([]);
  const [isLoading,   setIsLoading]   = useState(true);
  const [isSaving,    setIsSaving]    = useState(false);
  const [error,       setError]       = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // uid → newGroupId (저장 전 임시 변경사항)
  const [localChanges, setLocalChanges] = useState<Record<string, string>>({});

  // ── 데이터 로드 ──
  const fetchAll = useCallback(async () => {
    if (!currentStore?.storeId) { setIsLoading(false); return; }
    setIsLoading(true);
    setError('');
    try {
      const authHeaders = await getAuthJsonHeaders();
      const [groupsRes, usersRes] = await Promise.all([
        fetch(`/api/permissions?type=groups&storeId=${currentStore.storeId}`, { headers: authHeaders }),
        fetch(`/api/users?storeId=${currentStore.storeId}`, { headers: authHeaders }),
      ]);
      const [groupsData, usersData] = await Promise.all([groupsRes.json(), usersRes.json()]);
      setGroups(groupsData.groups || []);
      setStoreUsers(usersData.users || []);
      setLocalChanges({});
    } catch {
      setError('데이터를 불러오지 못했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [currentStore?.storeId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── 드롭다운 변경 → 로컬 상태만 업데이트 ──
  const handleGroupChange = (uid: string, newGroupId: string) => {
    const original = storeUsers.find(u => u.uid === uid)?.groupId ?? '';
    setLocalChanges(prev => {
      const next = { ...prev };
      if (newGroupId === original) {
        delete next[uid];
      } else {
        next[uid] = newGroupId;
      }
      return next;
    });
  };

  // ── 일괄 저장 ──
  const handleSave = async () => {
    if (Object.keys(localChanges).length === 0) return;
    setIsSaving(true);
    setError('');
    try {
      const authHeaders = await getAuthJsonHeaders();
      await Promise.all(
        Object.entries(localChanges).map(([uid, groupId]) =>
          fetch('/api/users', {
            method: 'PUT',
            headers: authHeaders,
            body: JSON.stringify({
              action: 'assignGroup',
              uid,
              storeId: currentStore?.storeId,
              groupId,
            }),
          }).then(r => { if (!r.ok) throw new Error('저장 실패'); })
        )
      );
      setStoreUsers(prev =>
        prev.map(u => localChanges[u.uid] !== undefined
          ? { ...u, groupId: localChanges[u.uid] }
          : u
        )
      );
      setLocalChanges({});
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (e: any) {
      setError(e.message || '저장 중 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  // ── 취소 ──
  const handleCancel = () => setLocalChanges({});

  // ── 정렬: 대기 → 그룹순 → 이름순 ──
  const groupOrder = (gid: string) => {
    if (!gid) return 0;
    const idx = ['master', 'admin', 'user', 'staff', 'guest'].indexOf(gid);
    return idx === -1 ? 10 : idx + 1;
  };

  const sortedUsers = [...storeUsers].sort((a, b) => {
    const aGid = localChanges[a.uid] ?? a.groupId;
    const bGid = localChanges[b.uid] ?? b.groupId;
    const go = groupOrder(aGid) - groupOrder(bGid);
    if (go !== 0) return go;
    return (a.name || '').localeCompare(b.name || '');
  });

  const pendingCount = storeUsers.filter(u => !u.groupId).length;
  const changedCount = Object.keys(localChanges).length;

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
        <div>
          <h1 className="text-lg font-bold text-teal-400">멤버-그룹 연결</h1>
          {currentStore?.storeName && (
            <p className="text-[11px] text-slate-500 mt-0.5">현재 매장: {currentStore.storeName}</p>
          )}
        </div>
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

      {/* 미저장 변경사항 배너 */}
      {changedCount > 0 && (
        <div className="flex items-center gap-3 bg-amber-900/20 border border-amber-500/30 rounded-xl px-4 py-3 mb-4">
          <span className="text-amber-400 text-sm font-medium flex-1">
            저장되지 않은 변경사항 {changedCount}개
          </span>
          <button
            onClick={handleCancel}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:text-white bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
          >
            <X className="w-3.5 h-3.5" /> 취소
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-black bg-teal-400 hover:bg-teal-300 disabled:opacity-50 rounded-lg transition-colors"
          >
            {isSaving
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : saveSuccess
                ? <><Check className="w-3.5 h-3.5" /> 저장됨</>
                : <><Save className="w-3.5 h-3.5" /> 저장하기</>
            }
          </button>
        </div>
      )}

      {/* 저장 성공 (변경 없을 때) */}
      {saveSuccess && changedCount === 0 && (
        <div className="flex items-center gap-2 bg-teal-900/20 border border-teal-500/30 rounded-xl px-4 py-3 mb-4 text-teal-400 text-sm">
          <Check className="w-4 h-4" /> 권한이 저장되었습니다.
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
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider text-center">변경</span>
          </div>

          {/* 행 목록 */}
          <div className="divide-y divide-slate-800">
            {sortedUsers.map((u, idx) => {
              const isPending  = !u.groupId;
              const isChanged  = localChanges[u.uid] !== undefined;
              const currentGid = localChanges[u.uid] ?? u.groupId;

              return (
                <div
                  key={u.uid}
                  className={`grid grid-cols-[1fr_1fr_180px_60px] items-center gap-0 px-4 py-3 transition-colors
                    ${isChanged
                      ? 'bg-amber-900/10 border-l-2 border-l-amber-500'
                      : isPending
                        ? 'bg-orange-900/10'
                        : idx % 2 === 0 ? '' : 'bg-slate-800/20'
                    }`}
                >
                  {/* 이름 */}
                  <div className="flex items-center gap-2 min-w-0 pr-3">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${groupDot(currentGid)}`} />
                    <span className="text-white text-sm font-medium truncate">{u.name || u.uid}</span>
                  </div>

                  {/* 이메일 */}
                  <div className="min-w-0 pr-3">
                    <span className="text-slate-400 text-xs truncate block">{u.email}</span>
                  </div>

                  {/* 그룹 드롭다운 */}
                  <div className="relative">
                    <select
                      value={currentGid}
                      onChange={e => handleGroupChange(u.uid, e.target.value)}
                      disabled={isSaving}
                      className={`w-full appearance-none rounded-lg px-3 py-1.5 pr-7 text-xs font-medium cursor-pointer focus:outline-none focus:ring-1 focus:ring-teal-500 transition-colors disabled:opacity-60
                        ${isChanged
                          ? 'bg-amber-900/30 border border-amber-600/60 text-amber-200'
                          : isPending
                            ? 'bg-orange-900/30 border border-orange-700/50 text-orange-300'
                            : 'bg-slate-800 border border-slate-600 text-slate-200 hover:border-teal-600'
                        }`}
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

                  {/* 변경 표시 */}
                  <div className="flex justify-center">
                    {isChanged && (
                      <span className="w-2 h-2 rounded-full bg-amber-400" title="미저장 변경사항" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 하단 저장 버튼 (변경사항 없어도 항상 표시) */}
      {!isLoading && sortedUsers.length > 0 && (
        <div className="flex justify-end mt-4 gap-2">
          {changedCount > 0 && (
            <button
              onClick={handleCancel}
              className="px-4 py-2 text-sm text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
            >
              취소
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={changedCount === 0 || isSaving}
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-teal-600 hover:bg-teal-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-colors"
          >
            {isSaving
              ? <><Loader2 className="w-4 h-4 animate-spin" /> 저장 중...</>
              : saveSuccess
                ? <><Check className="w-4 h-4" /> 저장됨</>
                : <><Save className="w-4 h-4" /> 변경사항 저장{changedCount > 0 ? ` (${changedCount})` : ''}</>
            }
          </button>
        </div>
      )}
    </div>
  );
}
