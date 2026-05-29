'use client';

import { useState, useEffect } from 'react';
import { useStore } from '@/context/StoreContext';
import { useAuth } from '@/context/AuthContext';
import { ALL_MENUS, Role, DEFAULT_PERMISSIONS } from '@/lib/permissions';
import { isSuperuserEmail } from '@/lib/auth/permissions';
import { Shield, Loader2, Save, ArrowLeft, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';

const ROLES: { key: Role; label: string; color: string }[] = [
  { key: 'superuser', label: 'Superuser', color: 'text-yellow-400' },
  { key: 'admin',     label: 'Admin',     color: 'text-teal-400'   },
  { key: 'user',      label: 'User',      color: 'text-blue-400'   },
  { key: 'staff',     label: 'Staff',     color: 'text-slate-300'  },
];

const CATEGORIES = [...new Set(ALL_MENUS.map(m => m.category))];

export default function PermissionPage() {
  const { currentStore } = useStore();
  const { user } = useAuth();
  const [permissions,      setPermissions]      = useState<Record<string, Record<string, boolean>>>({});
  const [savedPermissions, setSavedPermissions] = useState<Record<string, Record<string, boolean>>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving]   = useState(false);
  const [saveMsg, setSaveMsg]     = useState('');
  const [error, setError]         = useState('');

  const isSuperuser = isSuperuserEmail(user?.email) || currentStore?.role === 'superuser';

  // 변경된 셀 목록 ("role:menuKey")
  const changedCells = new Set<string>();
  for (const role of ROLES.map(r => r.key)) {
    for (const menu of ALL_MENUS) {
      const cur  = permissions[role]?.[menu.key]      ?? true;
      const prev = savedPermissions[role]?.[menu.key] ?? true;
      if (cur !== prev) changedCells.add(`${role}:${menu.key}`);
    }
  }
  const hasChanges = changedCells.size > 0;

  useEffect(() => {
    getAuthJsonHeaders()
      .then(headers => fetch('/api/permissions', { headers }))
      .then(r => r.json())
      .then(data => {
        const p = data.permissions || {};
        setPermissions(p);
        setSavedPermissions(JSON.parse(JSON.stringify(p)));
        setIsLoading(false);
      });
  }, []);

  const handleToggle = (role: Role, menuKey: string) => {
    if (!isSuperuser) return;
    if (role === 'superuser') return;
    setPermissions(prev => ({
      ...prev,
      [role]: {
        ...prev[role],
        [menuKey]: !prev[role]?.[menuKey],
      }
    }));
  };

  const handleReset = (role: Role) => {
    if (!isSuperuser || role === 'superuser') return;
    setPermissions(prev => ({
      ...prev,
      [role]: { ...DEFAULT_PERMISSIONS[role] }
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError('');
    setSaveMsg('');
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/permissions', {
        method: 'POST',
        headers,
        body: JSON.stringify({ permissions }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSavedPermissions(JSON.parse(JSON.stringify(permissions)));
      setSaveMsg('✅ 권한 설정이 저장되었습니다.');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 text-teal-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6">

      {/* 뒤로가기 */}
      <Link
        href="/dashboard/settings"
        className="flex items-center gap-2 text-slate-400 hover:text-teal-400 text-sm mb-6 transition-colors w-fit"
      >
        <ArrowLeft className="w-4 h-4" />
        설정으로 돌아가기
      </Link>

      {/* 헤더 */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-teal-400 flex items-center gap-2">
            <Shield className="w-6 h-6" />
            권한 설정
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            역할별 메뉴 접근 권한을 설정합니다.
            {!isSuperuser && (
              <span className="text-yellow-400 ml-2">
                (조회만 가능 — 변경은 Superuser만 가능)
              </span>
            )}
          </p>
        </div>
        {isSuperuser && (
          <div className="flex items-center gap-3">
            {hasChanges && !isSaving && (
              <span className="flex items-center gap-1.5 text-xs text-yellow-400 bg-yellow-900/30 border border-yellow-500/30 px-3 py-1.5 rounded-lg">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse inline-block" />
                미저장 변경 {changedCells.size}건
              </span>
            )}
            <button
              onClick={handleSave}
              disabled={isSaving || !hasChanges}
              className="flex items-center gap-2 bg-teal-600 hover:bg-teal-500 disabled:bg-slate-700 disabled:text-slate-500 text-white px-6 py-2.5 rounded-xl font-bold transition-colors"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isSaving ? '저장 중...' : '저장'}
            </button>
          </div>
        )}
      </div>

      {saveMsg && <p className="text-teal-400 text-sm mb-4">{saveMsg}</p>}
      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      {/* 권한 테이블 */}
      <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="text-left px-6 py-4 text-slate-400 font-medium w-48">메뉴</th>
              {ROLES.map(role => (
                <th key={role.key} className="px-4 py-4 text-center">
                  <div className="flex flex-col items-center gap-1">
                    <span className={`font-bold ${role.color}`}>{role.label}</span>
                    {isSuperuser && role.key !== 'superuser' && (
                      <button
                        onClick={() => handleReset(role.key)}
                        className="text-slate-500 hover:text-slate-300 text-xs flex items-center gap-1 transition-colors"
                      >
                        <RotateCcw className="w-3 h-3" />
                        초기화
                      </button>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CATEGORIES.map(category => (
              <>
                <tr key={`cat-${category}`} className="bg-slate-800/50">
                  <td colSpan={5} className="px-6 py-2 text-slate-500 text-xs font-bold uppercase tracking-wider">
                    {category}
                  </td>
                </tr>
                {ALL_MENUS
                  .filter(m => m.category === category)
                  .map((menu, idx) => {
                    const rowChanged = ROLES.some(r => changedCells.has(`${r.key}:${menu.key}`));
                    return (
                      <tr key={menu.key} className={`border-t border-slate-800 ${
                        rowChanged ? 'bg-yellow-900/10 border-l-2 border-l-yellow-500/50' : idx % 2 === 0 ? '' : 'bg-slate-800/20'
                      }`}>
                        <td className="px-6 py-4 text-sm flex items-center gap-2">
                          <span className={rowChanged ? 'text-yellow-300' : 'text-slate-300'}>{menu.label}</span>
                          {rowChanged && <span className="text-[10px] text-yellow-500 font-medium">변경됨</span>}
                        </td>
                        {ROLES.map(role => {
                          const cellChanged = changedCells.has(`${role.key}:${menu.key}`);
                          return (
                            <td key={role.key} className={`px-4 py-4 text-center ${cellChanged ? 'bg-yellow-900/20' : ''}`}>
                              <input
                                type="checkbox"
                                checked={permissions[role.key]?.[menu.key] ?? true}
                                onChange={() => handleToggle(role.key, menu.key)}
                                disabled={!isSuperuser || role.key === 'superuser'}
                                className="w-5 h-5 rounded accent-teal-500 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                              />
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                }
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* 범례 */}
      <div className="mt-6 bg-slate-900 border border-slate-700 rounded-xl p-4">
        <p className="text-slate-400 text-sm font-bold mb-3">역할 설명</p>
        <div className="grid grid-cols-2 gap-3">
          {ROLES.map(role => (
            <div key={role.key} className="flex items-start gap-2">
              <span className={`font-bold text-sm ${role.color} w-24`}>{role.label}</span>
              <span className="text-slate-400 text-sm">
                {role.key === 'superuser' && '모든 권한, 모든 매장 접근 가능'}
                {role.key === 'admin' && '자기 매장 모든 권한 (권한설정 제외)'}
                {role.key === 'user' && '자기 매장 설정 메뉴 제외 접근'}
                {role.key === 'staff' && 'User와 동일한 권한'}
              </span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
