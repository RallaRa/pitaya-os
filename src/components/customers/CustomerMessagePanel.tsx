'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Loader2, Send, AlertCircle, CheckCircle2 } from 'lucide-react';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';

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
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [templateCode, setTemplateCode] = useState('');
  const [campaignKey, setCampaignKey] = useState('');
  const [smsFallback, setSmsFallback] = useState(true);
  const [add1, setAdd1] = useState('');
  const [add2, setAdd2] = useState('');
  const [add3, setAdd3] = useState('');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<DryRunResult | null>(null);
  const [result, setResult] = useState<SendResult | null>(null);
  const [error, setError] = useState('');

  const buildBody = useCallback((dryRun: boolean) => ({
    ...filterBody,
    storeId,
    templateCode: templateCode.trim() || undefined,
    campaignKey: campaignKey.trim() || undefined,
    smsFallback,
    dryRun,
    variables: {
      add1: add1.trim(),
      add2: add2.trim(),
      add3: add3.trim(),
    },
  }), [filterBody, storeId, templateCode, campaignKey, smsFallback, add1, add2, add3]);

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
    const count = preview?.attempted ?? filteredTotal;
    if (!confirm(`현재 필터 조건의 고객 ${count.toLocaleString()}명에게 알림톡을 발송합니다. 계속할까요?`)) return;

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
            <h2 className="text-sm font-semibold text-slate-100">DHN 알림톡 발송</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              현재 필터 {filteredTotal.toLocaleString()}명 · 대형네트웍스 API
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
                DHN API 미설정. `.env`에 `DHN_SENDER_PROFILE_KEY`, `DHN_SENDER_PHONE`, `DHN_TEMPLATE_CODE`를 추가하세요.
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="block col-span-2">
              <span className="text-[11px] text-slate-500">템플릿 코드 (tmp_number)</span>
              <input
                value={templateCode}
                onChange={e => setTemplateCode(e.target.value)}
                placeholder="env DHN_TEMPLATE_CODE 또는 직접 입력"
                className="mt-1 w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 outline-none focus:border-teal-500"
              />
            </label>
            <label className="block col-span-2">
              <span className="text-[11px] text-slate-500">캠페인 키 (재발송 방지, 선택)</span>
              <input
                value={campaignKey}
                onChange={e => setCampaignKey(e.target.value)}
                placeholder="예: coupon_20260531"
                className="mt-1 w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 outline-none focus:border-teal-500"
              />
            </label>
          </div>

          <div className="space-y-2">
            <p className="text-[11px] text-slate-500">템플릿 변수 (#{'{추가정보1}'} ~ 3, 고객명은 자동)</p>
            <input
              value={add1}
              onChange={e => setAdd1(e.target.value)}
              placeholder="추가정보1 — 예: 쿠폰코드 SUMMER10"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 outline-none focus:border-teal-500"
            />
            <input
              value={add2}
              onChange={e => setAdd2(e.target.value)}
              placeholder="추가정보2 — 예: 10% 할인"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 outline-none focus:border-teal-500"
            />
            <input
              value={add3}
              onChange={e => setAdd3(e.target.value)}
              placeholder="추가정보3 — 예: ~6/30까지"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 outline-none focus:border-teal-500"
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={smsFallback}
              onChange={e => setSmsFallback(e.target.checked)}
              className="rounded border-slate-600"
            />
            알림톡 실패 시 SMS/LMS 대체 발송 (kakao_2nd)
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
