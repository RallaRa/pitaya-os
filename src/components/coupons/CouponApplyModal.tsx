'use client';

import { useState } from 'react';
import { X, Loader2, CheckCircle2, Tag } from 'lucide-react';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import { discountLabel } from '@/lib/coupons/types';

interface CouponForApply {
  id: string;
  code: string;
  title?: string;
  type: 'percent' | 'fixed';
  value: number;
  minAmount: number;
  usedCount: number;
  maxUse: number;
}

interface Props {
  coupon: CouponForApply;
  storeId: string;
  onClose: () => void;
  onApplied: () => void;
}

export default function CouponApplyModal({ coupon, storeId, onClose, onApplied }: Props) {
  const [orderAmount, setOrderAmount] = useState('');
  const [note, setNote] = useState('');
  const [customerCusCode, setCustomerCusCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<{ discount: number; message: string } | null>(null);

  const amountNum = Number(orderAmount) || 0;
  let previewDiscount = 0;
  if (amountNum > 0) {
    if (coupon.type === 'percent') {
      previewDiscount = Math.round(amountNum * (coupon.value / 100));
    } else {
      previewDiscount = Math.min(coupon.value, amountNum);
    }
  }

  const handleApply = async () => {
    if (amountNum <= 0) {
      setError('주문금액을 입력해 주세요');
      return;
    }
    if (coupon.minAmount > 0 && amountNum < coupon.minAmount) {
      setError(`최소 주문금액 ${coupon.minAmount.toLocaleString()}원 이상이어야 합니다`);
      return;
    }
    if (!confirm(`쿠폰 ${coupon.code} · ${previewDiscount.toLocaleString()}원 할인을 적용 기록합니다.`)) {
      return;
    }

    setLoading(true);
    setError('');
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/coupons/apply', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          storeId,
          couponId: coupon.id,
          orderAmount: amountNum,
          note: note.trim(),
          customerCusCode: customerCusCode.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '적용 실패');
      setSuccess({ discount: data.discount, message: data.message });
      onApplied();
    } catch (e) {
      setError(e instanceof Error ? e.message : '적용 실패');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md bg-slate-950 border border-slate-700 rounded-2xl shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Tag className="w-5 h-5 text-teal-400" />
            <div>
              <h2 className="text-sm font-semibold text-white">쿠폰 적용</h2>
              <p className="text-[11px] text-slate-500 font-mono">{coupon.code}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-300">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {success ? (
            <div className="text-center py-4 space-y-2">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
              <p className="text-emerald-300 font-semibold">{success.message}</p>
              <p className="text-xs text-slate-500">적용 이력에 기록되었습니다</p>
              <button
                type="button"
                onClick={onClose}
                className="mt-2 w-full py-2 bg-slate-800 rounded-lg text-sm text-slate-300"
              >
                닫기
              </button>
            </div>
          ) : (
            <>
              <p className="text-xs text-slate-400">
                {coupon.title || coupon.code} · {discountLabel(coupon.type, coupon.value)}
                {' · '}사용 {coupon.usedCount}/{coupon.maxUse || '∞'}
              </p>
              <p className="text-[11px] text-amber-200/80 bg-amber-950/30 border border-amber-900/40 rounded-lg px-3 py-2">
                POS 할인 처리 후, 여기서 「적용 기록」을 눌러야 사용 횟수·효과 분석에 반영됩니다.
              </p>
              <label className="block text-xs">
                <span className="text-slate-500">주문금액 (원) *</span>
                <input
                  type="number"
                  value={orderAmount}
                  onChange={e => setOrderAmount(e.target.value)}
                  placeholder="50000"
                  className="mt-1 w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
                />
              </label>
              {amountNum > 0 && (
                <p className="text-xs text-teal-400">
                  예상 할인: {previewDiscount.toLocaleString()}원 → 결제 {Math.max(0, amountNum - previewDiscount).toLocaleString()}원
                </p>
              )}
              <label className="block text-xs">
                <span className="text-slate-500">고객코드 (선택)</span>
                <input
                  value={customerCusCode}
                  onChange={e => setCustomerCusCode(e.target.value)}
                  className="mt-1 w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono"
                />
              </label>
              <label className="block text-xs">
                <span className="text-slate-500">메모 (선택)</span>
                <input
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="예: 한우 등심 600g"
                  className="mt-1 w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
                />
              </label>
              {error && <p className="text-xs text-red-400">{error}</p>}
              <button
                type="button"
                onClick={handleApply}
                disabled={loading}
                className="w-full py-2.5 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 rounded-xl text-sm font-bold text-white"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : '쿠폰 적용 기록'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
