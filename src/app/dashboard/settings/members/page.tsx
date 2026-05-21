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
const ROLE_COLORS: Record<string, string> = {
  owner:     'bg-yellow-900/40 text-yellow-400 border border-yellow-700/40',
  admin:     'bg-blue-900/40 text-blue-400 border border-blue-700/40',
  user:      'bg-indigo-900/40 text-indigo-400 border border-indigo-700/40',
  staff:     'bg-slate-700 text-slate-300',
  superuser: 'bg-purple-900/40 text-purple-400 border border-purple-700/40',
};
const CHANGEABLE_ROLES = ['admin', 'user', 'staff'];

function MemberAvatar({ member, size = 'md' }: { member: Member; size?: 'sm' | 'md' }) {
  const cls = size === 'sm' ? 'w-7 h-7 text-xs' : 'w-9 h-9 text-sm';
  return member.photoURL ? (
    <img src={member.photoURL} alt="" className={`${cls} rounded-full flex-shrink-0 object-cover`} />
  ) : (
    <div className={`${cls} rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0`}>
      <span className="text-slate-400 font-bold">
        {(member.name || member.email || '?')[0].toUpperCase()}
      </span>
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${ROLE_COLORS[role] ?? 'bg-slate-700 text-slate-300'}`}>
      {ROLE_LABELS[role] || role}
    </span>
  );
}

export default function MembersPage() {
  const { currentStore } = useStore();
  const { user } = useAuth();

  const [tab, setTab] = useState<'store' | 'member'>('store');
  const [pendingMembers, setPendingMembers] = useState<Member[]>([]);
  const [activeMembers, setActiveMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [myRole, setMyRole] = useState('staff');

  // 탭 1 (멤버별)
  const [expandedUid, setExpandedUid] = useState<string | null>(null);
  const [memberStores, setMemberStores] = useState<Record<string, StoreMembership[]>>({});
  const [loadingStores, setLoadingStores] = useState<string | null>(null);
  const [openRoleMenuTab1, setOpenRoleMenuTab1] = useState<string | null>(null);

  // 탭 2 (매장별)
  const [rejectTarget, setRejectTarget] = useState<Member | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [openRoleMenuTab2, setOpenRoleMenuTab2] = useState<string | null>(null);

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

  const handleChangeRole = async (targetUid: string, storeId: string, role: string, isTab1 = false) => {
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

  const handleRemove = async (targetUid: string, name: string, storeId: string, storeName?: string) => {
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

  return (
    <div className="max-w-3xl mx-auto p-6">

      {/* 헤더 */}
      <div className="flex items-center gap-2 mb-2">
        <Users className="w-5 h-5 text-teal-400" />
        <h1 className="text-lg font-bold text-teal-400">멤버 관리</h1>
      </div>
      <p className="text-slate-400 text-sm mb-5">{currentStore?.storeName} 매장의 멤버를 관리합니다.</p>

      {/* 요약 칩 */}
      {!isLoading && (
        <div className="flex flex-wrap gap-2 mb-5">
          <div className="flex items-center gap-1.5 bg-slate-800 rounded-full px-3 py-1.5 text-xs">
            <Users className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-300">활성 <strong className="text-white">{activeMembers.length}명</strong></span>
          </div>
          {pendingMembers.length > 0 && (
            <div className="flex items-center gap-1.5 bg-yellow-900/30 border border-yellow-700/40 rounded-full px-3 py-1.5 text-xs">
              <Clock className="w-3.5 h-3.5 text-yellow-400" />
              <span className="text-yellow-300">승인 대기 <strong className="text-yellow-200">{pendingMembers.length}명</strong></span>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="bg-red-900/30 border border-red-500/30 rounded-xl p-3 mb-4 text-red-400 text-xs flex items-center justify-between">
          <span>{error}</span>
          <button className="underline ml-2" onClick={() => setError('')}>닫기</button>
        </div>
      )}

      {/* 탭 전환 */}
      <div className="flex bg-slate-900 border border-slate-700 rounded-xl p-1 mb-5">
        <button
          onClick={() => setTab('store')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'store' ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
        >
          <Building2 className="w-4 h-4" />매장별 보기
        </button>
        <button
          onClick={() => setTab('member')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'member' ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
        >
          <Users className="w-4 h-4" />멤버별 보기
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-7 h-7 text-teal-400 animate-spin" />
        </div>
      ) : (
        <>
          {/* ══════ 탭: 매장별 보기 ══════ */}
          {tab === 'store' && (
            <div className="space-y-6">

              {/* 승인 대기 섹션 */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-4 h-4 text-yellow-400" />
                  <h2 className="text-sm font-bold text-white">승인 대기</h2>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${pendingMembers.length > 0 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-slate-700 text-slate-500'}`}>
                    {pendingMembers.length}
                  </span>
                </div>

                {pendingMembers.length === 0 ? (
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-center">
                    <p className="text-slate-500 text-sm">대기 중인 소속 신청이 없습니다.</p>
                  </div>
                ) : (
                  <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
                    <div className="grid grid-cols-[auto_1fr_1fr_auto] gap-0 border-b border-slate-700 px-4 py-2.5 bg-slate-800/60">
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider w-10" />
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">이름</span>
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">이메일</span>
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">액션</span>
                    </div>
                    <div className="divide-y divide-slate-800">
                      {pendingMembers.map(member => (
                        <div key={member.uid} className="grid grid-cols-[auto_1fr_1fr_auto] items-center gap-0 px-4 py-3 bg-yellow-900/5">
                          <div className="w-10">
                            <MemberAvatar member={member} />
                          </div>
                          <div className="min-w-0 pr-3">
                            <p className="text-white text-sm font-medium truncate">{member.name || '이름 없음'}</p>
                          </div>
                          <div className="min-w-0 pr-3">
                            <p className="text-slate-400 text-xs truncate">{member.email}</p>
                          </div>
                          {canManage && (
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <button
                                onClick={() => { setRejectTarget(member); setRejectReason(''); }}
                                disabled={actionLoading === member.uid}
                                className="flex items-center gap-1 bg-red-900/30 hover:bg-red-900/50 border border-red-500/30 text-red-400 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
                              >
                                <UserX className="w-3.5 h-3.5" />거절
                              </button>
                              <button
                                onClick={() => handleApprove(member.uid)}
                                disabled={actionLoading === member.uid}
                                className="flex items-center gap-1 bg-teal-900/30 hover:bg-teal-900/50 border border-teal-500/30 text-teal-400 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
                              >
                                {actionLoading === member.uid
                                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  : <UserCheck className="w-3.5 h-3.5" />}
                                승인
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 현재 멤버 섹션 */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Users className="w-4 h-4 text-teal-400" />
                  <h2 className="text-sm font-bold text-white">현재 멤버</h2>
                  <span className="bg-teal-500/20 text-teal-400 text-xs font-bold px-2 py-0.5 rounded-full">
                    {activeMembers.length}
                  </span>
                </div>

                {activeMembers.length === 0 ? (
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-center">
                    <p className="text-slate-500 text-sm">활성 멤버가 없습니다.</p>
                  </div>
                ) : (
                  <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
                    <div className="grid grid-cols-[auto_1fr_1fr_100px_44px] gap-0 border-b border-slate-700 px-4 py-2.5 bg-slate-800/60">
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider w-10" />
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">이름</span>
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">이메일</span>
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">역할</span>
                      <span />
                    </div>
                    <div className="divide-y divide-slate-800">
                      {activeMembers.map(member => {
                        const isMe = member.uid === user?.uid;
                        const isOwner = member.role === 'owner' || member.role === 'superuser';
                        const actionKey = `${member.uid}:${currentStore?.storeId}`;
                        const isActionLoading = actionLoading === actionKey;
                        const canEdit = canManage && !isOwner && !isMe;

                        return (
                          <div key={member.uid} className="grid grid-cols-[auto_1fr_1fr_100px_44px] items-center gap-0 px-4 py-3 hover:bg-slate-800/30 transition-colors">
                            <div className="w-10">
                              <MemberAvatar member={member} />
                            </div>
                            <div className="min-w-0 pr-3">
                              <p className="text-white text-sm font-medium truncate">
                                {member.name || '이름 없음'}
                                {isMe && <span className="text-slate-500 text-xs ml-1.5">(나)</span>}
                              </p>
                            </div>
                            <div className="min-w-0 pr-3">
                              <p className="text-slate-400 text-xs truncate">{member.email}</p>
                            </div>
                            {/* 역할 */}
                            <div className="relative">
                              {canEdit ? (
                                <>
                                  <button
                                    onClick={() => setOpenRoleMenuTab2(openRoleMenuTab2 === member.uid ? null : member.uid)}
                                    className="flex items-center gap-1 text-xs bg-slate-800 hover:bg-slate-700 border border-slate-600 px-2 py-1 rounded-lg transition-colors w-full"
                                  >
                                    <RoleBadge role={member.role} />
                                    <ChevronDown className="w-3 h-3 text-slate-400 ml-auto flex-shrink-0" />
                                  </button>
                                  {openRoleMenuTab2 === member.uid && (
                                    <div className="absolute left-0 top-full mt-1 bg-slate-800 border border-slate-600 rounded-xl shadow-xl z-10 overflow-hidden min-w-[90px]">
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
                                </>
                              ) : (
                                <RoleBadge role={member.role} />
                              )}
                            </div>
                            {/* 내보내기 */}
                            <div className="flex justify-center">
                              {canEdit && (
                                <button
                                  onClick={() => handleRemove(member.uid, member.name || '해당 멤버', currentStore?.storeId || '')}
                                  disabled={isActionLoading}
                                  className="p-1.5 text-slate-500 hover:text-red-400 transition-colors rounded-lg hover:bg-red-900/20"
                                  title="내보내기"
                                >
                                  {isActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══════ 탭: 멤버별 보기 ══════ */}
          {tab === 'member' && (
            <div>
              {activeMembers.length === 0 ? (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
                  <p className="text-slate-500 text-sm">활성 멤버가 없습니다.</p>
                </div>
              ) : (
                <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
                  <div className="grid grid-cols-[auto_1fr_80px_32px] gap-0 border-b border-slate-700 px-4 py-2.5 bg-slate-800/60">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider w-10" />
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">이름 / 이메일</span>
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">역할</span>
                    <span />
                  </div>
                  <div className="divide-y divide-slate-800">
                    {activeMembers.map(member => {
                      const isMe = member.uid === user?.uid;
                      const isExpanded = expandedUid === member.uid;
                      const stores = memberStores[member.uid] || [];

                      return (
                        <div key={member.uid}>
                          {/* 멤버 행 */}
                          <button
                            className="w-full grid grid-cols-[auto_1fr_80px_32px] items-center gap-0 px-4 py-3 hover:bg-slate-800/40 transition-colors text-left"
                            onClick={() => handleExpandMember(member.uid)}
                          >
                            <div className="w-10">
                              <MemberAvatar member={member} />
                            </div>
                            <div className="min-w-0 pr-3">
                              <p className="text-white text-sm font-medium truncate">
                                {member.name || '이름 없음'}
                                {isMe && <span className="text-slate-500 text-xs ml-1.5">(나)</span>}
                              </p>
                              <p className="text-slate-500 text-xs truncate">{member.email}</p>
                            </div>
                            <div>
                              <RoleBadge role={member.role} />
                            </div>
                            <div className="flex justify-center">
                              <ChevronRight className={`w-4 h-4 text-slate-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                            </div>
                          </button>

                          {/* 확장: 소속 매장 목록 */}
                          {isExpanded && (
                            <div className="bg-slate-950/60 border-t border-slate-800">
                              {loadingStores === member.uid ? (
                                <div className="flex items-center justify-center py-5">
                                  <Loader2 className="w-5 h-5 text-teal-400 animate-spin" />
                                </div>
                              ) : stores.length === 0 ? (
                                <p className="text-slate-500 text-xs text-center py-4">소속 매장 없음</p>
                              ) : (
                                stores.map(store => {
                                  const canManageThis = isSuperuser ||
                                    (store.storeId === currentStore?.storeId && canManage &&
                                      member.role !== 'owner' && !isMe);
                                  const actionKey = `${member.uid}:${store.storeId}`;
                                  const isActionLoading = actionLoading === actionKey;

                                  return (
                                    <div key={store.storeId} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-6 py-2.5 border-b border-slate-800/50 last:border-b-0">
                                      <Store className="w-3.5 h-3.5 text-teal-400/40 flex-shrink-0" />
                                      <div className="min-w-0">
                                        <p className="text-slate-200 text-xs font-medium truncate">{store.storeName}</p>
                                        {store.region && <p className="text-slate-600 text-[10px]">{store.region}</p>}
                                      </div>
                                      {canManageThis ? (
                                        <div className="flex items-center gap-1.5">
                                          <div className="relative">
                                            <button
                                              onClick={() => setOpenRoleMenuTab1(openRoleMenuTab1 === actionKey ? null : actionKey)}
                                              className="flex items-center gap-1 text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-600 px-2 py-1 rounded-lg transition-colors"
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
                                          <button
                                            onClick={() => handleRemove(member.uid, member.name || '해당 멤버', store.storeId, store.storeName)}
                                            disabled={isActionLoading}
                                            className="p-1 text-slate-500 hover:text-red-400 transition-colors rounded"
                                            title="내보내기"
                                          >
                                            {isActionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
                                          </button>
                                        </div>
                                      ) : (
                                        <RoleBadge role={store.role} />
                                      )}
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
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
