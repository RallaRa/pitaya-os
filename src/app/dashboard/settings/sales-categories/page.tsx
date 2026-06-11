'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Save, Check, Tag, RotateCcw } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { useAuth } from '@/context/AuthContext';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import { isSuperuserEmail } from '@/lib/auth/permissions';
import {
  DEFAULT_SALES_CATEGORY_KEYWORDS,
  SALES_CATEGORY_LABELS,
  SALES_CATEGORY_ORDER,
  type SalesCategoryKey,
  type SalesCategoryKeywords,
} from '@/lib/pos/salesCategory';

export default function SalesCategoriesSettingsPage() {
  const { currentStore } = useStore();
  const { user } = useAuth();
  const storeId = currentStore?.storeId || '';

  const canManage = isSuperuserEmail(user?.email)
    || ['owner', 'admin', 'master', 'superuser'].includes(currentStore?.role || '');

  const [keywords, setKeywords] = useState<SalesCategoryKeywords>(DEFAULT_SALES_CATEGORY_KEYWORDS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!storeId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch(`/api/store/sales-categories?storeId=${encodeURIComponent(storeId)}`, { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '불러오기 실패');
      setKeywords({ ...DEFAULT_SALES_CATEGORY_KEYWORDS, ...data.keywords });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '설정을 불러오지 못했습니다');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  const updateKeywords = (key: SalesCategoryKey, text: string) => {
    const list = text.split(/[,，\n]/).map(s => s.trim()).filter(Boolean);
    setKeywords(prev => ({ ...prev, [key]: list }));
    setSaved(false);
  };

  const resetDefaults = () => {
    setKeywords({ ...DEFAULT_SALES_CATEGORY_KEYWORDS });
    setSaved(false);
  };

  const save = async () => {
    if (!storeId || !canManage) return;
    setSaving(true);
    setError('');
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/store/sales-categories', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ storeId, keywords }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '저장 실패');
      if (data.keywords) setKeywords(data.keywords);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  if (!storeId) {
    return <div className="flex items-center justify-center h-full text-slate-400 text-sm">매장을 선택해주세요.</div>;
  }

  if (!canManage) {
    return <div className="max-w-2xl mx-auto p-6 text-center text-slate-400">master/admin 이상만 수정할 수 있습니다.</div>;
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <Link href="/dashboard/settings" className="flex items-center gap-2 text-slate-400 hover:text-teal-400 text-sm mb-6 w-fit">
        <ArrowLeft className="w-4 h-4" /> 설정으로 돌아가기
      </Link>

      <div className="flex items-center gap-2 mb-2">
        <Tag className="w-5 h-5 text-teal-400" />
        <h1 className="text-lg font-bold text-teal-400">매출 카테고리 키워드</h1>
      </div>
      <p className="text-slate-400 text-sm mb-6">
        POS SaD 품목명을 아래 키워드로 자동 분류합니다. 쉼표로 구분해 입력하세요.
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-500/30 rounded-xl text-red-400 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 text-sm py-12 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> 불러오는 중...
        </div>
      ) : (
        <div className="space-y-4">
          {SALES_CATEGORY_ORDER.filter(k => k !== 'other').map(key => (
            <label key={key} className="block">
              <span className="text-sm text-slate-200 font-medium">{SALES_CATEGORY_LABELS[key]}</span>
              <textarea
                className="mt-1 w-full min-h-[72px] rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-sm p-3 focus:border-teal-500/50 outline-none"
                value={(keywords[key] || []).join(', ')}
                onChange={e => updateKeywords(key, e.target.value)}
                placeholder={DEFAULT_SALES_CATEGORY_KEYWORDS[key].join(', ')}
              />
            </label>
          ))}

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-500/20 text-teal-400 border border-teal-500/40 hover:bg-teal-500/30 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              {saved ? '저장됨' : '저장'}
            </button>
            <button
              type="button"
              onClick={resetDefaults}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700"
            >
              <RotateCcw className="w-4 h-4" /> 기본값
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
