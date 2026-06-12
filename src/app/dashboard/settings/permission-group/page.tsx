'use client';

import { useState, useEffect, useCallback, Fragment } from 'react';
import { useStore } from '@/context/StoreContext';
import { useAuth } from '@/context/AuthContext';
import {
  Shield, Plus, Loader2, Pencil, Trash2, X, Check,
  Users, ChevronDown, ChevronUp, Eye, Settings,
} from 'lucide-react';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import {
  MENU_ACCESS_DEFINITIONS,
  MENU_ACCESS_UI_GROUPS,
  MENU_ACCESS_TABLE_COLS,
  createAllFalseMenuAccess,
  menuAccessForGroup,
  type MenuAccess,
  type MenuAccessKey,
} from '@/lib/menuAccessKeys';

interface PermissionGroup {
  groupId: string;
  storeId: string;
  groupName: string;
  menuAccess: MenuAccess;
  isSystem?: boolean;
}

interface StoreUser {
  uid: string;
  name: string;
  email: string;
  groupId: string;
  photoURL?: string;
}

const MENU_COLS = MENU_ACCESS_TABLE_COLS;
const MENU_PREVIEW = MENU_ACCESS_DEFINITIONS.map(d => ({
  key: d.key,
  label: d.previewLabel,
  icon: d.icon,
}));

const ALL_FALSE = createAllFalseMenuAccess();

const GROUP_BADGE: Record<string, string> = {
  superuser: 'bg-purple-900/40 text-purple-300 border border-purple-700/40',
  admin: 'bg-blue-900/40 text-blue-400 border border-blue-700/40',
  staff: 'bg-slate-700 text-slate-300',
};

