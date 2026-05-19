'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useStore } from '@/context/StoreContext';
import {
  Store, Plus, Search, Loader2, ChevronRight,
  Shield, Clock, LogOut, CheckCircle,
} from 'lucide-react';

const SIDO_LIST = ['서울','부산','대구','인천','광주','대전','울산','세종',
  '경기','강원','충북','충남','전북','전남','경북','경남','제주'];

function SelectStoreContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlMode = searchParams.get('mode'); // 'apply' | 'pending' | null

  const { user, logout } = useAuth();
  const { myStores, refreshStores, setCurrentStore } = useStore();

  const [isSuperuser, setIsSuperuser] = useState(false);
  const [pendingStores, setPendingStores] = useState<any[]>([]);
  const [internalMode, setInternalMode] = useState<'list' | 'link' | 'create'>('list');

  const [allStores, setAllStores] = useState<any[]>([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedStore, setSelectedStore] = useState<any>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingAll, setIsLoadingAll] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [form, setForm] = useState({
    storeName: '', ownerName: '',
    regionSido: '', regionSigungu: '',
    address: '', phone: '', businessNumber: '',
  });

  useEffect(() => {
    if (!user?.uid) return;
    fetch(`/api/users?uid=${user.uid}`)
      .then(r => r.json())
      .then(data => { if (data.user?.role === 'superuser') setIsSuperuser(true); })
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    if (user?.uid) refreshStores(user.uid);
  }, [user]);

  useEffect(() => {
    if (urlMode !== 'pending' || !user?.uid) return;
    fetch(`/api/store?uid=${user.uid}&status=pending`)
      .then(r => r.json())
      .then(data => setPendingStores(data.stores || []));
  }, [urlMode, user]);

  useEffect(() => {
    if (urlMode !== 'apply' && internalMode !== 'link') return;
    setIsLoadingAll(true);
    fetch('/api/store?search=')
      .then(r => r.json())
      .then(data => { setAllStores(data.stores || []); setIsLoadingAll(false); })
      .catch(() => setIsLoadingAll(false));
  }, [urlMode, internalMode]);

  useEffect(() => {
    if (searchKeyword.length < 2) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/store?search=${encodeURIComponent(searchKeyword)}`);
        const data = await res.json();
        setSearchResults(data.stores || []);
      } finally { setIsSearching(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchKeyword]);

  const displayStores = searchKeyword.length >= 2 ? searchResults : allStores;

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const handleSelectStore = (store: any) => {
    setCurrentStore(store);
    router.push('/dashboard');
  };

  // 소속 신청 (apply mode → pending)
  const handleApply = async () => {
    if (!selectedStore || !user?.uid) return;
    setIsLoading(true);
    setError('');
    try {
      const res = await fetch('/api/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'apply', uid: user.uid, storeId: selectedStore.storeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push('/select-store?mode=pending');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  // 매장 연결 (select mode link tab)
  const handleLink = async () => {
    if (!selectedStore || !user?.uid) return;
    setIsLoading(true);
    setError('');
    try {
      const action = isSuperuser ? 'link' : 'apply';
      const res = await fetch('/api/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, uid: user.uid, storeId: selectedStore.storeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (isSuperuser) {
        await refreshStores(user.uid);
      } else {
        setSuccessMsg(`${selectedStore.storeName}에 소속 신청이 완료되었습니다. 관리자 승인 후 입장 가능합니다.`);
      }
      setInternalMode('list');
      setSearchKeyword('');
      setSearchResults([]);
      setSelectedStore(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  // 매장 신규 생성
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
        body: JSON.stringify({ action: 'create', uid: user?.uid, ...form }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await refreshStores(user!.uid);
      if (urlMode === 'apply') {
        router.push('/dashboard');
      } else {
        setInternalMode('list');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  // ── 매장 생성 폼 공통 렌더러 ──
  const renderCreateForm = (backTo: 'list' | 'link') => (
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
            className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-teal-500"
          />
        </div>
        <div>
          <label className="text-slate-400 text-sm mb-1 block">대표자명</label>
          <input type="text" placeholder="예) 홍길동"
            value={form.ownerName}
            onChange={e => setForm(p => ({...p, ownerName: e.target.value}))}
            className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-teal-500"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-slate-400 text-sm mb-1 block">시/도 <span className="text-red-400">*</span></label>
            <select value={form.regionSido}
              onChange={e => setForm(p => ({...p, regionSido: e.target.value, regionSigungu: ''}))}
              className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-slate-100 focus:outline-none focus:border-teal-500"
            >
              <option value="">선택</option>
              {SIDO_LIST.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-slate-400 text-sm mb-1 block">시/군/구 <span className="text-red-400">*</span></label>
            <input type="text" placeholder="직접 입력"
              value={form.regionSigungu}
              onChange={e => setForm(p => ({...p, regionSigungu: e.target.value}))}
              className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-teal-500"
            />
          </div>
        </div>
        <div>
          <label className="text-slate-400 text-sm mb-1 block">상세 주소</label>
          <input type="text" placeholder="예) 강동대로 123"
            value={form.address}
            onChange={e => setForm(p => ({...p, address: e.target.value}))}
            className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-teal-500"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-slate-400 text-sm mb-1 block">전화번호</label>
            <input type="text" placeholder="02-1234-5678"
              value={form.phone}
              onChange={e => setForm(p => ({...p, phone: e.target.value}))}
              className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-teal-500"
            />
          </div>
          <div>
            <label className="text-slate-400 text-sm mb-1 block">사업자번호</label>
            <input type="text" placeholder="123-45-67890"
              value={form.businessNumber}
              onChange={e => setForm(p => ({...p, businessNumber: e.target.value}))}
              className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-teal-500"
            />
          </div>
        </div>
      </div>

      {error && <p className="text-red-400 text-sm mt-4">{error}</p>}

      <div className="grid grid-cols-2 gap-3 mt-6">
        <button
          onClick={() => { setInternalMode(backTo); setError(''); }}
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
  );

  // ══════════════ PENDING MODE ══════════════
  if (urlMode === 'pending') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-slate-900 rounded-2xl p-8 border border-slate-700 shadow-2xl text-center">
          <div className="bg-yellow-400/10 rounded-full w-20 h-20 mx-auto mb-6 flex items-center justify-center">
            <Clock className="w-10 h-10 text-yellow-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-3">승인 대기 중</h1>
          {pendingStores.length > 0 && (
            <div className="space-y-2 mb-6">
              {pendingStores.map(store => (
                <div key={store.storeId} className="bg-slate-800 rounded-xl px-4 py-3">
                  <p className="text-teal-400 font-bold">{store.storeName}</p>
                  <p className="text-slate-400 text-sm">{store.region}</p>
                </div>
              ))}
            </div>
          )}
          <p className="text-slate-400 text-sm mb-8">
            매장 관리자의 승인을 기다리고 있습니다.<br />
            승인이 완료되면 로그인 후 대시보드에 접속할 수 있습니다.
          </p>
          <button
            onClick={handleLogout}
            className="flex items-center justify-center gap-2 text-slate-400 hover:text-slate-200 text-sm mx-auto transition-colors"
          >
            <LogOut className="w-4 h-4" />
            로그아웃
          </button>
        </div>
      </div>
    );
  }

  // ══════════════ APPLY MODE ══════════════
  if (urlMode === 'apply') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-lg">

          {/* 소속 신청 화면 */}
          {internalMode === 'list' && (
            <div className="bg-slate-900 rounded-2xl p-8 border border-slate-700 shadow-2xl">
              <h1 className="text-2xl font-bold text-teal-400 text-center mb-2">어느 매장 소속인가요?</h1>
              <p className="text-slate-400 text-sm text-center mb-6">
                소속할 매장을 선택하세요.<br />
                관리자의 승인 후 대시보드에 접속할 수 있습니다.
              </p>

              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="매장명 / 대표자명으로 검색"
                  value={searchKeyword}
                  onChange={e => { setSearchKeyword(e.target.value); setSelectedStore(null); }}
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl pl-10 pr-4 py-3 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-teal-500 transition-colors"
                />
                {isSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-teal-400 animate-spin" />}
              </div>

              {isLoadingAll ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 text-teal-400 animate-spin" />
                </div>
              ) : (
                <div className="border border-slate-700 rounded-xl overflow-hidden max-h-72 overflow-y-auto mb-4">
                  {displayStores.length === 0 ? (
                    <p className="text-slate-500 text-sm text-center py-8">
                      {searchKeyword.length >= 2 ? '검색 결과가 없습니다.' : '등록된 매장이 없습니다.'}
                    </p>
                  ) : (
                    displayStores.map((store: any, idx: number) => (
                      <button
                        key={store.storeId}
                        onClick={() => setSelectedStore(
                          selectedStore?.storeId === store.storeId ? null : store
                        )}
                        className={`w-full flex items-center justify-between px-4 py-3 hover:bg-slate-700 transition-colors text-left ${idx !== 0 ? 'border-t border-slate-700' : ''} ${selectedStore?.storeId === store.storeId ? 'bg-teal-900/30' : ''}`}
                      >
                        <div>
                          <p className="text-white font-bold text-sm">{store.storeName}</p>
                          <p className="text-slate-400 text-xs mt-0.5">
                            {store.ownerName && `대표: ${store.ownerName} · `}{store.region}
                          </p>
                        </div>
                        {selectedStore?.storeId === store.storeId
                          ? <CheckCircle className="w-4 h-4 text-teal-400 flex-shrink-0" />
                          : <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                        }
                      </button>
                    ))
                  )}
                </div>
              )}

              {selectedStore && (
                <div className="bg-teal-900/30 border border-teal-500/50 rounded-xl p-3 mb-4">
                  <p className="text-teal-400 text-xs mb-0.5">선택된 매장</p>
                  <p className="text-white font-bold">{selectedStore.storeName}</p>
                  <p className="text-slate-400 text-xs">{selectedStore.region}</p>
                </div>
              )}

              {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

              {isSuperuser && (
                <button
                  onClick={() => { setInternalMode('create'); setError(''); }}
                  className="w-full flex items-center justify-center gap-2 bg-yellow-900/20 hover:bg-yellow-900/30 border border-yellow-500/30 hover:border-yellow-500/50 text-yellow-400 py-3 rounded-xl text-sm font-medium transition-all mb-3"
                >
                  <Shield className="w-4 h-4" />
                  신규 매장 등록 (Superuser 전용)
                </button>
              )}

              <button
                onClick={handleApply}
                disabled={!selectedStore || isLoading}
                className="w-full bg-teal-600 hover:bg-teal-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2 mb-3"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : '소속 신청하기'}
              </button>

              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 text-slate-500 hover:text-slate-300 text-sm transition-colors"
              >
                <LogOut className="w-4 h-4" />
                로그아웃
              </button>
            </div>
          )}

          {internalMode === 'create' && isSuperuser && renderCreateForm('list')}
        </div>
      </div>
    );
  }

  // ══════════════ SELECT MODE (기존 매장 보유 유저) ══════════════
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">

        {successMsg && (
          <div className="bg-teal-900/30 border border-teal-500/30 rounded-xl p-4 mb-4 flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-teal-400 flex-shrink-0 mt-0.5" />
            <p className="text-teal-300 text-sm">{successMsg}</p>
          </div>
        )}

        {internalMode === 'list' && (
          <div className="bg-slate-900 rounded-2xl p-8 border border-slate-700 shadow-2xl">
            <h1 className="text-2xl font-bold text-teal-400 text-center mb-2">매장 선택</h1>
            <p className="text-slate-400 text-sm text-center mb-8">관리할 매장을 선택하세요.</p>

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
                onClick={() => { setInternalMode('link'); setError(''); setSuccessMsg(''); }}
                className="bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-300 py-3 rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
              >
                <Search className="w-4 h-4" />
                매장 소속 신청
              </button>
              {isSuperuser && (
                <button
                  onClick={() => { setInternalMode('create'); setError(''); setSuccessMsg(''); }}
                  className="bg-teal-600 hover:bg-teal-500 text-white py-3 rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  신규 매장 생성
                </button>
              )}
            </div>
          </div>
        )}

        {internalMode === 'link' && (
          <div className="bg-slate-900 rounded-2xl p-8 border border-slate-700 shadow-2xl">
            <h1 className="text-2xl font-bold text-teal-400 text-center mb-2">매장 소속 신청</h1>
            <p className="text-slate-400 text-sm text-center mb-6">
              {isSuperuser ? '매장을 검색하여 직접 연결합니다.' : '매장을 선택하면 관리자 승인 후 입장됩니다.'}
            </p>

            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="매장명 / 대표자명으로 검색"
                value={searchKeyword}
                onChange={e => { setSearchKeyword(e.target.value); setSelectedStore(null); }}
                className="w-full bg-slate-800 border border-slate-600 rounded-xl pl-10 pr-4 py-3 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-teal-500 transition-colors"
              />
              {isSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-teal-400 animate-spin" />}
            </div>

            {isLoadingAll ? (
              <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 text-teal-400 animate-spin" /></div>
            ) : (
              <div className="border border-slate-700 rounded-xl overflow-hidden max-h-60 overflow-y-auto mb-4">
                {displayStores.length === 0 ? (
                  <p className="text-slate-500 text-sm text-center py-6">
                    {searchKeyword.length >= 2 ? '검색 결과가 없습니다.' : '불러오는 중...'}
                  </p>
                ) : (
                  displayStores.map((store: any, idx: number) => (
                    <button
                      key={store.storeId}
                      onClick={() => setSelectedStore(
                        selectedStore?.storeId === store.storeId ? null : store
                      )}
                      className={`w-full flex items-center justify-between px-4 py-3 hover:bg-slate-700 transition-colors text-left ${idx !== 0 ? 'border-t border-slate-700' : ''} ${selectedStore?.storeId === store.storeId ? 'bg-teal-900/30' : ''}`}
                    >
                      <div>
                        <p className="text-white font-bold text-sm">{store.storeName}</p>
                        <p className="text-slate-400 text-xs mt-0.5">
                          {store.ownerName && `대표: ${store.ownerName} · `}{store.region}
                        </p>
                      </div>
                      {selectedStore?.storeId === store.storeId
                        ? <CheckCircle className="w-4 h-4 text-teal-400 flex-shrink-0" />
                        : <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      }
                    </button>
                  ))
                )}
              </div>
            )}

            {selectedStore && (
              <div className="bg-teal-900/30 border border-teal-500/50 rounded-xl p-3 mb-4">
                <p className="text-teal-400 text-xs mb-0.5">선택된 매장</p>
                <p className="text-white font-bold">{selectedStore.storeName}</p>
                <p className="text-slate-400 text-xs">{selectedStore.region}</p>
                <button onClick={() => setSelectedStore(null)} className="text-slate-400 hover:text-slate-200 text-xs mt-2 transition-colors">✕ 선택 취소</button>
              </div>
            )}

            {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

            {isSuperuser && (
              <button
                onClick={() => { setInternalMode('create'); setError(''); }}
                className="w-full flex items-center justify-center gap-2 bg-yellow-900/20 hover:bg-yellow-900/30 border border-yellow-500/30 hover:border-yellow-500/50 text-yellow-400 py-3 rounded-xl text-sm font-medium transition-all mb-3"
              >
                <Shield className="w-4 h-4" />
                신규 매장 등록 (Superuser 전용)
              </button>
            )}

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => { setInternalMode('list'); setError(''); setSearchKeyword(''); setSearchResults([]); setSelectedStore(null); }}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 py-3 rounded-xl font-medium transition-colors"
              >
                뒤로
              </button>
              <button
                onClick={handleLink}
                disabled={isLoading || !selectedStore}
                className="bg-teal-600 hover:bg-teal-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : isSuperuser ? '연결하기' : '신청하기'}
              </button>
            </div>
          </div>
        )}

        {internalMode === 'create' && isSuperuser && renderCreateForm('link')}
      </div>
    </div>
  );
}

export default function SelectStorePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-teal-400 animate-spin" />
      </div>
    }>
      <SelectStoreContent />
    </Suspense>
  );
}
