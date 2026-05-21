'use client';

import { useState, useEffect } from 'react';
import { useStore } from '@/context/StoreContext';
import { useAuth } from '@/context/AuthContext';
import { UserCheck, UserX, Loader2, Users, Clock, ChevronDown, LogOut } from 'lucide-react';

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

const ROLE_LABELS: Record<string, string> = {
  owner: '대표', admin: '관리자', user: '사용자', staff: '직원',
};
const CHANGEABLE_ROLES = ['admin', 'user', 'staff'];

export default function MembersPage() {
  const { currentStore } = useStore();
  const { user } = useAuth();
  const [pendingMembers, setPendingMembers] = useState<Member[]>([]);
  const [activeMembers, setActiveMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState('');
  // 거절 사유 모달
  const [rejectTarget, setRejectTarget] = useState<Member | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  // 역할 변경 드롭다운 열림 상태
  const [openRoleMenu, setOpenRoleMenu] = useState<string | null>(null);
  // 현재 유저 역할
  const [myRole, setMyRole] = useState<string>('staff');

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

  useEffect(() => {
    if (!user?.uid || !currentStore?.storeId) return;
    fetch(`/api/users?uid=${user.uid}`)
      .then(r => r.json())
      .then(data => { if (data.user?.role) setMyRole(data.user.role); });
  }, [user?.uid, currentStore?.storeId]);

  const handleApprove = async (targetUid: string) => {
    if (!currentStore?.storeId) return;
    setActionLoading(targetUid);
    setError('');
    try {
      const res = await fetch('/api/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', targetUid, storeId: currentStore.storeId }),
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

  const handleRejectConfirm = async () => {
    if (!rejectTarget || !currentStore?.storeId) return;
    setActionLoading(rejectTarget.uid);
    setError('');
    try {
      const res = await fetch('/api/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reject',
          targetUid: rejectTarget.uid,
          storeId: currentStore.storeId,
          reason: rejectReason,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRejectTarget(null);
      setRejectReason('');
      await fetchMembers();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleChangeRole = async (targetUid: string, role: string) => {
    if (!currentStore?.storeId) return;
    setOpenRoleMenu(null);
    setActionLoading(targetUid);
    setError('');
    try {
      const res = await fetch('/api/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'changeRole', targetUid, storeId: currentStore.storeId, role }),
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

  const handleRemove = async (targetUid: string, name: string) => {
    if (!currentStore?.storeId) return;
    if (!confirm(`${name}님을 매장에서 내보내시겠습니까?`)) return;
    setActionLoading(targetUid);
    setError('');
    try {
      const res = await fetch('/api/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove', targetUid, storeId: currentStore.storeId }),
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

  const canManage = ['superuser', 'owner', 'admin'].includes(myRole);

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
          {currentStore?.storeName} 매장의 소속 멤버를 관리합니다.
        </p>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-500/30 rounded-xl p-4 mb-6 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* ── 승인 대기 ── */}
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
              <div key={member.uid} className="bg-slate-900 border border-slate-700 rounded-xl p-4">
                <div className="flex items-center justify-between gap-4">
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

                  {canManage && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => { setRejectTarget(member); setRejectReason(''); }}
                        disabled={actionLoading === member.uid}
                        className="flex items-center gap-1 bg-red-900/30 hover:bg-red-900/50 border border-red-500/30 text-red-400 px-3 py-2 rounded-lg text-sm transition-all"
                      >
                        <UserX className="w-3.5 h-3.5" />거절
                      </button>
                      <button
                        onClick={() => handleApprove(member.uid)}
                        disabled={actionLoading === member.uid}
                        className="flex items-center gap-1 bg-teal-900/30 hover:bg-teal-900/50 border border-teal-500/30 text-teal-400 px-3 py-2 rounded-lg text-sm transition-all"
                      >
                        {actionLoading === member.uid
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <UserCheck className="w-3.5 h-3.5" />
                        }
                        승인
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 현재 멤버 ── */}
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
            {activeMembers.map(member => {
              const isMe = member.uid === user?.uid;
              const isOwner = member.role === 'owner' || member.role === 'superuser';
              return (
                <div key={member.uid} className="bg-slate-900 border border-slate-700 rounded-xl p-4 flex items-center gap-3">
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
                    <p className="text-white font-bold text-sm truncate">
                      {member.name || '이름 없음'}
                      {isMe && <span className="text-slate-500 text-xs ml-2">(나)</span>}
                    </p>
                    <p className="text-slate-400 text-xs truncate">{member.email}</p>
                  </div>

                  {/* 역할 변경 드롭다운 */}
                  {canManage && !isOwner && !isMe ? (
                    <div className="relative flex-shrink-0">
                      <button
                        onClick={() => setOpenRoleMenu(openRoleMenu === member.uid ? null : member.uid)}
                        className="flex items-center gap-1 text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-600 px-2.5 py-1.5 rounded-lg transition-colors"
                      >
                        {ROLE_LABELS[member.role] || member.role}
                        <ChevronDown className="w-3 h-3" />
                      </button>
                      {openRoleMenu === member.uid && (
                        <div className="absolute right-0 top-full mt-1 bg-slate-800 border border-slate-600 rounded-xl shadow-xl z-10 overflow-hidden min-w-[100px]">
                          {CHANGEABLE_ROLES.map(r => (
                            <button
                              key={r}
                              onClick={() => handleChangeRole(member.uid, r)}
                              className={`w-full text-left px-3 py-2 text-xs transition-colors hover:bg-slate-700 ${member.role === r ? 'text-teal-400 font-bold' : 'text-slate-300'}`}
                            >
                              {ROLE_LABELS[r]}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400 bg-slate-800 px-2 py-1 rounded-lg flex-shrink-0">
                      {ROLE_LABELS[member.role] || member.role}
                    </span>
                  )}

                  {/* 내보내기 버튼 */}
                  {canManage && !isOwner && !isMe && (
                    <button
                      onClick={() => handleRemove(member.uid, member.name || '해당 멤버')}
                      disabled={actionLoading === member.uid}
                      className="flex-shrink-0 p-1.5 text-slate-500 hover:text-red-400 transition-colors"
                      title="내보내기"
                    >
                      {actionLoading === member.uid
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <LogOut className="w-4 h-4" />
                      }
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 거절 사유 모달 ── */}
      {rejectTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-white font-bold mb-1">소속 신청 거절</h3>
            <p className="text-slate-400 text-sm mb-4">
              <span className="text-white">{rejectTarget.name || rejectTarget.email}</span>님의 신청을 거절합니다.
            </p>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="거절 사유를 입력하세요 (선택사항)"
              rows={3}
              className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-slate-100 text-sm placeholder:text-slate-500 focus:outline-none focus:border-red-500 resize-none mb-4"
            />
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setRejectTarget(null)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 py-2.5 rounded-xl text-sm font-medium transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleRejectConfirm}
                disabled={actionLoading === rejectTarget.uid}
                className="bg-red-600 hover:bg-red-500 disabled:bg-slate-600 text-white py-2.5 rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2"
              >
                {actionLoading === rejectTarget.uid ? <Loader2 className="w-4 h-4 animate-spin" /> : '거절 확인'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 드롭다운 외부 클릭 닫기 */}
      {openRoleMenu && (
        <div className="fixed inset-0 z-0" onClick={() => setOpenRoleMenu(null)} />
      )}
    </div>
  );
}
