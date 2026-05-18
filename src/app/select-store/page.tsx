'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useStore } from '@/context/StoreContext';
import { Store, Plus, Search, Loader2, ChevronRight } from 'lucide-react';

type Mode = 'select' | 'link' | 'create';

const SIDO_LIST = ['서울','부산','대구','인천','광주','대전','울산','세종',
  '경기','강원','충북','충남','전북','전남','경북','경남','제주'];

export default function SelectStorePage() {
  const router = useRouter();
  const { user } = useAuth();
  const { myStores, refreshStores, setCurrentStore } = useStore();

  const [mode, setMode] = useState<Mode>('select');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const [storeId, setStoreId] = useState('');

  const [form, setForm] = useState({
    storeName: '', ownerName: '',
    regionSido: '', regionSigungu: '',
    address: '', phone: '', businessNumber: '',
  });

  useEffect(() => {
    if (user?.uid) refreshStores(user.uid);
  }, [user]);

  const handleSelectStore = (store: any) => {
    setCurrentStore(store);
    router.push('/dashboard');
  };

  const handleLink = async () => {
    if (!storeId.trim()) return;
    setIsLoading(true);
    setError('');
    try {
      const res = await fetch('/api/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'link', uid: user?.uid, storeId: storeId.trim()
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await refreshStores(user!.uid);
      setMode('select');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!form.storeName || !form.regionSido || !form.regionSigungu) {
      setError('매장명과 지역은 필수입니다.');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const res = await fetch('/api/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create', uid: user?.uid, ...form
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await refreshStores(user!.uid);
      setMode('select');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">

        {/* 매장 선택 모드 */}
        {mode === 'select' && (
          <div className="bg-slate-900 rounded-2xl p-8 border border-slate-700 shadow-2xl">
            <h1 className="text-2xl font-bold text-teal-400 text-center mb-2">매장 선택</h1>
            <p className="text-slate-400 text-sm text-center mb-8">
              관리할 매장을 선택하세요.
            </p>

            {myStores.length > 0 && (
              <div className="space-y-3 mb-6">
                {myStores.map((store: any) => (
                  <button
                    key={store.storeId}
                    onClick={() => handleSelectStore(store)}
                    className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-600 hover:border-teal-500 rounded-xl p-4 flex items-center justify-between transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="bg-teal-600/20 p-2 rounded-lg">
                        <Store className="w-5 h-5 text-teal-400" />
                      </div>
                      <div className="text-left">
                        <p className="text-white font-bold">{store.storeName}</p>
                        <p className="text-slate-400 text-sm">
                          {store.region} · {store.role === 'owner' ? '대표' : '직원'}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-teal-400 transition-colors" />
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => { setMode('link'); setError(''); }}
                className="bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-300 py-3 rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
              >
                <Search className="w-4 h-4" />
                기존 매장 연결
              </button>
              <button
                onClick={() => { setMode('create'); setError(''); }}
                className="bg-teal-600 hover:bg-teal-500 text-white py-3 rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                신규 매장 생성
              </button>
            </div>
          </div>
        )}

        {/* 기존 매장 연결 모드 */}
        {mode === 'link' && (
          <div className="bg-slate-900 rounded-2xl p-8 border border-slate-700 shadow-2xl">
            <h1 className="text-2xl font-bold text-teal-400 text-center mb-2">기존 매장 연결</h1>
            <p className="text-slate-400 text-sm text-center mb-8">
              매장 ID를 입력하세요. (매장 관리자에게 문의)
            </p>

            <input
              type="text"
              placeholder="STR-000000000000"
              value={storeId}
              onChange={e => setStoreId(e.target.value)}
              className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-teal-500 mb-4"
            />

            {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setMode('select')}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 py-3 rounded-xl font-medium transition-colors"
              >
                뒤로
              </button>
              <button
                onClick={handleLink}
                disabled={isLoading}
                className="bg-teal-600 hover:bg-teal-500 disabled:bg-slate-600 text-white py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : '연결하기'}
              </button>
            </div>
          </div>
        )}

        {/* 신규 매장 생성 모드 */}
        {mode === 'create' && (
          <div className="bg-slate-900 rounded-2xl p-8 border border-slate-700 shadow-2xl">
            <h1 className="text-2xl font-bold text-teal-400 text-center mb-2">신규 매장 생성</h1>
            <p className="text-slate-400 text-sm text-center mb-6">
              매장 정보를 입력해주세요.
            </p>

            <div className="space-y-4">
              <input type="text" placeholder="매장명 *"
                value={form.storeName}
                onChange={e => setForm(p => ({...p, storeName: e.target.value}))}
                className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-teal-500"
              />
              <input type="text" placeholder="대표자명"
                value={form.ownerName}
                onChange={e => setForm(p => ({...p, ownerName: e.target.value}))}
                className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-teal-500"
              />
              <div className="grid grid-cols-2 gap-3">
                <select value={form.regionSido}
                  onChange={e => setForm(p => ({...p, regionSido: e.target.value, regionSigungu: ''}))}
                  className="bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-slate-100 focus:outline-none focus:border-teal-500"
                >
                  <option value="">시/도 *</option>
                  {SIDO_LIST.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <input type="text" placeholder="시/군/구 *"
                  value={form.regionSigungu}
                  onChange={e => setForm(p => ({...p, regionSigungu: e.target.value}))}
                  className="bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-teal-500"
                />
              </div>
              <input type="text" placeholder="상세 주소"
                value={form.address}
                onChange={e => setForm(p => ({...p, address: e.target.value}))}
                className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-teal-500"
              />
              <div className="grid grid-cols-2 gap-3">
                <input type="text" placeholder="전화번호"
                  value={form.phone}
                  onChange={e => setForm(p => ({...p, phone: e.target.value}))}
                  className="bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-teal-500"
                />
                <input type="text" placeholder="사업자번호"
                  value={form.businessNumber}
                  onChange={e => setForm(p => ({...p, businessNumber: e.target.value}))}
                  className="bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-teal-500"
                />
              </div>
            </div>

            {error && <p className="text-red-400 text-sm mt-4">{error}</p>}

            <div className="grid grid-cols-2 gap-3 mt-6">
              <button onClick={() => setMode('select')}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 py-3 rounded-xl font-medium transition-colors"
              >
                뒤로
              </button>
              <button onClick={handleCreate} disabled={isLoading}
                className="bg-teal-600 hover:bg-teal-500 disabled:bg-slate-600 text-white py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : '생성하기'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