export default function PermissionGroupPage() {
  const { currentStore } = useStore();
  const { user } = useAuth();

  const [groups, setGroups] = useState<PermissionGroup[]>([]);
  const [storeUsers, setStoreUsers] = useState<StoreUser[]>([]);
  const [isLoadingGroups, setIsLoadingGroups] = useState(true);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [error, setError] = useState('');

  // 더블클릭 → 유저 배정 패널
  const [selectedGroup, setSelectedGroup] = useState<PermissionGroup | null>(null);

  // 클릭 → 미리보기 패널
  const [previewGroupId, setPreviewGroupId] = useState<string | null>(null);

  // 모바일 탭 ('main' | 'preview')
  const [mobileTab, setMobileTab] = useState<'main' | 'preview'>('main');

  // 권한 토글 편집 (인라인 확장 행)
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draftAccess, setDraftAccess] = useState<Record<string, MenuAccess>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  // 이름 편집
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  // 삭제
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // 그룹 추가 모달
  const [showAddModal, setShowAddModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupAccess, setNewGroupAccess] = useState<MenuAccess>({ ...ALL_FALSE });
  const [isCreating, setIsCreating] = useState(false);

  // 유저 배정
  const [assigningUid, setAssigningUid] = useState<string | null>(null);

  // ── 파생 상태: 미리보기 ──
  const previewGroup = previewGroupId ? (groups.find(g => g.groupId === previewGroupId) ?? null) : null;
  const previewAccess: MenuAccess = previewGroupId
    ? (draftAccess[previewGroupId] ?? previewGroup?.menuAccess ?? ALL_FALSE)
    : ALL_FALSE;

  // ── 데이터 로드 ──
  const fetchGroups = useCallback(async () => {
    if (!currentStore?.storeId) { setIsLoadingGroups(false); return; }
    setIsLoadingGroups(true);
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch(`/api/permissions?type=groups&storeId=${currentStore.storeId}`, { headers });
      const data = await res.json();
      setGroups((data.groups || []).map((g: PermissionGroup) => ({
        ...g,
        menuAccess: menuAccessForGroup(g.groupId, g.menuAccess),
      })));
    } catch {
      setError('그룹 목록을 불러오지 못했습니다.');
    } finally {
      setIsLoadingGroups(false);
    }
  }, [currentStore?.storeId]);

  const fetchUsers = useCallback(async () => {
    if (!currentStore?.storeId) { setIsLoadingUsers(false); return; }
    setIsLoadingUsers(true);
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch(`/api/users?storeId=${currentStore.storeId}`, { headers });
      const data = await res.json();
      setStoreUsers(data.users || []);
    } catch {
      setError('멤버 목록을 불러오지 못했습니다.');
    } finally {
      setIsLoadingUsers(false);
    }
  }, [currentStore?.storeId]);

  useEffect(() => { fetchGroups(); fetchUsers(); }, [fetchGroups, fetchUsers]);

  useEffect(() => {
    if (!expandedId) return;
    requestAnimationFrame(() => {
      document.getElementById(`perm-expand-${expandedId}`)?.scrollIntoView({ block: 'nearest' });
    });
  }, [expandedId]);

  const selectedGroupId = selectedGroup?.groupId;
  useEffect(() => {
    if (!selectedGroupId) return;
    const updated = groups.find(g => g.groupId === selectedGroupId);
    if (updated) setSelectedGroup(updated);
  }, [groups, selectedGroupId]);

  // ── 권한 토글 (localChanges — 저장 전 로컬만) ──
  const handleToggle = (groupId: string, key: MenuAccessKey) => {
    const group = groups.find(g => g.groupId === groupId);
    const base = draftAccess[groupId] ?? group?.menuAccess ?? ALL_FALSE;
    setDraftAccess(prev => ({
      ...prev,
      [groupId]: { ...base, [key]: !base[key] },
    }));
  };

  const hasGroupChanges = (groupId: string) => {
    const group = groups.find(g => g.groupId === groupId);
    if (!group) return false;
    const draft = draftAccess[groupId];
    if (!draft) return false;
    return MENU_COLS.some(([key]) => draft[key] !== (group.menuAccess?.[key] ?? false));
  };

  const unsavedCount = groups.filter(g => hasGroupChanges(g.groupId)).length;

  const handleSaveAll = async () => {
    const changedIds = groups.filter(g => hasGroupChanges(g.groupId)).map(g => g.groupId);
    if (!changedIds.length) return;
    setSavingId('all');
    setError('');
    try {
      const headers = await getAuthJsonHeaders();
      await Promise.all(changedIds.map(async groupId => {
        const res = await fetch('/api/permissions', {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            type: 'updateGroup',
            groupId,
            storeId: currentStore?.storeId,
            menuAccess: draftAccess[groupId],
          }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || '저장 실패');
      }));
      setGroups(prev => prev.map(g =>
        draftAccess[g.groupId] ? { ...g, menuAccess: draftAccess[g.groupId] } : g
      ));
      setDraftAccess(prev => {
        const next = { ...prev };
        changedIds.forEach(id => delete next[id]);
        return next;
      });
      setExpandedId(null);
    } catch (e: any) { setError(e.message); }
    finally { setSavingId(null); }
  };

  const handleExpand = (group: PermissionGroup) => {
    if (expandedId === group.groupId) {
      setExpandedId(null);
      // 미리보기는 유지
    } else {
      setExpandedId(group.groupId);
      setDraftAccess(prev => ({ ...prev, [group.groupId]: { ...ALL_FALSE, ...group.menuAccess } }));
      setPreviewGroupId(group.groupId);  // 미리보기 업데이트
      setMobileTab('main');              // 모바일: 편집 행 보여주기
    }
  };

  const handleSaveAccess = async (groupId: string) => {
    setSavingId(groupId);
    setError('');
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/permissions', {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          type: 'updateGroup',
          groupId,
          storeId: currentStore?.storeId,
          menuAccess: draftAccess[groupId],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setGroups(prev => prev.map(g =>
        g.groupId === groupId ? { ...g, menuAccess: draftAccess[groupId] } : g
      ));
      setExpandedId(null);
    } catch (e: any) { setError(e.message); }
    finally { setSavingId(null); }
  };

  // ── 이름 수정 ──
  const handleSaveName = async (groupId: string) => {
    if (!editingName.trim()) return;
    setSavingId(groupId);
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/permissions', {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          type: 'updateGroup',
          groupId,
          storeId: currentStore?.storeId,
          groupName: editingName.trim(),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setGroups(prev => prev.map(g =>
        g.groupId === groupId ? { ...g, groupName: editingName.trim() } : g
      ));
      setEditingId(null);
    } catch (e: any) { setError(e.message); }
    finally { setSavingId(null); }
  };

  // ── 삭제 ──
  const handleDelete = async (group: PermissionGroup) => {
    if (group.isSystem) return;
    if (!confirm(`"${group.groupName}" 그룹을 삭제하시겠습니까?`)) return;
    setDeletingId(group.groupId);
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch(
        `/api/permissions?type=group&groupId=${group.groupId}&storeId=${currentStore?.storeId || ''}`,
        { method: 'DELETE', headers },
      );
      if (!res.ok) throw new Error((await res.json()).error);
      setGroups(prev => prev.filter(g => g.groupId !== group.groupId));
      if (selectedGroup?.groupId === group.groupId) setSelectedGroup(null);
      if (previewGroupId === group.groupId) setPreviewGroupId(null);
      if (expandedId === group.groupId) setExpandedId(null);
    } catch (e: any) { setError(e.message); }
    finally { setDeletingId(null); }
  };

  // ── 그룹 생성 ──
  const handleCreate = async () => {
    if (!newGroupName.trim() || !currentStore?.storeId) return;
    setIsCreating(true);
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/permissions', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          type: 'createGroup',
          storeId: currentStore.storeId,
          groupName: newGroupName.trim(),
          menuAccess: newGroupAccess,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setShowAddModal(false);
      setNewGroupName('');
      setNewGroupAccess({ ...ALL_FALSE });
      await fetchGroups();
    } catch (e: any) { setError(e.message); }
    finally { setIsCreating(false); }
  };

  // ── 유저 배정 ──
  const handleAssign = async (targetUid: string, groupId: string) => {
    setAssigningUid(targetUid);
    try {
      const res = await fetch('/api/users', {
        method: 'PUT',
        headers: await getAuthJsonHeaders(),
        body: JSON.stringify({
          action: 'assignGroup',
          uid: targetUid,
          storeId: currentStore?.storeId,
          groupId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '배정 실패');
      setStoreUsers(prev => prev.map(u =>
        u.uid === targetUid ? { ...u, groupId } : u
      ));
    } catch (e: any) { setError(e.message); }
    finally { setAssigningUid(null); }
  };

  const memberCount = (groupId: string) =>
    storeUsers.filter(u => u.groupId === groupId).length;

  const pendingCount = storeUsers.filter(u => !u.groupId).length;

  const groupName = (groupId: string) => {
    if (!groupId) return '대기';
    return groups.find(g => g.groupId === groupId)?.groupName || groupId;
  };

  if (!currentStore?.storeId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400">
        <Shield className="w-12 h-12 mb-3 opacity-30" />
        <p className="text-sm">매장을 먼저 선택해주세요.</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-950">

      {/* ── 모바일 탭 바 (미리보기 열렸을 때만) ── */}
      {previewGroup && (
        <div className="flex md:hidden border-b border-slate-800 bg-slate-900/90 shrink-0">
          <button
            onClick={() => setMobileTab('main')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${mobileTab === 'main' ? 'text-teal-400 border-b-2 border-teal-400' : 'text-slate-400'}`}
          >
            <Settings className="w-3.5 h-3.5" />권한 설정
          </button>
          <button
            onClick={() => setMobileTab('preview')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${mobileTab === 'preview' ? 'text-teal-400 border-b-2 border-teal-400' : 'text-slate-400'}`}
          >
            <Eye className="w-3.5 h-3.5" />미리보기
          </button>
        </div>
      )}

      {/* 헤더 */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-teal-400" />
          <div>
            <h1 className="text-lg font-bold text-teal-400">권한 그룹 관리</h1>
            {currentStore?.storeName && (
              <p className="text-[11px] text-slate-500 mt-0.5">현재 매장: {currentStore.storeName}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {unsavedCount > 0 && (
            <span className="hidden sm:inline text-xs text-yellow-400 bg-yellow-900/30 border border-yellow-500/30 px-2 py-1 rounded-lg">
              저장하지 않은 변경사항 {unsavedCount}개
            </span>
          )}
          {unsavedCount > 0 && (
            <button
              onClick={handleSaveAll}
              disabled={savingId === 'all'}
              className="flex items-center gap-1 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-sm font-bold"
            >
              {savingId === 'all' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              일괄 저장
            </button>
          )}
          <button
            onClick={() => { setShowAddModal(true); setNewGroupName(''); setNewGroupAccess({ ...ALL_FALSE }); }}
            className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-500 text-white px-3 py-1.5 rounded-lg text-sm font-bold transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />그룹 추가
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-3 bg-red-900/30 border border-red-500/30 rounded-lg p-3 text-red-400 text-xs shrink-0">
          {error}
          <button className="ml-2 underline" onClick={() => setError('')}>닫기</button>
        </div>
      )}

      {/* ── 메인 row ── */}
      <div className="flex flex-col md:flex-row md:items-start">

        {/* ═══ 좌측 콘텐츠 ═══ */}
        <div
          className={`flex-1 min-w-0 ${
            previewGroup && mobileTab === 'preview' ? 'hidden md:block' : ''
          }`}
        >
          {/* ── 권한 그룹 테이블 ── */}
          <div className="border-b border-slate-800">
            <div className="px-6 pt-4 pb-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                권한 그룹 (기본 3개: 슈퍼유저 · 점장 · 직원 — 삭제 불가, 이름 수정 가능)
                <span className="text-slate-600 normal-case ml-1">
                  (클릭: 권한 편집 + 미리보기  /  더블클릭: 멤버 배정)
                </span>
              </p>
            </div>

            {isLoadingGroups ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 text-teal-400 animate-spin" />
              </div>
            ) : (
              <div className="px-6 pb-4">
                <div className="overflow-x-auto overflow-y-visible overscroll-x-contain">
                <table className="w-full text-sm border-collapse min-w-[720px]">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left py-2 pr-4 text-slate-400 font-medium text-xs w-36">그룹명</th>
                      {MENU_COLS.map(([key, label]) => (
                        <th key={key} className="text-center py-2 px-1.5 text-slate-400 font-medium text-xs w-14">{label}</th>
                      ))}
                      <th className="text-center py-2 px-2 text-slate-400 font-medium text-xs w-12">인원</th>
                      <th className="w-20" />
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map(group => {
                      const isExpanded = expandedId === group.groupId;
                      const isPreviewing = previewGroupId === group.groupId;
                      const isSelected = selectedGroup?.groupId === group.groupId;
                      const draft = draftAccess[group.groupId] || group.menuAccess;
                      const isSaving = savingId === group.groupId;
                      const isEditingName = editingId === group.groupId;

                      const rowChanged = hasGroupChanges(group.groupId);

                      return (
                        <Fragment key={group.groupId}>
                          <tr
                            onDoubleClick={() => setSelectedGroup(isSelected ? null : group)}
                            onClick={() => handleExpand(group)}
                            className={`border-b border-slate-800/60 cursor-pointer transition-colors select-none
                              ${rowChanged ? 'bg-yellow-900/10 border-l-2 border-l-yellow-500/50' :
                                isSelected   ? 'bg-purple-900/15' :
                                isPreviewing ? 'bg-teal-900/15' :
                                               'hover:bg-slate-800/40'}
                            `}
                            title="클릭: 권한 편집 + 미리보기  /  더블클릭: 멤버 배정"
                          >
                            {/* 그룹명 */}
                            <td className="py-2.5 pr-4">
                              {isEditingName ? (
                                <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                  <input
                                    type="text"
                                    value={editingName}
                                    onChange={e => setEditingName(e.target.value)}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') handleSaveName(group.groupId);
                                      if (e.key === 'Escape') setEditingId(null);
                                    }}
                                    autoFocus
                                    className="bg-slate-800 border border-teal-500 rounded px-2 py-0.5 text-white text-xs w-24 focus:outline-none"
                                  />
                                  <button onClick={() => handleSaveName(group.groupId)} className="text-teal-400 hover:text-teal-300">
                                    {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                  </button>
                                  <button onClick={() => setEditingId(null)} className="text-slate-400 hover:text-slate-200">
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-white font-medium text-xs">{group.groupName}</span>
                                  {group.isSystem && (
                                    <span className="text-[10px] px-1.5 py-0.5 bg-slate-700 text-slate-400 rounded-full">시스템</span>
                                  )}
                                  {isPreviewing && (
                                    <Eye className="w-3 h-3 text-teal-400/60" />
                                  )}
                                </div>
                              )}
                            </td>

                            {/* 메뉴 접근 아이콘 */}
                            {MENU_COLS.map(([key]) => (
                              <td key={key} className="text-center py-2.5 px-1.5">
                                <span className={`inline-block w-2.5 h-2.5 rounded-full ${(group.menuAccess?.[key]) ? 'bg-teal-400' : 'bg-slate-700'}`} />
                              </td>
                            ))}

                            {/* 인원 */}
                            <td className="text-center py-2.5 px-2">
                              <span className="text-slate-300 text-xs">{memberCount(group.groupId)}</span>
                            </td>

                            {/* 액션 */}
                            <td className="text-right py-2.5 pl-2" onClick={e => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-0.5">
                                <button
                                  onClick={() => { setEditingId(group.groupId); setEditingName(group.groupName); }}
                                  className="p-1 text-slate-500 hover:text-slate-300 transition-colors rounded"
                                  title="이름 수정"
                                >
                                  <Pencil className="w-3 h-3" />
                                </button>
                                {!group.isSystem && (
                                  <button
                                    onClick={() => handleDelete(group)}
                                    disabled={deletingId === group.groupId}
                                    className="p-1 text-slate-500 hover:text-red-400 transition-colors rounded"
                                    title="삭제"
                                  >
                                    {deletingId === group.groupId
                                      ? <Loader2 className="w-3 h-3 animate-spin" />
                                      : <Trash2 className="w-3 h-3" />}
                                  </button>
                                )}
                                {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-500" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-500" />}
                              </div>
                            </td>
                          </tr>

                          {/* 권한 편집 확장 행 */}
                          {isExpanded && (
                            <tr id={`perm-expand-${group.groupId}`} className="bg-slate-900/60 border-b border-slate-800/60">
                              <td colSpan={MENU_COLS.length + 3} className="px-4 py-3" onClick={e => e.stopPropagation()}>
                                <div className="space-y-4">
                                  {MENU_ACCESS_UI_GROUPS.map(section => (
                                    <div key={section.label}>
                                      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                                        {section.label}
                                      </p>
                                      <div className="flex items-center gap-4 flex-wrap">
                                        {section.keys.map(key => {
                                          const def = MENU_ACCESS_DEFINITIONS.find(d => d.key === key);
                                          const label = def?.label || key;
                                          return (
                                            <label key={key} className="flex items-center gap-1.5 cursor-pointer min-w-[100px]">
                                              <div
                                                className={`relative w-8 h-4 rounded-full transition-colors flex-shrink-0 ${draft[key] ? 'bg-teal-600' : 'bg-slate-700'}`}
                                                onClick={e => { e.stopPropagation(); handleToggle(group.groupId, key); }}
                                              >
                                                <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${draft[key] ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                              </div>
                                              <span className="text-xs text-slate-300">{label}</span>
                                            </label>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  ))}
                                  <div className="flex items-center gap-2 pt-1">
                                    <button
                                      onClick={() => handleSaveAccess(group.groupId)}
                                      disabled={isSaving}
                                      className="ml-auto flex items-center gap-1 bg-teal-600 hover:bg-teal-500 disabled:bg-slate-600 text-white px-3 py-1 rounded-lg text-xs font-bold transition-colors"
                                    >
                                      {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                      저장
                                    </button>
                                    <button onClick={() => setExpandedId(null)} className="text-slate-400 hover:text-slate-200 p-1">
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </div>
            )}
          </div>

          {/* ── 유저 테이블 ── */}
          <div className="pb-16 safe-bottom">
            <div className="px-6 pt-4 pb-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">멤버 목록</p>
            </div>

            {isLoadingUsers ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 text-teal-400 animate-spin" />
              </div>
            ) : storeUsers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                <Users className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-sm">소속 멤버가 없습니다.</p>
              </div>
            ) : (
              <div className="px-6 pb-6">
                <div className="overflow-x-auto overflow-y-visible overscroll-x-contain">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left py-2 pr-4 text-slate-400 font-medium text-xs">이름</th>
                      <th className="text-left py-2 pr-4 text-slate-400 font-medium text-xs">이메일</th>
                      <th className="text-left py-2 text-slate-400 font-medium text-xs">현재 그룹</th>
                    </tr>
                  </thead>
                  <tbody>
                    {storeUsers.map(u => (
                      <tr key={u.uid} className="border-b border-slate-800/60 hover:bg-slate-800/30 transition-colors">
                        <td className="py-2.5 pr-4">
                          <span className="text-white text-xs font-medium">{u.name || u.uid}</span>
                        </td>
                        <td className="py-2.5 pr-4">
                          <span className="text-slate-400 text-xs">{u.email}</span>
                        </td>
                        <td className="py-2.5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                            !u.groupId
                              ? 'bg-orange-900/40 text-orange-400 border border-orange-700/40'
                              : GROUP_BADGE[u.groupId] || 'bg-teal-900/40 text-teal-400 border border-teal-700/40'
                          }`}
                          >
                            {groupName(u.groupId)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ═══ 우측: 미리보기 패널 ═══ */}
        {previewGroup && (
          <div className={`border-t md:border-t-0 md:border-l border-slate-700 bg-slate-950/60
            w-full md:w-64 shrink-0
            ${mobileTab === 'preview' ? 'block' : 'hidden md:block'}`}
          >
            {/* 패널 헤더 */}
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-teal-400" />
                <div>
                  <p className="text-white font-bold text-sm">{previewGroup.groupName}</p>
                  <p className="text-slate-500 text-[10px] mt-0.5">미리보기 (실시간)</p>
                </div>
              </div>
              <button
                onClick={() => { setPreviewGroupId(null); setMobileTab('main'); }}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-5 pb-16 safe-bottom">

              {/* 사이드바 미리보기 */}
              <div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2.5">
                  사이드바 미리보기
                </p>
                <div className="bg-slate-900 border border-slate-700/60 rounded-xl p-3 space-y-1">
                  {MENU_PREVIEW.filter(m => previewAccess[m.key]).map(m => (
                    <div key={m.key} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-slate-800/60 text-slate-200">
                      <span className="text-base leading-none">{m.icon}</span>
                      <span className="text-xs font-medium">{m.label}</span>
                    </div>
                  ))}
                  {MENU_PREVIEW.every(m => !previewAccess[m.key]) && (
                    <p className="text-slate-600 text-[10px] text-center py-1">접근 가능한 메뉴 없음</p>
                  )}
                </div>
              </div>

              {/* 접근 가능 */}
              {MENU_PREVIEW.some(m => previewAccess[m.key]) && (
                <div>
                  <p className="text-[10px] font-semibold text-teal-500 uppercase tracking-wider mb-2">
                    접근 가능 ({MENU_PREVIEW.filter(m => previewAccess[m.key]).length})
                  </p>
                  <div className="space-y-1.5">
                    {MENU_PREVIEW.filter(m => previewAccess[m.key]).map(m => (
                      <div key={m.key} className="flex items-center gap-2 text-xs text-teal-300">
                        <Check className="w-3 h-3 text-teal-400 flex-shrink-0" />
                        <span className="mr-1">{m.icon}</span>
                        <span>{m.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 접근 불가 */}
              {MENU_PREVIEW.some(m => !previewAccess[m.key]) && (
                <div>
                  <p className="text-[10px] font-semibold text-red-500/60 uppercase tracking-wider mb-2">
                    접근 불가 ({MENU_PREVIEW.filter(m => !previewAccess[m.key]).length})
                  </p>
                  <div className="space-y-1.5">
                    {MENU_PREVIEW.filter(m => !previewAccess[m.key]).map(m => (
                      <div key={m.key} className="flex items-center gap-2 text-xs text-slate-600">
                        <X className="w-3 h-3 flex-shrink-0" />
                        <span className="line-through">{m.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 멤버 목록 */}
              {(() => {
                const members = storeUsers.filter(u => u.groupId === previewGroupId);
                return (
                  <div>
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                      소속 멤버 ({members.length}명)
                    </p>
                    {members.length === 0 ? (
                      <p className="text-slate-700 text-[10px] text-center py-2">배정된 멤버 없음</p>
                    ) : (
                      <div className="space-y-1">
                        {members.map(u => (
                          <div key={u.uid} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-slate-800/50">
                            {u.photoURL ? (
                              <img src={u.photoURL} alt="" className="w-5 h-5 rounded-full flex-shrink-0 object-cover" />
                            ) : (
                              <div className="w-5 h-5 rounded-full bg-slate-700 flex-shrink-0 flex items-center justify-center text-[8px] text-slate-400 font-bold">
                                {(u.name || u.email)?.[0]?.toUpperCase() ?? '?'}
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="text-white text-[10px] font-medium truncate">{u.name || u.uid}</p>
                              <p className="text-slate-500 text-[9px] truncate">{u.email}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* 저장 전 변경사항 안내 */}
              {expandedId === previewGroupId && (
                <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-lg px-3 py-2">
                  <p className="text-yellow-400 text-[10px]">⚠ 저장 전 상태입니다. 토글을 변경하면 실시간으로 미리보기가 업데이트됩니다.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ 유저 배정 패널 (더블클릭) ═══ */}
        {selectedGroup && (
          <div className="hidden md:block md:w-64 shrink-0 md:border-l md:border-slate-700 bg-slate-900">
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-800">
              <div>
                <p className="text-white font-bold text-sm">{selectedGroup.groupName}</p>
                <p className="text-slate-400 text-xs mt-0.5">멤버 배정</p>
              </div>
              <button onClick={() => setSelectedGroup(null)} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-4 py-3 bg-slate-800/50 border-b border-slate-800 flex gap-4">
              <div className="text-xs text-slate-400">
                배정됨 <strong className="text-teal-400">{memberCount(selectedGroup.groupId)}명</strong>
              </div>
              {pendingCount > 0 && (
                <div className="text-xs text-slate-400">
                  대기 <strong className="text-orange-400">{pendingCount}명</strong>
                </div>
              )}
            </div>

            <div className="p-3 space-y-3 pb-16 safe-bottom">
              {storeUsers.length === 0 ? (
                <p className="text-slate-500 text-xs text-center py-8">소속 멤버가 없습니다.</p>
              ) : (
                <>
                  {storeUsers.filter(u => !u.groupId).length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-orange-400 uppercase tracking-wider mb-1.5 px-1">
                        대기 중 ({storeUsers.filter(u => !u.groupId).length}명)
                      </p>
                      <div className="space-y-1">
                        {storeUsers.filter(u => !u.groupId).map(u => (
                          <UserRow key={u.uid} u={u} state="pending" selectedGroupId={selectedGroup.groupId} assigningUid={assigningUid} groupName={groupName} onAssign={handleAssign} />
                        ))}
                      </div>
                    </div>
                  )}
                  {storeUsers.filter(u => u.groupId === selectedGroup.groupId).length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-teal-400 uppercase tracking-wider mb-1.5 px-1">
                        배정됨 ({memberCount(selectedGroup.groupId)}명)
                      </p>
                      <div className="space-y-1">
                        {storeUsers.filter(u => u.groupId === selectedGroup.groupId).map(u => (
                          <UserRow key={u.uid} u={u} state="assigned" selectedGroupId={selectedGroup.groupId} assigningUid={assigningUid} groupName={groupName} onAssign={handleAssign} />
                        ))}
                      </div>
                    </div>
                  )}
                  {storeUsers.filter(u => u.groupId && u.groupId !== selectedGroup.groupId).length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 px-1">
                        다른 그룹 ({storeUsers.filter(u => u.groupId && u.groupId !== selectedGroup.groupId).length}명)
                      </p>
                      <div className="space-y-1">
                        {storeUsers.filter(u => u.groupId && u.groupId !== selectedGroup.groupId).map(u => (
                          <UserRow key={u.uid} u={u} state="other" selectedGroupId={selectedGroup.groupId} assigningUid={assigningUid} groupName={groupName} onAssign={handleAssign} />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ═══ 그룹 추가 모달 ═══ */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-white font-bold mb-4">새 권한 그룹 추가</h3>
            <div className="mb-4">
              <label className="text-slate-400 text-xs mb-1.5 block">그룹 이름 <span className="text-red-400">*</span></label>
              <input
                type="text"
                value={newGroupName}
                onChange={e => setNewGroupName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
                placeholder="예) 주임, 파트타이머..."
                autoFocus
                className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-2.5 text-slate-100 text-sm placeholder:text-slate-500 focus:outline-none focus:border-teal-500"
              />
            </div>
            <div className="mb-5 max-h-64 overflow-y-auto space-y-3">
              <p className="text-slate-400 text-xs mb-2">메뉴 접근 권한</p>
              {MENU_ACCESS_UI_GROUPS.map(section => (
                <div key={section.label}>
                  <p className="text-[10px] font-semibold text-slate-500 mb-1.5">{section.label}</p>
                  <div className="grid grid-cols-2 gap-y-1.5 gap-x-2">
                    {section.keys.map(key => {
                      const def = MENU_ACCESS_DEFINITIONS.find(d => d.key === key);
                      const label = def?.label || key;
                      return (
                        <label key={key} className="flex items-center gap-2 cursor-pointer">
                          <div
                            className={`relative w-8 h-4 rounded-full transition-colors flex-shrink-0 ${newGroupAccess[key] ? 'bg-teal-600' : 'bg-slate-700'}`}
                            onClick={() => setNewGroupAccess(prev => ({ ...prev, [key]: !prev[key] }))}
                          >
                            <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${newGroupAccess[key] ? 'translate-x-4' : 'translate-x-0.5'}`} />
                          </div>
                          <span className="text-slate-300 text-xs">{label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setShowAddModal(false)} className="bg-slate-800 hover:bg-slate-700 text-slate-300 py-2.5 rounded-xl text-sm font-medium transition-colors">취소</button>
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

// ── UserRow 서브컴포넌트 ──
function UserRow({
  u, state, selectedGroupId, assigningUid, groupName, onAssign,
}: {
  u: StoreUser;
  state: 'pending' | 'assigned' | 'other';
  selectedGroupId: string;
  assigningUid: string | null;
  groupName: (id: string) => string;
  onAssign: (uid: string, groupId: string) => void;
}) {
  const isAssigning = assigningUid === u.uid;
  const rowBg =
    state === 'pending'  ? 'bg-orange-900/10 border border-orange-700/20' :
    state === 'assigned' ? 'bg-teal-900/20 border border-teal-700/30' :
                           'bg-slate-800/50 hover:bg-slate-800';

  return (
    <div className={`flex items-center justify-between p-2.5 rounded-lg transition-colors ${rowBg}`}>
      <div className="min-w-0 flex-1 mr-2">
        <p className="text-white text-xs font-medium truncate">{u.name || u.uid}</p>
        <p className="text-slate-500 text-[10px] truncate">{u.email}</p>
        {state === 'other'   && <p className="text-slate-600 text-[10px]">현재: {groupName(u.groupId)}</p>}
        {state === 'pending' && <p className="text-orange-500 text-[10px]">그룹 미배정</p>}
      </div>
      {state === 'assigned' ? (
        <button
          onClick={() => onAssign(u.uid, '')}
          disabled={isAssigning}
          className="group/cancel flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold transition-colors text-teal-400 bg-teal-900/20 hover:text-red-400 hover:bg-red-900/20 disabled:opacity-50"
        >
          {isAssigning ? <Loader2 className="w-3 h-3 animate-spin" /> : (
            <>
              <Check className="w-3 h-3 group-hover/cancel:hidden" />
              <X className="w-3 h-3 hidden group-hover/cancel:block" />
              <span className="group-hover/cancel:hidden">배정됨</span>
              <span className="hidden group-hover/cancel:block">취소</span>
            </>
          )}
        </button>
      ) : (
        <button
          onClick={() => onAssign(u.uid, selectedGroupId)}
          disabled={isAssigning}
          className={`flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold transition-colors disabled:opacity-50
            ${state === 'pending' ? 'bg-orange-700 hover:bg-orange-600 text-white' : 'bg-slate-700 hover:bg-teal-700 text-slate-300 hover:text-white'}`}
        >
          {isAssigning ? <Loader2 className="w-3 h-3 animate-spin" /> : '배정'}
        </button>
      )}
    </div>
  );
}
