'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useStore } from '@/context/StoreContext';
import {
  Store, Copy, Check, Loader2,
  Save, RefreshCw, Users, HardDrive,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ImageIcon } from 'lucide-react';
import StoreDocuments from '@/components/store/StoreDocuments';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import { connectGoogleDriveWithPopup } from '@/lib/googleDriveClientConnect';
import { isSuperuserEmail } from '@/lib/auth/permissions';

const SIDO_LIST = ['서울','부산','대구','인천','광주','대전','울산','세종',
  '경기','강원','충북','충남','전북','전남','경북','경남','제주'];

export default function StoreSettingsPage() {
  const { user } = useAuth();
  const { currentStore, refreshStores } = useStore();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [driveConnected, setDriveConnected] = useState<boolean | null>(null);
  const [driveConnecting, setDriveConnecting] = useState(false);

  const [form, setForm] = useState({
    storeName: '',
    ownerName: '',
    regionSido: '',
    regionSigungu: '',
    address: '',
    phone: '',
    businessNumber: '',
  });

  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [error, setError] = useState('');

  const canManageImages = isSuperuserEmail(user?.email) ||
    ['owner', 'admin', 'master', 'superuser'].includes(currentStore?.role || '');

  useEffect(() => {
    if (currentStore) {
      setForm({
        storeName: currentStore.storeName || '',
        ownerName: currentStore.ownerName || '',
        regionSido: currentStore.regionSido || '',
        regionSigungu: currentStore.regionSigungu || '',
        address: currentStore.address || '',
        phone: currentStore.phone || '',
        businessNumber: currentStore.businessNumber || '',
      });
    }
  }, [currentStore]);

  useEffect(() => {
    const driveParam = searchParams.get('drive');
    if (driveParam === 'connected') {
      setSaveMsg('✅ Google Drive가 연결되었습니다.');
    } else if (driveParam === 'connect') {
      setSaveMsg('매장 설정에서 「Drive 연결」 버튼을 눌러 주세요. (팝업 방식 — redirect URI 등록 불필요)');
    } else if (driveParam === 'error' || driveParam === 'no_token') {
      setError('Google Drive 연결에 실패했습니다. 「Drive 연결」 버튼으로 다시 시도해 주세요.');
    }
  }, [searchParams]);

  useEffect(() => {
    if (!currentStore?.storeId) return;
    (async () => {
      try {
        const headers = await getAuthJsonHeaders();
        const res = await fetch(
          `/api/auth/google-drive/status?storeId=${encodeURIComponent(currentStore.storeId)}`,
          { headers },
        );
        const data = await res.json();
        setDriveConnected(!!data.connected);
      } catch {
        setDriveConnected(false);
      }
    })();
  }, [currentStore?.storeId, searchParams]);

  const connectDrive = async () => {
    if (!currentStore?.storeId || driveConnecting) return;
    setDriveConnecting(true);
    setError('');
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch(
        `/api/auth/google-drive/connect?storeId=${encodeURIComponent(currentStore.storeId)}`,
        { headers },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Drive 연결 설정을 가져오지 못했습니다');

      if (data.mode === 'popup' && data.clientId) {
        await connectGoogleDriveWithPopup(
          currentStore.storeId,
          data.clientId,
          async (code) => {
            const exRes = await fetch('/api/auth/google-drive/exchange', {
              method: 'POST',
              headers: await getAuthJsonHeaders(),
              body: JSON.stringify({ code, storeId: currentStore.storeId }),
            });
            const exData = await exRes.json();
            if (!exRes.ok) throw new Error(exData.error || 'Drive 토큰 저장 실패');
          },
        );
        setDriveConnected(true);
        setSaveMsg('✅ Google Drive가 연결되었습니다.');
        return;
      }

      if (data.url) {
        window.location.href = data.url;
        return;
      }

      throw new Error('Drive 연결 방식을 확인할 수 없습니다');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Drive 연결 실패');
    } finally {
      setDriveConnecting(false);
    }
  };

  const handleCopy = () => {
    if (!currentStore?.storeId) return;
    navigator.clipboard.writeText(currentStore.storeId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleApplyStoreInfo = (data: { businessNumber?: string; ownerName?: string; storeName?: string; address?: string }) => {
    setForm(prev => ({
      ...prev,
      ...(data.storeName ? { storeName: data.storeName } : {}),
      ...(data.ownerName ? { ownerName: data.ownerName } : {}),
      ...(data.businessNumber ? { businessNumber: data.businessNumber } : {}),
      ...(data.address ? { address: data.address } : {}),
    }));
    setSaveMsg('AI가 서류에서 정보를 반영했습니다. 확인 후 저장 버튼을 눌러주세요.');
  };

  const handleSave = async () => {
    if (!form.storeName || !form.regionSido || !form.regionSigungu) {
      setError('매장명과 지역은 필수입니다.');
      return;
    }
    setIsSaving(true);
    setError('');
    setSaveMsg('');
    try {
      const res = await fetch('/api/store', {
        method: 'PUT',
        headers: await getAuthJsonHeaders(),
        body: JSON.stringify({
          storeId: currentStore?.storeId,
          ...form,
          region: `${form.regionSido} ${form.regionSigungu}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (user?.uid) await refreshStores(user.uid);
      setSaveMsg('✅ 저장되었습니다.');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsSaving(false);
    }
  };

  if (!currentStore) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-slate-400">매장 정보를 불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6">

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
            <Store className="w-6 h-6" />
            매장 설정
          </h1>
          <p className="text-slate-400 text-sm mt-1">매장 정보를 관리합니다.</p>
        </div>
        <button
          onClick={() => router.push('/select-store')}
          className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-xl text-sm transition-colors border border-slate-600"
        >
          <RefreshCw className="w-4 h-4" />
          매장 전환
        </button>
      </div>

      {/* 매장 ID */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 mb-6">
        <p className="text-slate-400 text-xs mb-2">매장 ID (다른 계정 연결 시 필요)</p>
        <div className="flex items-center justify-between">
          <p className="text-teal-400 font-mono font-bold text-lg">
            {currentStore.storeId}
          </p>
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-slate-300 px-3 py-1.5 rounded-lg text-sm transition-colors"
          >
            {copied
              ? <><Check className="w-4 h-4 text-teal-400" /> 복사됨</>
              : <><Copy className="w-4 h-4" /> 복사</>
            }
          </button>
        </div>
      </div>

      {/* Google Drive */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-white font-semibold text-sm flex items-center gap-2 mb-1">
              <HardDrive className="w-4 h-4 text-teal-400" />
              Google Drive
            </p>
            <p className="text-slate-400 text-xs leading-relaxed">
              공개주문 품목 사진을 Drive의 <code className="text-teal-300/80">Pitaya_공개주문</code> 폴더에 저장합니다.
            </p>
            <p className={`text-xs mt-2 ${driveConnected ? 'text-teal-400' : 'text-amber-400'}`}>
              {driveConnected === null
                ? '연결 상태 확인 중…'
                : driveConnected
                  ? '● 연결됨'
                  : '● 미연결 — 사진 첨부 전 연결이 필요합니다'}
            </p>
          </div>
          {canManageImages && (
            <button
              type="button"
              onClick={connectDrive}
              disabled={driveConnecting}
              className="shrink-0 bg-teal-600 hover:bg-teal-500 disabled:opacity-60 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
            >
              {driveConnecting ? '연결 중…' : driveConnected ? '다시 연결' : 'Drive 연결'}
            </button>
          )}
        </div>
      </div>

      {/* 매장 정보 수정 폼 */}
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 mb-6">
        <h2 className="text-white font-bold mb-4 flex items-center gap-2">
          <Store className="w-4 h-4 text-teal-400" />
          기본 정보
        </h2>

        <div className="space-y-4">
          <div>
            <label className="text-slate-400 text-sm mb-1 block">
              매장명 <span className="text-red-400">*</span>
            </label>
            <input type="text"
              value={form.storeName}
              onChange={e => setForm(p => ({...p, storeName: e.target.value}))}
              className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-slate-100 focus:outline-none focus:border-teal-500 transition-colors"
            />
          </div>

          <div>
            <label className="text-slate-400 text-sm mb-1 block">대표자명</label>
            <input type="text"
              value={form.ownerName}
              onChange={e => setForm(p => ({...p, ownerName: e.target.value}))}
              className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-slate-100 focus:outline-none focus:border-teal-500 transition-colors"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-400 text-sm mb-1 block">
                시/도 <span className="text-red-400">*</span>
              </label>
              <select
                value={form.regionSido}
                onChange={e => setForm(p => ({...p, regionSido: e.target.value}))}
                className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-slate-100 focus:outline-none focus:border-teal-500 transition-colors"
              >
                <option value="">선택</option>
                {SIDO_LIST.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-slate-400 text-sm mb-1 block">
                시/군/구 <span className="text-red-400">*</span>
              </label>
              <input type="text"
                value={form.regionSigungu}
                onChange={e => setForm(p => ({...p, regionSigungu: e.target.value}))}
                placeholder="직접 입력"
                className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-teal-500 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="text-slate-400 text-sm mb-1 block">상세 주소</label>
            <input type="text"
              value={form.address}
              onChange={e => setForm(p => ({...p, address: e.target.value}))}
              className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-slate-100 focus:outline-none focus:border-teal-500 transition-colors"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-400 text-sm mb-1 block">전화번호</label>
              <input type="text"
                value={form.phone}
                onChange={e => setForm(p => ({...p, phone: e.target.value}))}
                className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-slate-100 focus:outline-none focus:border-teal-500 transition-colors"
              />
            </div>
            <div>
              <label className="text-slate-400 text-sm mb-1 block">사업자번호</label>
              <input type="text"
                value={form.businessNumber}
                onChange={e => setForm(p => ({...p, businessNumber: e.target.value}))}
                className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-slate-100 focus:outline-none focus:border-teal-500 transition-colors"
              />
            </div>
          </div>
        </div>

        {error && <p className="text-red-400 text-sm mt-4">{error}</p>}
        {saveMsg && <p className="text-teal-400 text-sm mt-4">{saveMsg}</p>}

        <div className="grid grid-cols-2 gap-3 mt-6">
          <Link
            href="/dashboard/settings"
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            뒤로
          </Link>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="bg-teal-600 hover:bg-teal-500 disabled:bg-slate-600 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
          >
            {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            {isSaving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>

      {/* 연결된 계정 목록 */}
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 mb-6">
        <h2 className="text-white font-bold mb-4 flex items-center gap-2">
          <Users className="w-4 h-4 text-teal-400" />
          연결된 계정
        </h2>
        <p className="text-slate-400 text-sm">
          매장 ID를 공유하면 다른 계정이 이 매장에 연결할 수 있습니다.
        </p>
      </div>

      {/* 매장 이미지 및 서류 */}
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-6">
        <h2 className="text-white font-bold mb-1 flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-teal-400" />
          매장 이미지 및 서류
        </h2>
        <p className="text-slate-500 text-xs mb-5">
          로고·외관·내부 사진과 사업자등록증, 허가증 등을 한곳에서 관리합니다.
          서류 업로드 시 AI가 내용을 읽어 매장 정보에 자동 반영하며, 만료일이 가까우면 알림이 표시됩니다.
          {!canManageImages && (
            <span className="text-yellow-500/80 ml-1">(조회만 가능 — 업로드/삭제는 관리자만)</span>
          )}
        </p>
        <StoreDocuments
          storeId={currentStore.storeId}
          canManage={canManageImages}
          onApplyStoreInfo={handleApplyStoreInfo}
        />
      </div>

    </div>
  );
}
