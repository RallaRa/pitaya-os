'use client';

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Loader2, Sparkles, Tag, ExternalLink, CheckCircle2 } from 'lucide-react';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import { discountLabel } from '@/lib/coupons/types';
import { buildAlimtalkFromCouponRow, type AlimtalkCouponPayload } from '@/lib/coupons/alimtalkVariables';

const CouponAiCreator = dynamic(
  () => import('@/components/coupons/CouponAiCreator'),
  { ssr: false },
);

export interface SelectableCoupon {
  id: string;
  code: string;
  type: 'percent' | 'fixed';
  value: number;
  endDate?: string;
  title?: string;
  isActive: boolean;
  imageUrl?: string;
}

interface Props {
  storeId: string;
  storeName?: string;
  /** undefined = 아직 미선택, null = 쿠폰 없이, string = 쿠폰 id */
  selectedId: string | null | undefined;
  onSelect: (payload: AlimtalkCouponPayload | null) => void;
  allowNone?: boolean;
  compact?: boolean;
}

export default function CouponSelectList({
  storeId,
  storeName = '',
  selectedId,
  onSelect,
  allowNone = true,
  compact = false,
}: Props) {
  const [coupons, setCoupons] = useState<SelectableCoupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAi, setShowAi] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    setError('');
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch(`/api/coupons?storeId=${encodeURIComponent(storeId)}`, { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '목록 조회 실패');
      setCoupons(data.coupons || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '쿠폰 목록을 불러오지 못했습니다');
      setCoupons([]);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  const pick = (c: SelectableCoupon | null) => {
    if (!c) {
      onSelect(null);
      return;
    }
    onSelect(buildAlimtalkFromCouponRow({
      id: c.id,
      code: c.code,
      type: c.type,
      value: c.value,
      endDate: c.endDate ?? null,
      title: c.title,
    }));
  };

  const activeCoupons = coupons.filter(c => c.isActive);
  const inactiveCoupons = coupons.filter(c => !c.isActive);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[11px] text-slate-500 flex items-center gap-1">
          <Tag className="w-3 h-3" />
          발송할 쿠폰 선택 · 생성은 별도 화면
        </p>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setShowAi(true)}
            className="flex items-center gap-1 px-2 py-1 bg-violet-800/50 hover:bg-violet-700/50 border border-violet-600/40 text-violet-200 rounded-lg text-[10px] font-medium"
          >
            <Sparkles className="w-3 h-3" /> AI로 만들기
          </button>
          <Link
            href="/dashboard/coupons"
            target="_blank"
            className="flex items-center gap-1 px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-300 rounded-lg text-[10px]"
          >
            <ExternalLink className="w-3 h-3" /> 쿠폰·할인 관리
          </Link>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-6 text-slate-500 text-xs gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> 쿠폰 목록 불러오는 중…
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      {!loading && allowNone && (
        <button
          type="button"
          onClick={() => pick(null)}
          className={`w-full text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
            selectedId === null
              ? 'border-slate-500 bg-slate-800/80 text-slate-200'
              : 'border-slate-700 bg-slate-900/40 text-slate-400 hover:border-slate-600'
          }`}
        >
          쿠폰 없이 발송 (일반 안내)
        </button>
      )}

      {!loading && activeCoupons.length === 0 && (
        <div className="text-center py-4 px-3 bg-slate-900/60 border border-dashed border-slate-700 rounded-lg">
          <p className="text-xs text-slate-500">활성 쿠폰이 없습니다.</p>
          <button
            type="button"
            onClick={() => setShowAi(true)}
            className="mt-2 text-xs text-violet-300 hover:text-violet-200 underline"
          >
            AI로 첫 쿠폰 만들기
          </button>
        </div>
      )}

      {!loading && activeCoupons.length > 0 && (
        <div className={`space-y-1.5 ${compact ? 'max-h-40' : 'max-h-52'} overflow-y-auto pr-0.5`}>
          {activeCoupons.map(c => {
            const selected = selectedId === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => pick(c)}
                className={`w-full flex items-start gap-2 text-left px-3 py-2 rounded-lg border transition-colors ${
                  selected
                    ? 'border-teal-500/60 bg-teal-950/30 ring-1 ring-teal-500/20'
                    : 'border-slate-700 bg-slate-900/50 hover:border-slate-600 hover:bg-slate-800/40'
                }`}
              >
                {selected && <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />}
                <div className="flex-1 min-w-0">
                  <p className="font-mono font-bold text-sm text-white truncate">{c.code}</p>
                  {c.title && <p className="text-[10px] text-slate-400 truncate">{c.title}</p>}
                  <p className="text-[10px] text-teal-400/90 mt-0.5">
                    {discountLabel(c.type, c.value)}
                    {c.endDate && ` · ~${c.endDate}`}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {!loading && inactiveCoupons.length > 0 && !compact && (
        <details className="text-[10px] text-slate-600">
          <summary className="cursor-pointer hover:text-slate-400">비활성 쿠폰 {inactiveCoupons.length}개</summary>
          <div className="mt-1 space-y-1 opacity-60">
            {inactiveCoupons.map(c => (
              <p key={c.id} className="px-2 font-mono">{c.code}</p>
            ))}
          </div>
        </details>
      )}

      {showAi && (
        <CouponAiCreator
          storeId={storeId}
          storeName={storeName}
          onPublished={async (created) => {
            await load();
            if (created?.id) {
              onSelect(buildAlimtalkFromCouponRow({
                id: created.id,
                code: created.code,
                type: created.type,
                value: created.value,
                endDate: created.endDate ?? null,
                title: created.title,
              }));
            }
          }}
          onClose={() => setShowAi(false)}
        />
      )}
    </div>
  );
}
