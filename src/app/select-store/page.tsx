'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useStore } from '@/context/StoreContext';
import { Store, Plus, Search, Loader2, ChevronRight, Shield } from 'lucide-react';

type Mode = 'select' | 'link' | 'create';

const SIDO_LIST = ['서울','부산','대구','인천','광주','대전','울산','세종',
  '경기','강원','충북','충남','전북','전남','경북','경남','제주'];

export default function SelectStorePage() {
  const router = useRouter();
  const { user } = useAuth();
  const { currentStore, myStores, refreshStores, setCurrentStore } = useStore();

  const [mode, setMode] = useState<Mode>('select');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedStore, setSelectedStore] = useState<any>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [allStores, setAllStores] = useState<any[]>([]);
  const [isLoadingAll, setIsLoadingAll] = useState(false);

  const [form, setForm] = useState({
    storeName: '', ownerName: '',
    regionSido: '', regionSigungu: '',
    address: '', phone: '', businessNumber: '',
  });

  useEffect(() => {
    if (user?.uid) refreshStores(user.uid);
  }, [user]);

  // 검색 디바운스 (300ms)
  useEffect(() => {
    if (searchKeyword.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/store?search=${encodeURIComponent(searchKeyword)}`);
        const data = await res.json();
        setSearchResults(data.stores || []);
      } catch (e) {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchKeyword]);

  const handleShowAll = async () => {
    if (showAll) {
      setShowAll(false);
      return;
    }
    setIsLoadingAll(true);
    try {
      const res = await fetch('/api/store?search=');
      const data = await res.json();
      setAllStores(data.stores || []);
      setShowAll(true);
    } catch (e) {
      setAllStores([]);
    } finally {
      setIsLoadingAll(false);
    }
  };

  const handleSelectStore = (store: any) => {
    setCurrentStore(store);
    router.push('/dashboard');
  };

  const handleLink = async () => {
    if (!selectedStore) return;
    setIsLoading(true);
    setError('');
    try {
      const res = await fetch('/api/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'link',
          uid: user?.uid,
          storeId: selectedStore.storeId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await refreshStores(user!.uid);
      setMode('select');
      setSearchKeyword('');
      setSearchResults([]);
      setSelectedStore(null);
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
            <p className="text-slate-400 text-sm text-center mb-6">
              매장코드, 매장명, 대표자명으로 검색하세요.
            </p>

            {/* 전체 매장 보기 버튼 */}
            <button
              onClick={handleShowAll}
              disabled={isLoadingAll}
              className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 hover:border-teal-500/50 text-slate-300 py-3 rounded-xl text-sm font-medium transition-all mb-4"
            >
              {isLoadingAll
                ? <Loader2 className="w-4 h-4 animate-spin text-teal-400" />
                : <Search className="w-4 h-4 text-teal-400" />
              }
              {showAll ? '전체 목록 닫기' : '등록된 전체 매장 보기'}
            </button>

            {/* 검색창 */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="매장코드 / 매장명 / 대표자명"
                value={searchKeyword}
                onChange={e => { setSearchKeyword(e.target.value); setSelectedStore(null); }}
                className="w-full bg-slate-800 border border-slate-600 rounded-xl pl-10 pr-4 py-3 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-teal-500 transition-colors"
              />
              {isSearching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-teal-400 animate-spin" />
              )}
            </div>

            {/* 전체 매장 목록 */}
            {showAll && !selectedStore && (
              <div className="border border-slate-700 rounded-xl overflow-hidden mb-4 max-h-64 overflow-y-auto">
                {allStores.length === 0 ? (
                  <p className="text-slate-500 text-sm text-center py-6">등록된 매장이 없습니다.</p>
                ) : (
                  allStores.map((store: any, idx: number) => (
                    <button
                      key={store.storeId}
                      onClick={() => { setSelectedStore(store); setShowAll(false); }}
                      className={`w-full flex items-center justify-between px-4 py-3 hover:bg-slate-700 transition-colors text-left ${idx !== 0 ? 'border-t border-slate-700' : ''}`}
                    >
                      <div>
                        <p className="text-white font-bold text-sm">{store.storeName}</p>
                        <p className="text-slate-400 text-xs mt-0.5">
                          {store.ownerName && `대표: ${store.ownerName} · `}
                          {store.region} ·
                          <span className="font-mono ml-1 text-teal-400/70">{store.storeId}</span>
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    </button>
                  ))
                )}
              </div>
            )}

            {/* 검색 결과 */}
            {searchResults.length > 0 && !selectedStore && (
              <div className="border border-slate-700 rounded-xl overflow-hidden mb-4">
                {searchResults.map((store: any, idx: number) => (
                  <button
                    key={store.storeId}
                    onClick={() => setSelectedStore(store)}
                    className={`w-full flex items-center justify-between px-4 py-3 hover:bg-slate-700 transition-colors text-left ${idx !== 0 ? 'border-t border-slate-700' : ''}`}
                  >
                    <div>
                      <p className="text-white font-bold text-sm">{store.storeName}</p>
                      <p className="text-slate-400 text-xs mt-0.5">
                        {store.ownerName && `대표: ${store.ownerName} · `}
                        {store.region} ·
                        <span className="font-mono ml-1">{store.storeId}</span>
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </button>
                ))}
              </div>
            )}

            {/* 검색결과 없음 */}
            {searchKeyword.length > 1 && searchResults.length === 0 && !isSearching && (
              <p className="text-slate-500 text-sm text-center py-4 mb-4">
                검색 결과가 없습니다.
              </p>
            )}

            {/* 선택된 매장 확인 */}
            {selectedStore && (
              <div className="bg-teal-900/30 border border-teal-500/50 rounded-xl p-4 mb-4">
                <p className="text-teal-400 text-xs mb-1">선택된 매장</p>
                <p className="text-white font-bold">{selectedStore.storeName}</p>
                <p className="text-slate-400 text-sm">
                  {selectedStore.ownerName && `대표: ${selectedStore.ownerName} · `}
                  {selectedStore.region}
                </p>
                <p className="text-slate-500 text-xs font-mono mt-1">{selectedStore.storeId}</p>
                <button
                  onClick={() => setSelectedStore(null)}
                  className="text-slate-400 hover:text-slate-200 text-xs mt-2 transition-colors"
                >
                  ✕ 선택 취소
                </button>
              </div>
            )}

            {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

            {/* 슈퍼유저 전용 신규 매장 등록 */}
            {currentStore?.role === 'superuser' && (
              <button
                onClick={() => { setMode('create'); setError(''); }}
                className="w-full flex items-center justify-center gap-2 bg-teal-900/30 hover:bg-teal-900/50 border border-teal-500/30 hover:border-teal-500 text-teal-400 py-3 rounded-xl text-sm font-medium transition-all mb-3"
              >
                <Plus className="w-4 h-4" />
                신규 매장 등록 (Superuser 전용)
              </button>
            )}

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  setMode('select');
                  setError('');
                  setSearchKeyword('');
                  setSearchResults([]);
                  setSelectedStore(null);
                }}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 py-3 rounded-xl font-medium transition-colors"
              >
                뒤로
              </button>
              <button
                onClick={handleLink}
                disabled={isLoading || !selectedStore}
                className="bg-teal-600 hover:bg-teal-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : '연결하기'}
              </button>
            </div>
          </div>
        )}

        {/* 신규 매장 생성 모드 */}
        {mode === 'create' && currentStore?.role === 'superuser' && (
          <div className="bg-slate-900 rounded-2xl p-8 border border-slate-700 shadow-2xl">

            <div className="flex items-center gap-3 mb-6">
              <div className="bg-yellow-400/10 p-2 rounded-lg">
                <Shield className="w-5 h-5 text-yellow-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">신규 매장 등록</h1>
                <p className="text-yellow-400 text-xs">Superuser 전용</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-slate-400 text-sm mb-1 block">매장명 <span className="text-red-400">*</span></label>
                <input type="text" placeholder="예) 피타야 정육점"
                  value={form.storeName}
                  onChange={e => setForm(p => ({...p, storeName: e.target.value}))}
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-teal-500 transition-colors"
                />
              </div>
              <div>
                <label className="text-slate-400 text-sm mb-1 block">대표자명</label>
                <input type="text" placeholder="예) 홍길동"
                  value={form.ownerName}
                  onChange={e => setForm(p => ({...p, ownerName: e.target.value}))}
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-teal-500 transition-colors"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 text-sm mb-1 block">시/도 <span className="text-red-400">*</span></label>
                  <select value={form.regionSido}
                    onChange={e => setForm(p => ({...p, regionSido: e.target.value, regionSigungu: ''}))}
                    className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-slate-100 focus:outline-none focus:border-teal-500 transition-colors"
                  >
                    <option value="">선택</option>
                    {SIDO_LIST.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-slate-400 text-sm mb-1 block">시/군/구 <span className="text-red-400">*</span></label>
                  <input type="text" placeholder="직접 입력"
                    value={form.regionSigungu}
                    onChange={e => setForm(p => ({...p, regionSigungu: e.target.value}))}
                    className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-teal-500 transition-colors"
                  />
                </div>
              </div>
              <div>
                <label className="text-slate-400 text-sm mb-1 block">상세 주소</label>
                <input type="text" placeholder="예) 강동대로 123"
                  value={form.address}
                  onChange={e => setForm(p => ({...p, address: e.target.value}))}
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-teal-500 transition-colors"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 text-sm mb-1 block">전화번호</label>
                  <input type="text" placeholder="02-1234-5678"
                    value={form.phone}
                    onChange={e => setForm(p => ({...p, phone: e.target.value}))}
                    className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-teal-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-slate-400 text-sm mb-1 block">사업자번호</label>
                  <input type="text" placeholder="123-45-67890"
                    value={form.businessNumber}
                    onChange={e => setForm(p => ({...p, businessNumber: e.target.value}))}
                    className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-teal-500 transition-colors"
                  />
                </div>
              </div>
            </div>

            {error && <p className="text-red-400 text-sm mt-4">{error}</p>}

            <div className="grid grid-cols-2 gap-3 mt-6">
              <button
                onClick={() => { setMode('link'); setError(''); }}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 py-3 rounded-xl font-medium transition-colors"
              >
                뒤로
              </button>
              <button
                onClick={handleCreate}
                disabled={isLoading}
                className="bg-teal-600 hover:bg-teal-500 disabled:bg-slate-600 text-white py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {isLoading ? '등록 중...' : '매장 등록'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
