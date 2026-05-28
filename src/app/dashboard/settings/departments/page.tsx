'use client';

import { useState, useEffect, useCallback } from 'react';
import { useStore } from '@/context/StoreContext';
import { Building2, Plus, Pencil, Trash2, Loader2, Check, X } from 'lucide-react';
import { getAuthJsonHeaders, getAuthHeaders } from '@/lib/getAuthHeaders';

interface Department {
  id: string;
  name: string;
  memberCount: number;
  createdAt: string;
}

export default function DepartmentsPage() {
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';

  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');

  const [newName,    setNewName]    = useState('');
  const [adding,     setAdding]     = useState(false);
  const [editId,     setEditId]     = useState('');
  const [editName,   setEditName]   = useState('');
  const [saving,     setSaving]     = useState(false);
  const [deletingId, setDeletingId] = useState('');

  const load = useCallback(async () => {
    if (!storeId) { setLoading(false); return; }
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/hr/departments?storeId=${storeId}`, { headers });
      const data = await res.json();
      setDepartments(data.departments || []);
    } catch {
      setError('부서 목록을 불러오지 못했습니다');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setAdding(true);
    setError('');
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/hr/departments', {
        method: 'POST',
        headers,
        body: JSON.stringify({ storeId, name: newName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '추가 실패');
      setNewName('');
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAdding(false);
    }
  };

  const handleEdit = async (id: string) => {
    if (!editName.trim()) return;
    setSaving(true);
    setError('');
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/hr/departments', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ id, storeId, name: editName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '수정 실패');
      setEditId('');
      setEditName('');
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('부서를 삭제하시겠습니까?\n소속 직원이 없는 경우에만 삭제됩니다.')) return;
    setDeletingId(id);
    setError('');
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/hr/departments?id=${id}&storeId=${storeId}`, { method: 'DELETE', headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '삭제 실패');
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDeletingId('');
    }
  };

  if (!storeId) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400">
        <Building2 className="w-10 h-10 mb-3 opacity-30" />
        <p className="text-sm">매장을 먼저 선택해주세요.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="flex items-center gap-2 mb-2">
        <Building2 className="w-5 h-5 text-teal-400" />
        <h1 className="text-lg font-bold text-teal-400">부서 관리</h1>
      </div>
      <p className="text-slate-400 text-sm mb-6">매장 부서를 추가·수정·삭제합니다.</p>

      {error && (
        <div className="bg-red-900/30 border border-red-500/30 rounded-xl p-3 mb-4 text-red-400 text-sm flex items-center justify-between">
          {error}
          <button onClick={() => setError('')}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* 부서 추가 */}
      <div className="flex gap-2 mb-6">
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="새 부서명 입력"
          className="flex-1 bg-slate-800 border border-slate-600 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
        />
        <button
          onClick={handleAdd}
          disabled={adding || !newName.trim()}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-black font-semibold text-sm rounded-xl transition-colors"
        >
          {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          추가
        </button>
      </div>

      {/* 부서 목록 */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 text-teal-400 animate-spin" />
        </div>
      ) : departments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-500">
          <Building2 className="w-10 h-10 mb-3 opacity-30" />
          <p className="text-sm">등록된 부서가 없습니다.</p>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
          <div className="grid grid-cols-[1fr_80px_120px] border-b border-slate-700 px-4 py-2.5 bg-slate-800/60">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">부서명</span>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider text-center">인원</span>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider text-center">관리</span>
          </div>
          <div className="divide-y divide-slate-800">
            {departments.map(dept => (
              <div key={dept.id} className="grid grid-cols-[1fr_80px_120px] items-center px-4 py-3">
                <div>
                  {editId === dept.id ? (
                    <input
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleEdit(dept.id)}
                      autoFocus
                      className="w-full bg-slate-700 border border-teal-500/50 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none"
                    />
                  ) : (
                    <span className="text-white text-sm font-medium">{dept.name}</span>
                  )}
                </div>
                <div className="text-center">
                  <span className="text-slate-400 text-sm">{dept.memberCount || 0}명</span>
                </div>
                <div className="flex items-center justify-center gap-1.5">
                  {editId === dept.id ? (
                    <>
                      <button
                        onClick={() => handleEdit(dept.id)}
                        disabled={saving}
                        className="p-1.5 bg-teal-600/20 hover:bg-teal-600/40 text-teal-400 rounded-lg transition-colors"
                      >
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => { setEditId(''); setEditName(''); }}
                        className="p-1.5 bg-slate-700 hover:bg-slate-600 text-slate-400 rounded-lg transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => { setEditId(dept.id); setEditName(dept.name); }}
                        className="p-1.5 bg-slate-700 hover:bg-slate-600 text-slate-400 hover:text-white rounded-lg transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(dept.id)}
                        disabled={deletingId === dept.id}
                        className="p-1.5 bg-slate-700 hover:bg-red-900/40 text-slate-400 hover:text-red-400 rounded-lg transition-colors"
                      >
                        {deletingId === dept.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Trash2 className="w-3.5 h-3.5" />
                        }
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
