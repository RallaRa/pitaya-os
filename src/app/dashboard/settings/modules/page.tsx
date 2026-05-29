'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Package, Save, Check } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { useAuth } from '@/context/AuthContext';
import { isSuperuserEmail } from '@/lib/auth/permissions';
import { useLicense } from '@/hooks/useLicense';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import {
  LICENSE_MODULE_META,
  LicenseModuleKey,
  StoreModules,
} from '@/lib/licenses';

export default function ModulesSettingsPage() {
  const { currentStore } = useStore();
  const { user } = useAuth();
  const { modules, loading, storeId } = useLicense();

  const [draft, setDraft] = useState<StoreModules | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const canManage = isSuperuserEmail(user?.email) ||
    ['owner', 'admin', 'master', 'superuser'].includes(currentStore?.role || '');

  const effective = draft ?? modules;

  const toggle = (key: LicenseModuleKey) => {
    if (!effective || !canManage) return;
    setDraft({
      ...effective,
      [key]: { ...effective[key], enabled: !effective[key].enabled },
    });
    setSaved(false);
  };

  const handleSave = async () => {
    if (!storeId || !draft) return;
    setSaving(true);
    setError('');
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/store/licenses', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ storeId, modules: draft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDraft(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!currentStore?.storeId) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 text-sm">
        매장을 선택해주세요.
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="max-w-2xl mx-auto p-6 text-center text-slate-400">
        모듈 관리는 master/admin 이상만 가능합니다.
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <Link
        href="/dashboard/settings"
        className="flex items-center gap-2 text-slate-400 hover:text-teal-400 text-sm mb-6 transition-colors w-fit"
      >
        <ArrowLeft className="w-4 h-4" />
        설정으로 돌아가기
      </Link>

      <div className="flex items-center gap-2 mb-2">
        <Package className="w-5 h-5 text-teal-400" />
        <h1 className="text-lg font-bold text-teal-400">모듈 관리</h1>
      </div>
      <p className="text-slate-400 text-sm mb-6">
        {currentStore.storeName || currentStore.storeId} — 모듈 OFF 시 사이드바 메뉴가 숨겨집니다.
        권한(role) 구조는 기존과 동일합니다.
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-500/30 rounded-xl text-red-400 text-sm">
          {error}
        </div>
      )}

      {loading || !effective ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 text-teal-400 animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          {(Object.keys(LICENSE_MODULE_META) as LicenseModuleKey[]).map(key => {
            const meta = LICENSE_MODULE_META[key];
            const on = effective[key]?.enabled ?? true;
            return (
              <div
                key={key}
                className="flex items-center justify-between bg-slate-900 border border-slate-700 rounded-xl p-4"
              >
                <div>
                  <p className="text-white font-medium text-sm">{meta.label}</p>
                  <p className="text-slate-500 text-xs mt-0.5">{meta.description}</p>
                  {key === 'dashboard' && (
                    <span className="inline-block mt-1 text-[10px] bg-purple-900/40 text-purple-300 px-2 py-0.5 rounded-full">
                      독립 SaaS 모듈
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => toggle(key)}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    on ? 'bg-teal-600' : 'bg-slate-700'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      on ? 'translate-x-6' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
            );
          })}

          <div className="flex justify-end gap-2 pt-4">
            {draft && (
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="px-4 py-2 text-sm text-slate-400 hover:text-white"
              >
                취소
              </button>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={!draft || saving}
              className="flex items-center gap-2 px-5 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-white rounded-xl text-sm font-semibold"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : saved ? (
                <Check className="w-4 h-4" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {saving ? '저장 중...' : saved ? '저장됨' : '저장'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
