'use client';

import { useState, useEffect, useCallback } from 'react';
import { useStore } from '@/context/StoreContext';
import { useAuth } from '@/context/AuthContext';
import {
  Shield, Plus, ChevronRight, Loader2,
  Pencil, Trash2, Save, X, Check,
} from 'lucide-react';

type MenuKey =
  | 'ai' | 'sales' | 'purchase' | 'report' | 'messenger'
  | 'members' | 'store' | 'permissionGroup' | 'memberGroup';

type MenuAccess = Record<MenuKey, boolean>;

interface PermissionGroup {
  groupId: string;
  storeId: string;
  groupName: string;
  menuAccess: MenuAccess;
  isDefault: boolean;
}

const MENU_LABELS: [MenuKey, string][] = [
  ['ai',              'AI 대화모드'],
  ['sales',           'AI 매출관리'],
  ['purchase',        'AI 매입관리'],
  ['report',          '전체 보고서'],
  ['messenger',       '메신저'],
  ['members',         '멤버 관리'],
  ['store',           '매장 정보'],
  ['permissionGroup', '권한 그룹 관리'],
  ['memberGroup',     '멤버-그룹 연결'],
];

const ALL_FALSE: MenuAccess = {
  ai: false, sales: false, purchase: false, report: false,
  messenger: false, members: false, store: false,
  permissionGroup: false, memberGroup: false,
};

