'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Store, Loader2, Check, X, Trash2, Edit2, ArrowLeft,
  Clock, Shield, AlertCircle,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { isSuperuser } from '@/lib/auth/permissions';
import { getAuthJsonHeaders, getAuthHeaders } from '@/lib/getAuthHeaders';

const SIDO_LIST = ['서울','부산','대구','인천','광주','대전','울산','세종',
  '경기','강원','충북','충남','전북','전남','경북','경남','제주'];

interface StoreRecord {
  storeId: string;
  storeName: string;
  ownerName?: string;
  region?: string;
  regionSido?: string;
  regionSigungu?: string;
  tradeAreaCode?: string;
  address?: string;
  phone?: string;
  businessNumber?: string;
  status?: string;
  rejectedReason?: string;
}

const STATUS_LABELS: Record<string, string> = {
  pending: '승인 대기',
  active: '활성',
  rejected: '거절',
};

export default function StoresManagementPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [isSuperuserUser, setIsSuperuserUser] = useState(false);
  const [stores, setStores] = useState<StoreRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'active' | 'rejected'>('all');

  const [editTarget, setEditTarget] = useState<StoreRecord | null>(null);
  const [rejectTarget, setRejectTarget] = useState<StoreRecord | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [editForm, setEditForm] = useState({
    storeName: '', ownerName: '', regionSido: '', regionSigungu: '',
    tradeAreaCode: '',
    address: '', phone: '', businessNumber: '',
  });

  useEffect(() => {
    if (!user?.uid) return;
    getAuthHeaders()
      .then(headers => fetch(`/api/users?uid=${user.uid}`, { headers }))
      .then(r => r.json())
      .then(data => {
        const role = data.user?.role;
        const groupId = data.user?.groupId;
        const su = isSuperuser(user?.email, role || groupId);
        setIsSuperuserUser(su);
        if (!su) router.push('/dashboard/settings');
      })
      .catch(() => router.push('/dashboard/settings'));
  }, [user?.uid, user?.email, router]);

  const fetchStores = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/store?allStores=true', { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStores(data.stores || []);
    } catch (e: any) {
      setError(e.message || '매장 목록을 불러오지 못했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSuperuserUser) fetchStores();
  }, [isSuperuserUser, fetchStores]);

  const filtered = stores.filter(s => {
    const st = s.status || 'active';
    if (filter === 'all') return true;
    return st === filter;
  });

  const handleApprove = async (storeId: string) => {
    setActionLoading(storeId);
    try {
      const res = await fetch('/api/store', {
        method: 'POST',
        headers: await getAuthJsonHeaders(),
        body: JSON.stringify({ action: 'approveStore', storeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await fetchStores();
    } catch (e: any) { setError(e.message); }
    finally { setActionLoading(null); }
  };

  const handleRejectConfirm = async () => {
    if (!rejectTarget) return;
    setActionLoading(rejectTarget.storeId);
    try {
      const res = await fetch('/api/store', {
        method: 'POST',
        headers: await getAuthJsonHeaders(),
        body: JSON.stringify({
          action: 'rejectStore',
          storeId: rejectTarget.storeId,
          reason: rejectReason,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRejectTarget(null);
      setRejectReason('');
      await fetchStores();
    } catch (e: any) { setError(e.message); }
    finally { setActionLoading(null); }
  };

  const handleDelete = async (store: StoreRecord) => {
    if (!confirm(`"${store.storeName}" 매장을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) return;
    setActionLoading(store.storeId);
    try {
      const res = await fetch('/api/store', {
        method: 'POST',
        headers: await getAuthJsonHeaders(),
        body: JSON.stringify({ action: 'deleteStore', storeId: store.storeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await fetchStores();
    } catch (e: any) { setError(e.message); }
    finally { setActionLoading(null); }
  };

  const openEdit = (store: StoreRecord) => {
    setEditTarget(store);
    setEditForm({
      storeName: store.storeName || '',
      ownerName: store.ownerName || '',
      regionSido: store.regionSido || '',
      regionSigungu: store.regionSigungu || '',
      tradeAreaCode: store.tradeAreaCode || '',
      address: store.address || '',
      phone: store.phone || '',
      businessNumber: store.businessNumber || '',
    });
  };

  const handleSaveEdit = async () => {
    if (!editTarget) return;
    setActionLoading(editTarget.storeId);
    try {
      const res = await fetch('/api/store', {
        method: 'PUT',
        headers: await getAuthJsonHeaders(),
        body: JSON.stringify({
          storeId: editTarget.storeId,
          ...editForm,
          region: `${editForm.regionSido} ${editForm.regionSigungu}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEditTarget(null);
      await fetchStores();
    } catch (e: any) { setError(e.message); }
    finally { setActionLoading(null); }
  };

  if (!isSuperuserUser) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-7 h-7 text-teal-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <Link href="/dashboard/settings" className="inline-flex items-center gap-1.5 text-slate-400 hover:text-slate-200 text-sm mb-4 transition-colors">
        <ArrowLeft className="w-4 h-4" /> 설정으로
      </Link>

      <div className="flex items-center gap-2 mb-2">
        <Shield className="w-5 h-5 text-purple-400" />
        <h1 className="text-lg font-bold text-purple-400">매장 승인 관리</h1>
      </div>
      <p className="text-slate-400 text-sm mb-6">슈퍼유저 전용 — 신규 매장 등록 승인·수정·삭제</p>

      <div className="flex flex-wrap gap-2 mb-6">
        {(['all', 'pending', 'active', 'rejected'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filter === f ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {f === 'all' ? '전체' : STATUS_LABELS[f]}
            {' '}
            ({f === 'all' ? stores.length : stores.filter(s => (s.status || 'active') === f).length})
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-500/30 rounded-xl p-3 mb-4 text-red-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
          <button className="ml-auto underline" onClick={() => setError('')}>닫기</button>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-7 h-7 text-teal-400 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-500 text-sm">매장이 없습니다.</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(store => {
            const st = store.status || 'active';
            const loading = actionLoading === store.storeId;
            return (
              <div key={store.storeId} className="bg-slate-900 border border-slate-700 rounded-xl p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="bg-teal-600/20 p-2 rounded-lg flex-shrink-0">
                      <Store className="w-5 h-5 text-teal-400" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-white font-bold">{store.storeName}</p>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          st === 'pending' ? 'bg-yellow-900/40 text-yellow-400' :
                          st === 'rejected' ? 'bg-red-900/40 text-red-400' :
                          'bg-teal-900/40 text-teal-400'
                        }`}>
                          {STATUS_LABELS[st] || st}
                        </span>
                      </div>
                      <p className="text-slate-400 text-xs mt-0.5">
                        {store.ownerName && `대표: ${store.ownerName} · `}{store.region}
                        {store.tradeAreaCode && ` · 상권 ${store.tradeAreaCode}`}
                      </p>
                      <p className="text-slate-600 text-[10px] mt-0.5 font-mono">{store.storeId}</p>
                      {store.rejectedReason && (
                        <p className="text-red-400/80 text-xs mt-1">거절 사유: {store.rejectedReason}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {st === 'pending' && (
                      <>
                        <button
                          onClick={() => handleApprove(store.storeId)}
                          disabled={loading}
                          className="flex items-center gap-1 bg-teal-900/30 hover:bg-teal-900/50 border border-teal-500/30 text-teal-400 px-2.5 py-1.5 rounded-lg text-xs font-medium"
                        >
                          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          승인
                        </button>
                        <button
                          onClick={() => { setRejectTarget(store); setRejectReason(''); }}
                          disabled={loading}
                          className="flex items-center gap-1 bg-red-900/30 hover:bg-red-900/50 border border-red-500/30 text-red-400 px-2.5 py-1.5 rounded-lg text-xs font-medium"
                        >
                          <X className="w-3.5 h-3.5" /> 거절
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => openEdit(store)}
                      className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                      title="수정"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(store)}
                      disabled={loading}
                      className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"
                      title="삭제"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {rejectTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-white font-bold mb-1">매장 등록 거절</h3>
            <p className="text-slate-400 text-sm mb-4">
              <span className="text-white">{rejectTarget.storeName}</span> 등록을 거절합니다.
            </p>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="거절 사유 (선택)"
              rows={3}
              className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-slate-100 text-sm placeholder:text-slate-500 focus:outline-none focus:border-red-500 resize-none mb-4"
            />
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setRejectTarget(null)} className="bg-slate-800 hover:bg-slate-700 text-slate-300 py-2.5 rounded-xl text-sm">취소</button>
              <button
                onClick={handleRejectConfirm}
                disabled={actionLoading === rejectTarget.storeId}
                className="bg-red-600 hover:bg-red-500 text-white py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
              >
                {actionLoading === rejectTarget.storeId ? <Loader2 className="w-4 h-4 animate-spin" /> : '거절 확인'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl my-8">
            <h3 className="text-white font-bold mb-4">매장 정보 수정</h3>
            <div className="space-y-3">
              <input type="text" placeholder="매장명" value={editForm.storeName}
                onChange={e => setEditForm(p => ({ ...p, storeName: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-teal-500"
              />
              <input type="text" placeholder="대표자명" value={editForm.ownerName}
                onChange={e => setEditForm(p => ({ ...p, ownerName: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-teal-500"
              />
              <div className="grid grid-cols-2 gap-2">
                <select value={editForm.regionSido}
                  onChange={e => setEditForm(p => ({ ...p, regionSido: e.target.value }))}
                  className="bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none"
                >
                  <option value="">시/도</option>
                  {SIDO_LIST.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <input type="text" placeholder="시/군/구" value={editForm.regionSigungu}
                  onChange={e => setEditForm(p => ({ ...p, regionSigungu: e.target.value }))}
                  className="bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none"
                />
              </div>
              <div>
                <input type="text" placeholder="상권 코드 (7~10자리, 선택)" value={editForm.tradeAreaCode}
                  onChange={e => setEditForm(p => ({ ...p, tradeAreaCode: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-2.5 text-sm text-slate-100 font-mono focus:outline-none focus:border-teal-500"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  소상공인 상권정보 trdarCdN. 미입력 시 시/군/구 코드로 추정합니다.
                </p>
              </div>
              <input type="text" placeholder="주소" value={editForm.address}
                onChange={e => setEditForm(p => ({ ...p, address: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3 mt-5">
              <button onClick={() => setEditTarget(null)} className="bg-slate-800 hover:bg-slate-700 text-slate-300 py-2.5 rounded-xl text-sm">취소</button>
              <button
                onClick={handleSaveEdit}
                disabled={actionLoading === editTarget.storeId}
                className="bg-teal-600 hover:bg-teal-500 text-white py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
              >
                {actionLoading === editTarget.storeId ? <Loader2 className="w-4 h-4 animate-spin" /> : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
