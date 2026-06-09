'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Loader2, Send, AlertCircle, CheckCircle2 } from 'lucide-react';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import CouponSelectList from '@/components/coupons/CouponSelectList';
import type { AlimtalkCouponPayload } from '@/lib/coupons/alimtalkVariables';
import { useStore } from '@/context/StoreContext';

interface CustomerMessagePanelProps {
  storeId: string;
  filterBody: Record<string, unknown>;
  filteredTotal: number;
  onClose: () => void;
}

interface DryRunResult {
  dryRun: boolean;
  totalMatched: number;
  attempted: number;
  skipped: number;
  skipReasons: Record<string, number>;
  message?: string;
}

interface SendResult extends DryRunResult {
  sent: number;
  failed: number;
  failures?: { cusCode: string; phone: string; error: string }[];
  logId?: string;
}

export default function CustomerMessagePanel({
  storeId,
  filterBody,
  filteredTotal,
  onClose,
}: CustomerMessagePanelProps) {
  const { currentStore } = useStore();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [templateCode, setTemplateCode] = useState('');
  const [campaignKeyOverride, setCampaignKeyOverride] = useState('');
  const [smsFallback, setSmsFallback] = useState(true);
  const [selectedCoupon, setSelectedCoupon] = useState<AlimtalkCouponPayload | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<DryRunResult | null>(null);
  const [result, setResult] = useState<SendResult | null>(null);
  const [error, setError] = useState('');

  const effectiveCampaignKey = campaignKeyOverride.trim()
    || selectedCoupon?.campaignKey
    || '';

  const buildBody = useCallback((dryRun: boolean) => ({
    ...filterBody,
    storeId,
    templateCode: templateCode.trim() || undefined,
    campaignKey: effectiveCampaignKey || undefined,
    couponId: selectedCoupon?.couponId || undefined,
    smsFallback,
    dryRun,
    variables: selectedCoupon
      ? selectedCoupon.variables
      : { add1: '', add2: '', add3: '' },
  }), [filterBody, storeId, templateCode, effectiveCampaignKey, selectedCoupon, smsFallback]);

  useEffect(() => {
    (async () => {
      try {
        const headers = await getAuthJsonHeaders();
        const res = await fetch(`/api/customers/message?storeId=${encodeURIComponent(storeId)}&limit=1`, { headers });
        const d = await res.json();
        setConfigured(!!d.configured);
      } catch {
        setConfigured(false);
      }
    })();
  }, [storeId]);

  const runDryRun = async () => {
    if (selectedCoupon === undefined) {
      setError('발송할 쿠폰을 선택하거나 「쿠폰 없이 발송」을 선택하세요.');
      return;
    }
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/customers/message', {
        method: 'POST',
        headers,
        body: JSON.stringify(buildBody(true)),
      });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setPreview(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : '미리보기 실패');
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (selectedCoupon === undefined) {
      setError('발송할 쿠폰을 선택하거나 「쿠폰 없이 발송」을 선택하세요.');
      return;
    }
    const count = preview?.attempted ?? filteredTotal;
    const couponHint = selectedCoupon
      ? `\n쿠폰: ${selectedCoupon.previewLabel}`
      : '\n(쿠폰 없이 일반 안내)';
    if (!confirm(`현재 필터 조건의 고객 ${count.toLocaleString()}명에게 알림톡을 발송합니다.${couponHint}\n\n계속할까요?`)) return;

    setLoading(true);
    setError('');
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/customers/message', {
        method: 'POST',
        headers,
        body: JSON.stringify(buildBody(false)),
      });
      const d = await res.json();
      if (d.error && !d.sent) throw new Error(d.error || d.message);
      setResult(d);
      setPreview(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '발송 실패');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">SOLAPI 알림톡 발송</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              현재 필터 {filteredTotal.toLocaleString()}명 · 쿠폰 선택 후 발송
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 text-slate-500 hover:text-slate-300">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {configured === false && (
            <div className="flex gap-2 p-3 bg-amber-950/40 border border-amber-800/50 rounded-lg text-xs text-amber-200">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                SOLAPI 미설정. `.env`에 `SOLAPI_API_KEY`, `SOLAPI_API_SECRET`, `SOLAPI_PF_ID`, `SOLAPI_SENDER_PHONE`, `SOLAPI_TEMPLATE_ID`를 추가하세요.
              </div>
            </div>
          )}

          <CouponSelectList
            storeId={storeId}
            storeName={currentStore?.storeName || ''}
            selectedId={selectedCoupon === undefined ? undefined : (selectedCoupon?.couponId ?? null)}
            onSelect={payload => {
              setSelectedCoupon(payload);
              setPreview(null);
              setResult(null);
            }}
            compact
          />

          {selectedCoupon && (
            <div className="p-3 bg-teal-950/25 border border-teal-800/40 rounded-lg text-xs space-y-1">
              <p className="font-medium text-teal-300">알림톡 변수 미리보기</p>
              <p className="text-slate-400"><span className="text-slate-500">추가정보1</span> {selectedCoupon.variables.add1}</p>
              <p className="text-slate-400"><span className="text-slate-500">추가정보2</span> {selectedCoupon.variables.add2}</p>
              <p className="text-slate-400"><span className="text-slate-500">추가정보3</span> {selectedCoupon.variables.add3}</p>
              <p className="text-[10px] text-slate-600 pt-1">고객명은 자동 · 캠페인키 {selectedCoupon.campaignKey}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="block col-span-2">
              <span className="text-[11px] text-slate-500">템플릿 ID (SOLAPI)</span>
              <input
                value={templateCode}
                onChange={e => setTemplateCode(e.target.value)}
                placeholder="env SOLAPI_TEMPLATE_ID 또는 직접 입력 (KA...)"
                className="mt-1 w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 outline-none focus:border-teal-500"
              />
            </label>
            <label className="block col-span-2">
              <span className="text-[11px] text-slate-500">캠페인 키 (재발송 방지, 선택)</span>
              <input
                value={campaignKeyOverride}
                onChange={e => setCampaignKeyOverride(e.target.value)}
                placeholder={selectedCoupon ? selectedCoupon.campaignKey : '쿠폰 선택 시 자동 생성'}
                className="mt-1 w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 outline-none focus:border-teal-500"
              />
            </label>
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={smsFallback}
              onChange={e => setSmsFallback(e.target.checked)}
              className="rounded border-slate-600"
            />
            알림톡 실패 시 SMS 대체 발송 (disableSms: false)
          </label>

          {preview && (
            <div className="p-3 bg-slate-800/60 border border-slate-700 rounded-lg text-xs text-slate-300 space-y-1">
              <p className="font-medium text-teal-300">미리보기</p>
              <p>발송 가능: <strong>{preview.attempted.toLocaleString()}명</strong> / 전체 {preview.totalMatched.toLocaleString()}명</p>
              {preview.skipped > 0 && (
                <p className="text-slate-500">제외 {preview.skipped}명 — {JSON.stringify(preview.skipReasons)}</p>
              )}
            </div>
          )}

          {result && (
            <div className={`p-3 border rounded-lg text-xs space-y-1 ${result.failed > 0 ? 'bg-amber-950/30 border-amber-800/50' : 'bg-emerald-950/30 border-emerald-800/50'}`}>
              <p className="flex items-center gap-1.5 font-medium text-slate-200">
                {result.failed === 0 ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertCircle className="w-4 h-4 text-amber-400" />}
                {result.message}
              </p>
              {result.failures && result.failures.length > 0 && (
                <ul className="text-slate-500 mt-2 space-y-0.5">
                  {result.failures.slice(0, 5).map(f => (
                    <li key={f.cusCode}>{f.cusCode}: {f.error}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-slate-800 bg-slate-900/80">
          <button
            type="button"
            onClick={runDryRun}
            disabled={loading}
            className="flex-1 px-3 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-300 rounded-lg text-xs font-medium disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : '발송 대상 확인'}
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={loading || configured === false}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-teal-700 hover:bg-teal-600 text-white rounded-lg text-xs font-medium disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            알림톡 발송
          </button>
        </div>
      </div>
    </div>
  );
}