export default function PermissionGroupPage() {
  const { currentStore } = useStore();
  const { user } = useAuth();

  const [groups, setGroups] = useState<PermissionGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [error, setError] = useState('');

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draftAccess, setDraftAccess] = useState<Record<string, MenuAccess>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupAccess, setNewGroupAccess] = useState<MenuAccess>({ ...ALL_FALSE });
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;
    fetch(`/api/users?uid=${user.uid}`)
      .then(r => r.json())
      .then(data => { if (data.user?.role === 'superuser') setIsSuperuser(true); });
  }, [user?.uid]);

  const fetchGroups = useCallback(async () => {
    if (!currentStore?.storeId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(`/api/permissions?type=groups&storeId=${currentStore.storeId}`);
      const data = await res.json();
      setGroups(data.groups || []);
    } catch {
      setError('그룹 목록을 불러오지 못했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [currentStore?.storeId]);

  useEffect(() => { fetchGroups(); }, [fetchGroups]);

  const handleExpand = (group: PermissionGroup) => {
    if (expandedId === group.groupId) {
      setExpandedId(null);
    } else {
      setExpandedId(group.groupId);
      setDraftAccess(prev => ({ ...prev, [group.groupId]: { ...group.menuAccess } }));
    }
  };

  const handleToggle = (groupId: string, key: MenuKey) => {
    if (!isSuperuser) return;
    setDraftAccess(prev => ({
      ...prev,
      [groupId]: { ...prev[groupId], [key]: !prev[groupId]?.[key] },
    }));
  };

  const handleSaveAccess = async (groupId: string) => {
    setSavingId(groupId);
    setError('');
    try {
      const res = await fetch('/api/permissions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'updateGroup', groupId, menuAccess: draftAccess[groupId] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setGroups(prev => prev.map(g =>
        g.groupId === groupId ? { ...g, menuAccess: draftAccess[groupId] } : g
      ));
    } catch (e: any) { setError(e.message); }
    finally { setSavingId(null); }
  };

  const handleSaveName = async (groupId: string) => {
    if (!editingName.trim()) return;
    setSavingId(groupId);
    setError('');
    try {
      const res = await fetch('/api/permissions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'updateGroup', groupId, groupName: editingName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setGroups(prev => prev.map(g =>
        g.groupId === groupId ? { ...g, groupName: editingName.trim() } : g
      ));
      setEditingId(null);
    } catch (e: any) { setError(e.message); }
    finally { setSavingId(null); }
  };

  const handleDelete = async (group: PermissionGroup) => {
    if (group.isDefault) return;
    if (!confirm(`"${group.groupName}" 그룹을 삭제하시겠습니까?`)) return;
    setDeletingId(group.groupId);
    setError('');
    try {
      const res = await fetch(`/api/permissions?type=group&groupId=${group.groupId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setGroups(prev => prev.filter(g => g.groupId !== group.groupId));
      if (expandedId === group.groupId) setExpandedId(null);
    } catch (e: any) { setError(e.message); }
    finally { setDeletingId(null); }
  };

  const handleCreate = async () => {
    if (!newGroupName.trim() || !currentStore?.storeId) return;
    setIsCreating(true);
    setError('');
    try {
      const res = await fetch('/api/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'createGroup',
          storeId: currentStore.storeId,
          groupName: newGroupName.trim(),
          menuAccess: newGroupAccess,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setShowAddModal(false);
      setNewGroupName('');
      setNewGroupAccess({ ...ALL_FALSE });
      await fetchGroups();
    } catch (e: any) { setError(e.message); }
    finally { setIsCreating(false); }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 text-teal-400 animate-spin" />
      </div>
    );
  }

  if (!currentStore?.storeId) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-400">
        <Shield className="w-12 h-12 mb-3 opacity-30" />
        <p className="text-sm">매장을 먼저 선택해주세요.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-teal-400 flex items-center gap-2">
            <Shield className="w-6 h-6" />
            권한 그룹 관리
          </h1>
          <p className="text-slate-400 text-sm mt-1">그룹별 메뉴 접근 권한을 설정합니다.</p>
        </div>
        {isSuperuser && (
          <button
            onClick={() => { setShowAddModal(true); setNewGroupName(''); setNewGroupAccess({ ...ALL_FALSE }); }}
            className="flex items-center gap-2 bg-teal-600 hover:bg-teal-500 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors"
          >
            <Plus className="w-4 h-4" />그룹 추가
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-500/30 rounded-xl p-4 mb-6 text-red-400 text-sm">{error}</div>
      )}

      {/* 그룹 카드 목록 */}
      <div className="space-y-3">
        {groups.map(group => {
          const isExpanded = expandedId === group.groupId;
          const draft = draftAccess[group.groupId] || group.menuAccess;
          const isEditingName = editingId === group.groupId;
          const isSaving = savingId === group.groupId;
          const isDeleting = deletingId === group.groupId;

          return (
            <div key={group.groupId} className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
              {/* 카드 헤더 */}
              <div className="flex items-center gap-3 p-4">
                {isEditingName ? (
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <input
                      type="text"
                      value={editingName}
                      onChange={e => setEditingName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleSaveName(group.groupId);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      autoFocus
                      className="flex-1 bg-slate-800 border border-teal-500 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none"
                    />
                    <button
                      onClick={() => handleSaveName(group.groupId)}
                      disabled={isSaving}
                      className="p-1.5 text-teal-400 hover:text-teal-300 transition-colors"
                    >
                      {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    </button>
                    <button onClick={() => setEditingId(null)} className="p-1.5 text-slate-400 hover:text-slate-200 transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex-1 flex items-center gap-2 min-w-0">
                    <p className="text-white font-bold text-sm truncate">{group.groupName}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 font-medium ${group.isDefault ? 'bg-slate-700 text-slate-400' : 'bg-teal-900/50 text-teal-400 border border-teal-700/50'}`}>
                      {group.isDefault ? '기본그룹' : '커스텀'}
                    </span>
                  </div>
                )}

                {!isEditingName && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {isSuperuser && !group.isDefault && (
                      <>
                        <button
                          onClick={() => { setEditingId(group.groupId); setEditingName(group.groupName); }}
                          className="p-1.5 text-slate-500 hover:text-slate-200 transition-colors"
                          title="이름 수정"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(group)}
                          disabled={isDeleting}
                          className="p-1.5 text-slate-500 hover:text-red-400 transition-colors"
                          title="삭제"
                        >
                          {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => handleExpand(group)}
                      className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 px-2.5 py-1.5 rounded-lg transition-colors"
                    >
                      {isExpanded ? '접기' : '메뉴 설정'}
                      <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                    </button>
                  </div>
                )}
              </div>

              {/* 메뉴 토글 */}
              {isExpanded && (
                <div className="border-t border-slate-800 px-4 pb-4 pt-3">
                  <div className="space-y-1 mb-4">
                    {MENU_LABELS.map(([key, label]) => (
                      <label
                        key={key}
                        className={`flex items-center justify-between py-2 px-3 rounded-lg transition-colors ${isSuperuser ? 'cursor-pointer hover:bg-slate-800/60' : 'cursor-default opacity-80'}`}
                      >
                        <span className="text-slate-300 text-sm">{label}</span>
                        <div className={`relative w-10 h-5 rounded-full transition-colors ${draft[key] ? 'bg-teal-600' : 'bg-slate-700'}`}
                          onClick={() => isSuperuser && handleToggle(group.groupId, key)}
                        >
                          <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${draft[key] ? 'translate-x-5' : 'translate-x-0.5'}`} />
                        </div>
                      </label>
                    ))}
                  </div>
                  {isSuperuser && (
                    <button
                      onClick={() => handleSaveAccess(group.groupId)}
                      disabled={isSaving}
                      className="w-full bg-teal-600 hover:bg-teal-500 disabled:bg-slate-600 text-white py-2.5 rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2"
                    >
                      {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      {isSaving ? '저장 중...' : '저장'}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 그룹 추가 모달 */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-white font-bold mb-4">새 권한 그룹 추가</h3>

            <div className="mb-4">
              <label className="text-slate-400 text-sm mb-1 block">그룹 이름 <span className="text-red-400">*</span></label>
              <input
                type="text"
                value={newGroupName}
                onChange={e => setNewGroupName(e.target.value)}
                placeholder="예) 주임, 파트타이머..."
                autoFocus
                className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-2.5 text-slate-100 text-sm placeholder:text-slate-500 focus:outline-none focus:border-teal-500"
              />
            </div>

            <div className="mb-5">
              <p className="text-slate-400 text-sm mb-2">메뉴 접근 권한</p>
              <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
                {MENU_LABELS.map(([key, label]) => (
                  <label key={key} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-slate-800/60 cursor-pointer">
                    <span className="text-slate-300 text-sm">{label}</span>
                    <div
                      className={`relative w-10 h-5 rounded-full transition-colors ${newGroupAccess[key] ? 'bg-teal-600' : 'bg-slate-700'}`}
                      onClick={() => setNewGroupAccess(prev => ({ ...prev, [key]: !prev[key] }))}
                    >
                      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${newGroupAccess[key] ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setShowAddModal(false)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 py-2.5 rounded-xl text-sm font-medium transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleCreate}
                disabled={isCreating || !newGroupName.trim()}
                className="bg-teal-600 hover:bg-teal-500 disabled:bg-slate-600 text-white py-2.5 rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2"
              >
                {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {isCreating ? '생성 중...' : '생성'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
