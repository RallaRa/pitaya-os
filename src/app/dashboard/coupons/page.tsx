'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import {
  Tag, Plus, Loader2, ToggleLeft, ToggleRight, Trash2, Sparkles, ImageIcon, CheckCircle,
} from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import { discountLabel } from '@/lib/coupons/types';

const CouponAiCreator = dynamic(
  () => import('@/components/coupons/CouponAiCreator'),
  { ssr: false },
);
const CouponApplyModal = dynamic(
  () => import('@/components/coupons/CouponApplyModal'),
  { ssr: false },
);
const CouponAnalyticsPanel = dynamic(
  () => import('@/components/coupons/CouponAnalyticsPanel'),
  { ssr: false },
);

const PAGE_TABS = ['쿠폰 목록', '효과·이력'] as const;

interface Coupon {
  id: string;
  code: string;
  type: 'percent' | 'fixed';
  value: number;
  minAmount: number;
  maxDiscount: number;
  maxUse: number;
  usedCount: number;
  startDate?: string;
  endDate?: string;
  isActive: boolean;
  title?: string;
  description?: string;
  imageUrl?: string;
  barcodeValue?: string;
  includeBarcode?: boolean;
}

export default function CouponsPage() {
  const { currentStore } = useStore();
  const [pageTab, setPageTab] = useState<typeof PAGE_TABS[number]>('쿠폰 목록');
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showAi, setShowAi] = useState(false);
  const [applyCoupon, setApplyCoupon] = useState<Coupon | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [form, setForm] = useState({
    code: '', type: 'percent' as 'percent' | 'fixed', value: '10',
    minAmount: '0', maxDiscount: '0', maxUse: '0', startDate: '', endDate: '',
  });

  const load = useCallback(async () => {
    if (!currentStore?.storeId) { setLoading(false); return; }
    setLoading(true);
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch(`/api/coupons?storeId=${currentStore.storeId}`, { headers });
      const data = await res.json();
      setCoupons(data.coupons || []);
    } catch {
      setError('쿠폰 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [currentStore?.storeId]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!currentStore?.storeId || !form.code.trim()) return;
    setSaving(true);
    setError('');
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/coupons', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          storeId: currentStore.storeId,
          code: form.code,
          type: form.type,
          value: Number(form.value),
          minAmount: Number(form.minAmount),
          maxDiscount: Number(form.maxDiscount),
          maxUse: Number(form.maxUse),
          startDate: form.startDate || null,
          endDate: form.endDate || null,
          includeBarcode: false,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setShowForm(false);
      setForm({ code: '', type: 'percent', value: '10', minAmount: '0', maxDiscount: '0', maxUse: '0', startDate: '', endDate: '' });
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '발행 실패');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (c: Coupon) => {
    const headers = await getAuthJsonHeaders();
    await fetch('/api/coupons', {
      method: 'PUT',
      headers,
      body: JSON.stringify({ id: c.id, storeId: currentStore?.storeId, isActive: !c.isActive }),
    });
    await load();
  };

  const handleDelete = async (c: Coupon) => {
    if (!confirm(`쿠폰 "${c.code}"을(를) 삭제하시겠습니까?`)) return;
    const headers = await getAuthJsonHeaders();
    await fetch(`/api/coupons?id=${c.id}&storeId=${currentStore?.storeId}`, { method: 'DELETE', headers });
    await load();
  };

  if (!currentStore?.storeId) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        매장을 선택해주세요.
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Tag className="w-6 h-6 text-teal-400" />
          <div>
            <h1 className="text-xl font-bold text-teal-400">쿠폰 발행 관리</h1>
            <p className="text-xs text-slate-500">{currentStore.storeName}</p>
          </div>
        </div>
        {pageTab === '쿠폰 목록' && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowAi(true)}
              className="flex items-center gap-1.5 bg-violet-700 hover:bg-violet-600 text-white px-4 py-2 rounded-xl text-sm font-bold"
            >
              <Sparkles className="w-4 h-4" />AI로 만들기
            </button>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-500 text-white px-4 py-2 rounded-xl text-sm font-bold"
            >
              <Plus className="w-4 h-4" />코드만 발행
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-2 mb-5 border-b border-slate-800 pb-3">
        {PAGE_TABS.map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setPageTab(t)}
            className={`px-4 py-2 text-sm rounded-lg ${
              pageTab === t
                ? 'bg-teal-600/20 text-teal-300 font-semibold border border-teal-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      {pageTab === '효과·이력' && (
        <CouponAnalyticsPanel storeId={currentStore.storeId} />
      )}

      {pageTab === '쿠폰 목록' && (
        <>
          {showForm && (
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 mb-6 grid grid-cols-2 gap-3">
              <p className="col-span-2 text-xs text-slate-500">코드만 빠르게 등록 (이미지·바코드 없음)</p>
              <input placeholder="쿠폰 코드" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white col-span-2" />
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as 'percent' | 'fixed' }))}
                className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white">
                <option value="percent">퍼센트 할인</option>
                <option value="fixed">정액 할인</option>
              </select>
              <input type="number" placeholder="할인값" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
                className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white" />
              <input type="number" placeholder="최소주문금액" value={form.minAmount} onChange={e => setForm(f => ({ ...f, minAmount: e.target.value }))}
                className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white" />
              <input type="number" placeholder="최대사용횟수 (0=무제한)" value={form.maxUse} onChange={e => setForm(f => ({ ...f, maxUse: e.target.value }))}
                className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white" />
              <input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white" />
              <input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white" />
              <div className="col-span-2 flex gap-2">
                <button onClick={handleCreate} disabled={saving}
                  className="flex-1 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white py-2 rounded-lg font-bold">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : '발행'}
                </button>
                <button onClick={() => setShowForm(false)} className="px-4 bg-slate-700 text-slate-300 rounded-lg">취소</button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-teal-400 animate-spin" /></div>
          ) : coupons.length === 0 ? (
            <p className="text-slate-500 text-center py-12">등록된 쿠폰이 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {coupons.map(c => (
                <div key={c.id} className="flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3">
                  {c.imageUrl ? (
                    <button
                      type="button"
                      onClick={() => setPreviewImage(c.imageUrl!)}
                      className="shrink-0 w-14 h-[70px] rounded-lg overflow-hidden border border-slate-700 bg-slate-800"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={c.imageUrl} alt="" className="w-full h-full object-cover" />
                    </button>
                  ) : (
                    <div className="shrink-0 w-14 h-[70px] rounded-lg border border-dashed border-slate-700 flex items-center justify-center text-slate-600">
                      <ImageIcon className="w-5 h-5" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-mono font-bold text-white">{c.code}</p>
                    {c.title && <p className="text-xs text-slate-300 truncate">{c.title}</p>}
                    <p className="text-xs text-slate-400">
                      {discountLabel(c.type, c.value)}
                      {' · '}적용 {c.usedCount}/{c.maxUse || '∞'}
                      {c.endDate && ` · ~${c.endDate}`}
                      {c.includeBarcode && ' · 바코드'}
                    </p>
                  </div>
                  {c.isActive && (
                    <button
                      type="button"
                      onClick={() => setApplyCoupon(c)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-teal-700/50 hover:bg-teal-600/60 border border-teal-600/40 text-teal-200 rounded-lg text-xs font-semibold shrink-0"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      쿠폰 적용
                    </button>
                  )}
                  <button type="button" onClick={() => toggleActive(c)} className="text-slate-400 hover:text-teal-400">
                    {c.isActive ? <ToggleRight className="w-6 h-6 text-teal-400" /> : <ToggleLeft className="w-6 h-6" />}
                  </button>
                  <button type="button" onClick={() => handleDelete(c)} className="text-slate-500 hover:text-red-400">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <p className="text-xs text-slate-600 mt-6">
            사용 횟수는 「쿠폰 적용」 버튼으로만 기록됩니다 (POS 할인 후 직원 확인).<br />
            바코드는 AI/업로드 시 선택 · 키오스크는 할인 미리보기만 (`/kiosk/coupon-overlay`)
          </p>
        </>
      )}

      {showAi && (
        <CouponAiCreator
          storeId={currentStore.storeId}
          storeName={currentStore.storeName || ''}
          onPublished={load}
          onClose={() => setShowAi(false)}
        />
      )}

      {applyCoupon && (
        <CouponApplyModal
          coupon={applyCoupon}
          storeId={currentStore.storeId}
          onClose={() => setApplyCoupon(null)}
          onApplied={load}
        />
      )}

      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setPreviewImage(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewImage}
            alt="쿠폰"
            className="max-h-[90vh] max-w-full rounded-xl shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
