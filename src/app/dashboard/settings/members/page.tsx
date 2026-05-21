'use client';

import { useState, useEffect, useCallback } from 'react';
import { useStore } from '@/context/StoreContext';
import { useAuth } from '@/context/AuthContext';
import {
  UserCheck, UserX, Loader2, Users, Clock,
  ChevronDown, LogOut, ChevronRight, Store, Building2,
} from 'lucide-react';

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

interface StoreMembership {
  storeId: string;
  storeName: string;
  role: string;
  region?: string;
}

const ROLE_LABELS: Record<string, string> = {
  owner: '대표', admin: '관리자', user: '사용자', staff: '직원',
};
const CHANGEABLE_ROLES = ['admin', 'user', 'staff'];

function MemberAvatar({ member, className }: { member: Member; className: string }) {
  return member.photoURL ? (
    <img src={member.photoURL} alt="" className={`${className} rounded-full flex-shrink-0`} />
  ) : (
    <div className={`${className} rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0`}>
      <span className="text-slate-400 text-sm font-bold">
        {(member.name || member.email || '?')[0].toUpperCase()}
      </span>
    </div>
  );
}

export default function MembersPage() {
  const { currentStore } = useStore();
  const { user } = useAuth();

  const [tab, setTab] = useState<'member' | 'store'>('store');
  const [pendingMembers, setPendingMembers] = useState<Member[]>([]);
  const [activeMembers, setActiveMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [myRole, setMyRole] = useState('staff');

  // 탭 1 상태
  const [expandedUid, setExpandedUid] = useState<string | null>(null);
  const [memberStores, setMemberStores] = useState<Record<string, StoreMembership[]>>({});
  const [loadingStores, setLoadingStores] = useState<string | null>(null);
  const [openRoleMenuTab1, setOpenRoleMenuTab1] = useState<string | null>(null); // 'uid:storeId'

  // 탭 2 상태
  const [rejectTarget, setRejectTarget] = useState<Member | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [openRoleMenuTab2, setOpenRoleMenuTab2] = useState<string | null>(null); // uid

  const canManage = ['superuser', 'owner', 'admin'].includes(myRole);
  const isSuperuser = myRole === 'superuser';

  const fetchMembers = useCallback(async () => {
    if (!currentStore?.storeId) return;
    setIsLoading(true);
    try {
      const [pendingRes, activeRes] = await Promise.all([
        fetch(`/api/store?storeId=${currentStore.storeId}&status=pending`),
        fetch(`/api/store?storeId=${currentStore.storeId}&status=active`),
      ]);
      const [pendingData, activeData] = await Promise.all([pendingRes.json(), activeRes.json()]);
      setPendingMembers(pendingData.members || []);
      setActiveMembers(activeData.members || []);
    } catch {
      setError('멤버 목록을 불러오지 못했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [currentStore?.storeId]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  useEffect(() => {
    if (!user?.uid) return;
    fetch(`/api/users?uid=${user.uid}`)
      .then(r => r.json())
      .then(data => {
        const globalRole = data.user?.role;
        if (globalRole === 'superuser') setMyRole('superuser');
        else setMyRole(currentStore?.role || globalRole || 'staff');
      });
  }, [user?.uid, currentStore?.role]);

  // 탭 1: 멤버 클릭 시 소속 매장 목록 로드
  const handleExpandMember = async (uid: string) => {
    if (expandedUid === uid) { setExpandedUid(null); return; }
    setExpandedUid(uid);
    if (!memberStores[uid]) {
      setLoadingStores(uid);
      try {
        const res = await fetch(`/api/store?uid=${uid}`);
        const data = await res.json();
        setMemberStores(prev => ({ ...prev, [uid]: data.stores || [] }));
      } catch {
        setMemberStores(prev => ({ ...prev, [uid]: [] }));
      } finally {
        setLoadingStores(null);
      }
    }
  };

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
    } catch (e: any) { setError(e.message); }
    finally { setActionLoading(null); }
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
    } catch (e: any) { setError(e.message); }
    finally { setActionLoading(null); }
  };

  const handleChangeRole = async (
    targetUid: string,
    storeId: string,
    role: string,
    isTab1 = false,
  ) => {
    setOpenRoleMenuTab1(null);
    setOpenRoleMenuTab2(null);
    const key = `${targetUid}:${storeId}`;
    setActionLoading(key);
    setError('');
    try {
      const res = await fetch('/api/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'changeRole', targetUid, storeId, role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (isTab1) {
        setMemberStores(prev => ({
          ...prev,
          [targetUid]: (prev[targetUid] || []).map(s =>
            s.storeId === storeId ? { ...s, role } : s
          ),
        }));
      }
      await fetchMembers();
    } catch (e: any) { setError(e.message); }
    finally { setActionLoading(null); }
  };

  const handleRemove = async (
    targetUid: string,
    name: string,
    storeId: string,
    storeName?: string,
  ) => {
    const msg = storeName
      ? `${name}님을 ${storeName}에서 내보내시겠습니까?`
      : `${name}님을 매장에서 내보내시겠습니까?`;
    if (!confirm(msg)) return;
    const key = `${targetUid}:${storeId}`;
    setActionLoading(key);
    setError('');
    try {
      const res = await fetch('/api/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove', targetUid, storeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (storeId === currentStore?.storeId) await fetchMembers();
      setMemberStores(prev => ({
        ...prev,
        [targetUid]: (prev[targetUid] || []).filter(s => s.storeId !== storeId),
      }));
    } catch (e: any) { setError(e.message); }
    finally { setActionLoading(null); }
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
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-teal-400">멤버 관리</h1>
        <p className="text-slate-400 text-sm mt-1">{currentStore?.storeName} 매장의 멤버를 관리합니다.</p>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-500/30 rounded-xl p-4 mb-6 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* 탭 전환 */}
      <div className="flex bg-slate-900 border border-slate-700 rounded-xl p-1 mb-6">
        <button
          onClick={() => setTab('member')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors ${tab === 'member' ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
        >
          <Users className="w-4 h-4" />멤버별 보기
        </button>
        <button
          onClick={() => setTab('store')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors ${tab === 'store' ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
        >
          <Building2 className="w-4 h-4" />매장별 보기
        </button>
      </div>

      {/* ══════ 탭 1: 멤버별 보기 ══════ */}
      {tab === 'member' && (
        <div className="space-y-3">
          {activeMembers.length === 0 ? (
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-8 text-center">
              <p className="text-slate-500 text-sm">활성 멤버가 없습니다.</p>
            </div>
          ) : (
            activeMembers.map(member => {
              const isMe = member.uid === user?.uid;
              const isOwner = member.role === 'owner' || member.role === 'superuser';
              const isExpanded = expandedUid === member.uid;
              const stores = memberStores[member.uid] || [];

              return (
                <div key={member.uid} className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
                  {/* 멤버 헤더 (클릭으로 펼치기) */}
                  <button
                    className="w-full flex items-center gap-3 p-4 hover:bg-slate-800/50 transition-colors text-left"
                    onClick={() => handleExpandMember(member.uid)}
                  >
                    <MemberAvatar member={member} className="w-10 h-10" />
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-bold text-sm truncate">
                        {member.name || '이름 없음'}
                        {isMe && <span className="text-slate-500 text-xs ml-2">(나)</span>}
                      </p>
                      <p className="text-slate-400 text-xs truncate">{member.email}</p>
                    </div>
                    <span className="text-xs text-slate-400 bg-slate-800 px-2 py-1 rounded-lg flex-shrink-0">
                      {ROLE_LABELS[member.role] || member.role}
                    </span>
                    <ChevronRight className={`w-4 h-4 text-slate-500 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                  </button>

                  {/* 펼쳐진 소속 매장 목록 */}
                  {isExpanded && (
                    <div className="border-t border-slate-800">
                      {loadingStores === member.uid ? (
                        <div className="flex items-center justify-center py-6">
                          <Loader2 className="w-5 h-5 text-teal-400 animate-spin" />
                        </div>
                      ) : stores.length === 0 ? (
                        <p className="text-slate-500 text-xs text-center py-5">소속 매장 없음</p>
                      ) : (
                        stores.map(store => {
                          const canManageThis = isSuperuser ||
                            (store.storeId === currentStore?.storeId && canManage && !isOwner && !isMe);
                          const actionKey = `${member.uid}:${store.storeId}`;
                          const isActionLoading = actionLoading === actionKey;

                          return (
                            <div key={store.storeId} className="flex items-center gap-3 px-4 py-3 border-b border-slate-800/50 last:border-b-0 bg-slate-950/30">
                              <Store className="w-4 h-4 text-teal-400/50 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-slate-200 text-sm font-medium truncate">{store.storeName}</p>
                                {store.region && <p className="text-slate-500 text-xs">{store.region}</p>}
                              </div>

                              {canManageThis ? (
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                  {/* 역할 변경 드롭다운 */}
                                  <div className="relative">
                                    <button
                                      onClick={() => setOpenRoleMenuTab1(openRoleMenuTab1 === actionKey ? null : actionKey)}
                                      className="flex items-center gap-1 text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-600 px-2 py-1.5 rounded-lg transition-colors"
                                    >
                                      {ROLE_LABELS[store.role] || store.role}
                                      <ChevronDown className="w-3 h-3" />
                                    </button>
                                    {openRoleMenuTab1 === actionKey && (
                                      <div className="absolute right-0 top-full mt-1 bg-slate-800 border border-slate-600 rounded-xl shadow-xl z-10 overflow-hidden min-w-[90px]">
                                        {CHANGEABLE_ROLES.map(r => (
                                          <button
                                            key={r}
                                            onClick={() => handleChangeRole(member.uid, store.storeId, r, true)}
                                            className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-700 transition-colors ${store.role === r ? 'text-teal-400 font-bold' : 'text-slate-300'}`}
                                          >
                                            {ROLE_LABELS[r]}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  {/* 내보내기 */}
                                  <button
                                    onClick={() => handleRemove(member.uid, member.name || '해당 멤버', store.storeId, store.storeName)}
                                    disabled={isActionLoading}
                                    className="p-1.5 text-slate-500 hover:text-red-400 transition-colors"
                                    title="내보내기"
                                  >
                                    {isActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
                                  </button>
                                </div>
                              ) : (
                                <span className="text-xs text-slate-500 flex-shrink-0">
                                  {ROLE_LABELS[store.role] || store.role}
                                </span>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ══════ 탭 2: 매장별 보기 ══════ */}
      {tab === 'store' && (
        <div>
          {/* 승인 대기 */}
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
                        <MemberAvatar member={member} className="w-10 h-10" />
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
                              : <UserCheck className="w-3.5 h-3.5" />}
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

          {/* 현재 멤버 */}
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
                  const actionKey = `${member.uid}:${currentStore?.storeId}`;
                  return (
                    <div key={member.uid} className="bg-slate-900 border border-slate-700 rounded-xl p-4 flex items-center gap-3">
                      <MemberAvatar member={member} className="w-9 h-9" />
                      <div className="min-w-0 flex-1">
                        <p className="text-white font-bold text-sm truncate">
                          {member.name || '이름 없음'}
                          {isMe && <span className="text-slate-500 text-xs ml-2">(나)</span>}
                        </p>
                        <p className="text-slate-400 text-xs truncate">{member.email}</p>
                      </div>

                      {canManage && !isOwner && !isMe ? (
                        <div className="relative flex-shrink-0">
                          <button
                            onClick={() => setOpenRoleMenuTab2(openRoleMenuTab2 === member.uid ? null : member.uid)}
                            className="flex items-center gap-1 text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-600 px-2.5 py-1.5 rounded-lg transition-colors"
                          >
                            {ROLE_LABELS[member.role] || member.role}
                            <ChevronDown className="w-3 h-3" />
                          </button>
                          {openRoleMenuTab2 === member.uid && (
                            <div className="absolute right-0 top-full mt-1 bg-slate-800 border border-slate-600 rounded-xl shadow-xl z-10 overflow-hidden min-w-[100px]">
                              {CHANGEABLE_ROLES.map(r => (
                                <button
                                  key={r}
                                  onClick={() => handleChangeRole(member.uid, currentStore?.storeId || '', r)}
                                  className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-700 transition-colors ${member.role === r ? 'text-teal-400 font-bold' : 'text-slate-300'}`}
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

                      {canManage && !isOwner && !isMe && (
                        <button
                          onClick={() => handleRemove(member.uid, member.name || '해당 멤버', currentStore?.storeId || '')}
                          disabled={actionLoading === actionKey}
                          className="flex-shrink-0 p-1.5 text-slate-500 hover:text-red-400 transition-colors"
                          title="내보내기"
                        >
                          {actionLoading === actionKey
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <LogOut className="w-4 h-4" />}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 거절 사유 모달 */}
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
      {(openRoleMenuTab1 || openRoleMenuTab2) && (
        <div className="fixed inset-0 z-0" onClick={() => { setOpenRoleMenuTab1(null); setOpenRoleMenuTab2(null); }} />
      )}
    </div>
  );
}
