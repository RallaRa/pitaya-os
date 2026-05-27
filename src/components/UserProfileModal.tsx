'use client';

import { useState, useEffect, useRef } from 'react';
import { X, LogOut, Pencil, Check, Building2, ShieldCheck, Mail } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useStore } from '@/context/StoreContext';
import { getAuthHeaders } from '@/lib/getAuthHeaders';

interface Props {
  onClose: () => void;
}

const ROLE_LABEL: Record<string, string> = {
  superuser: '슈퍼유저',
  master:    '마스터',
  admin:     '관리자',
  user:      '사용자',
  staff:     '직원',
};

const GROUP_COLOR: Record<string, string> = {
  superuser: 'bg-purple-900/40 text-purple-300 border-purple-600/40',
  master:    'bg-yellow-900/40 text-yellow-300 border-yellow-600/40',
  admin:     'bg-blue-900/40   text-blue-300   border-blue-600/40',
  user:      'bg-teal-900/40   text-teal-300   border-teal-600/40',
  staff:     'bg-slate-700/40  text-slate-300  border-slate-600/40',
};

export default function UserProfileModal({ onClose }: Props) {
  const { user, logout } = useAuth();
  const { currentStore, myStores, setCurrentStore } = useStore();

  const [userData,    setUserData]    = useState<any>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameVal,     setNameVal]     = useState('');
  const [savingName,  setSavingName]  = useState(false);
  const [nameError,   setNameError]   = useState('');
  const [loggingOut,  setLoggingOut]  = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // 사용자 정보 로드
  useEffect(() => {
    if (!user?.uid) return;
    getAuthHeaders()
      .then(h => fetch(`/api/users?uid=${user.uid}`, { headers: h }))
      .then(r => r.json())
      .then(d => {
        if (d.user) {
          setUserData(d.user);
          setNameVal(d.user.name || user.displayName || '');
        }
      })
      .catch(() => {});
  }, [user?.uid]);

  useEffect(() => {
    if (editingName) nameInputRef.current?.focus();
  }, [editingName]);

  const handleSaveName = async () => {
    if (!nameVal.trim()) { setNameError('이름을 입력해주세요'); return; }
    if (nameVal.trim() === (userData?.name || user?.displayName || '')) {
      setEditingName(false); return;
    }
    setSavingName(true); setNameError('');
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: user!.uid, name: nameVal.trim(), email: user!.email, photoURL: user!.photoURL }),
      });
      if (res.ok) {
        setUserData((d: any) => ({ ...d, name: nameVal.trim() }));
        setEditingName(false);
      } else { setNameError('저장 실패'); }
    } catch { setNameError('저장 실패'); }
    finally { setSavingName(false); }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    onClose();
    await logout();
  };

  const displayName = userData?.name || user?.displayName || user?.email || '';
  const role        = userData?.role || 'staff';
  const groupId     = userData?.groupId || 'staff';

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative bg-slate-900 border border-slate-700/60 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <span className="text-slate-100 font-semibold text-sm">내 계정</span>
          <button onClick={onClose} className="p-1 text-slate-500 hover:text-white transition-colors rounded-lg hover:bg-slate-800">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* 아바타 + 이름 */}
          <div className="flex items-center gap-3">
            {user?.photoURL ? (
              <img src={user.photoURL} alt="" className="w-12 h-12 rounded-full border-2 border-slate-700 shrink-0" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-teal-700 flex items-center justify-center text-lg font-bold text-white shrink-0">
                {displayName.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              {editingName ? (
                <div className="flex items-center gap-1.5">
                  <input
                    ref={nameInputRef}
                    value={nameVal}
                    onChange={e => setNameVal(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false); }}
                    className="flex-1 bg-slate-800 border border-teal-500/60 rounded-lg px-2 py-1 text-sm text-slate-100 focus:outline-none"
                    maxLength={20}
                  />
                  <button onClick={handleSaveName} disabled={savingName} className="p-1 text-teal-400 hover:text-teal-300 disabled:opacity-50">
                    <Check className="w-4 h-4" />
                  </button>
                  <button onClick={() => { setEditingName(false); setNameVal(userData?.name || user?.displayName || ''); }} className="p-1 text-slate-500 hover:text-slate-300">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-100 text-sm font-semibold truncate">{displayName}</span>
                  <button onClick={() => setEditingName(true)} className="p-0.5 text-slate-600 hover:text-teal-400 transition-colors shrink-0">
                    <Pencil className="w-3 h-3" />
                  </button>
                </div>
              )}
              {nameError && <p className="text-red-400 text-[10px] mt-0.5">{nameError}</p>}
              <div className="flex items-center gap-1 mt-0.5">
                <Mail className="w-3 h-3 text-slate-500 shrink-0" />
                <span className="text-slate-500 text-[11px] truncate">{user?.email}</span>
              </div>
            </div>
          </div>

          {/* 역할/권한 */}
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span className="text-slate-500 text-xs">권한</span>
            <span className={`ml-auto text-[11px] font-medium px-2 py-0.5 rounded-full border ${GROUP_COLOR[groupId] || GROUP_COLOR.staff}`}>
              {ROLE_LABEL[groupId] || groupId}
            </span>
          </div>

          {/* 소속 매장 */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Building2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span className="text-slate-500 text-xs">소속 매장</span>
              <span className="ml-auto text-xs text-slate-300 truncate max-w-[140px]">
                {currentStore?.storeName || '매장 없음'}
              </span>
            </div>
            {myStores.length > 1 && (
              <div className="pl-5 space-y-1">
                {myStores.map(s => (
                  <button
                    key={s.storeId}
                    onClick={() => { setCurrentStore(s); onClose(); }}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                      currentStore?.storeId === s.storeId
                        ? 'bg-teal-600/20 text-teal-300 border border-teal-500/30'
                        : 'text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    <Building2 className="w-3 h-3 shrink-0" />
                    {s.storeName}
                    {currentStore?.storeId === s.storeId && <Check className="w-3 h-3 ml-auto" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 구글 계정 안내 */}
          <div className="bg-slate-800/40 rounded-lg px-3 py-2 text-[10px] text-slate-500">
            Google 계정으로 로그인 중입니다. 이메일 및 비밀번호는 Google에서 관리됩니다.
          </div>

          {/* 로그아웃 */}
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-900/20 hover:bg-red-900/40 border border-red-700/40 text-red-300 hover:text-red-200 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
          >
            <LogOut className="w-4 h-4" />
            {loggingOut ? '로그아웃 중...' : '로그아웃'}
          </button>
        </div>
      </div>
    </div>
  );
}
