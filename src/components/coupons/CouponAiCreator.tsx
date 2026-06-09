'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Sparkles, Send, Loader2, ImagePlus, RefreshCw, CheckCircle2,
} from 'lucide-react';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import {
  EMPTY_COUPON_COPY,
  discountLabel,
  sanitizeCouponCode,
  type CouponCopyItem,
} from '@/lib/coupons/types';
import { composeAndUploadCouponImage, composeCouponImageBlob } from '@/lib/coupons/composeCouponImage';
import type { CouponLayout } from '@/components/coupons/CouponLayoutManager';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface Props {
  storeId: string;
  storeName: string;
  layouts?: CouponLayout[];
  onPublished: (created?: {
    id: string;
    code: string;
    type: 'percent' | 'fixed';
    value: number;
    endDate?: string | null;
    title?: string;
  }) => void;
  onClose: () => void;
}

function allCouponsToPublish(draft: CouponCopyItem, extras: CouponCopyItem[]): CouponCopyItem[] {
  const main = draft.code ? [draft] : [];
  const rest = extras.filter(c => c.code);
  return [...main, ...rest];
}

export default function CouponAiCreator({
  storeId,
  storeName,
  layouts: layoutsProp,
  onPublished,
  onClose,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: '할인 조건을 말씀해 주세요. 예: "2만원 구매 시 2천원, 5만원 구매 시 5천원 할인, 6월 말까지" — 레이아웃은 오른쪽에서 선택합니다.',
    },
  ]);
  const [input, setInput] = useState('');
  const [draft, setDraft] = useState<CouponCopyItem>({ ...EMPTY_COUPON_COPY });
  const [extraCoupons, setExtraCoupons] = useState<CouponCopyItem[]>([]);
  const [layouts, setLayouts] = useState<CouponLayout[]>(layoutsProp || []);
  const [layoutId, setLayoutId] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [publishLoading, setPublishLoading] = useState(false);
  const [includeBarcode, setIncludeBarcode] = useState(true);
  const [error, setError] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const previewBlobRef = useRef<Blob | null>(null);

  const loadLayouts = useCallback(async () => {
    if (layoutsProp?.length) {
      setLayouts(layoutsProp);
      if (!layoutId && layoutsProp[0]) setLayoutId(layoutsProp[0].id);
      return;
    }
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch(`/api/coupons/layouts?storeId=${encodeURIComponent(storeId)}`, { headers });
      const data = await res.json();
      const list = data.layouts || [];
      setLayouts(list);
      if (!layoutId && list[0]) setLayoutId(list[0].id);
    } catch { /* ignore */ }
  }, [storeId, layoutsProp, layoutId]);

  useEffect(() => { loadLayouts(); }, [loadLayouts]);

  const scrollChat = () => {
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  };

  const sendChat = async () => {
    const text = input.trim();
    if (!text || chatLoading) return;
    setInput('');
    setError('');
    const nextMessages = [...messages, { role: 'user' as const, content: text }];
    setMessages(nextMessages);
    setChatLoading(true);
    scrollChat();

    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/coupons/copy-chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          storeId,
          storeName,
          message: text,
          history: nextMessages.slice(0, -1),
          draft,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI 오류');
      setDraft(data.draft || draft);
      setExtraCoupons(Array.isArray(data.extraCoupons) ? data.extraCoupons : []);
      setMessages(m => [...m, { role: 'assistant', content: data.reply }]);
      setImageUrl('');
      previewBlobRef.current = null;
      scrollChat();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI 대화 실패');
    } finally {
      setChatLoading(false);
    }
  };

  const renderPreview = async (item: CouponCopyItem) => {
    const code = sanitizeCouponCode(item.code);
    if (!code) throw new Error('쿠폰 코드 필요');
    const layout = layouts.find(l => l.id === layoutId);
    if (!layout) throw new Error('레이아웃을 선택해 주세요');

    const blob = await composeCouponImageBlob({
      storeId,
      backgroundSrc: layout.backgroundUrl,
      title: item.title || code,
      bodyLines: item.bodyLines,
      code,
      includeBarcode,
    });
    previewBlobRef.current = blob;
    return URL.createObjectURL(blob);
  };

  const uploadCouponBlob = async (item: CouponCopyItem, blob: Blob): Promise<string> => {
    const code = sanitizeCouponCode(item.code);
    const fileContent = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const headers = await getAuthJsonHeaders();
    const res = await fetch('/api/coupons/upload-image', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        storeId,
        code,
        fileContent,
        fileName: `${code}.png`,
        mimeType: 'image/png',
        includeBarcode: false,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '이미지 업로드 실패');
    return data.imageUrl as string;
  };

  const handlePreview = async () => {
    setPreviewLoading(true);
    setError('');
    try {
      const url = await renderPreview(draft);
      setImageUrl(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : '미리보기 실패');
    } finally {
      setPreviewLoading(false);
    }
  };

  const publishOne = async (item: CouponCopyItem, image: string) => {
    const code = sanitizeCouponCode(item.code);
    const headers = await getAuthJsonHeaders();
    const res = await fetch('/api/coupons', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        storeId,
        code,
        type: item.type,
        value: item.value,
        minAmount: item.minAmount,
        maxDiscount: item.maxDiscount,
        maxUse: item.maxUse,
        startDate: item.startDate || null,
        endDate: item.endDate || null,
        title: item.title,
        description: item.description,
        imageUrl: image,
        layoutId,
        bodyLines: item.bodyLines,
        barcodeValue: includeBarcode ? code : '',
        includeBarcode,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '발행 실패');
    return { id: data.id as string, code, item };
  };

  const publish = async () => {
    const queue = allCouponsToPublish(draft, extraCoupons);
    if (!queue.length) {
      setError('발행할 쿠폰이 없습니다');
      return;
    }
    if (!layoutId) {
      setError('레이아웃을 선택해 주세요');
      return;
    }

    setPublishLoading(true);
    setError('');
    try {
      let first: { id: string; code: string; item: CouponCopyItem } | null = null;
      for (const item of queue) {
        const img = item === draft && previewBlobRef.current
          ? await uploadCouponBlob(item, previewBlobRef.current)
          : await composeAndUploadCouponImage({
            storeId,
            backgroundSrc: layouts.find(l => l.id === layoutId)!.backgroundUrl,
            title: item.title || item.code,
            bodyLines: item.bodyLines,
            code: sanitizeCouponCode(item.code),
            includeBarcode,
          });
        const result = await publishOne(item, img);
        if (!first) first = result;
      }
      if (first) {
        onPublished({
          id: first.id,
          code: first.code,
          type: first.item.type,
          value: first.item.value,
          endDate: first.item.endDate || null,
          title: first.item.title,
        });
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : '발행 실패');
    } finally {
      setPublishLoading(false);
    }
  };

  const publishCount = allCouponsToPublish(draft, extraCoupons).length;
  const selectedLayout = layouts.find(l => l.id === layoutId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 md:p-6">
      <div className="w-full max-w-5xl max-h-[92vh] bg-slate-950 border border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-teal-400" />
            <div>
              <h2 className="text-sm font-semibold text-slate-100">쿠폰 만들기 · 문구 AI</h2>
              <p className="text-[11px] text-slate-500">{storeName} · 레이아웃 선택 → 문구 → Canvas 미리보기 → 발행</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-300 text-sm px-2">
            닫기
          </button>
        </div>

        <div className="flex-1 grid md:grid-cols-2 min-h-0">
          <div className="flex flex-col border-b md:border-b-0 md:border-r border-slate-800 min-h-[280px]">
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`text-xs leading-relaxed px-3 py-2 rounded-xl max-w-[95%] ${
                    m.role === 'user'
                      ? 'ml-auto bg-teal-900/40 text-teal-100 border border-teal-800/50'
                      : 'bg-slate-900 text-slate-300 border border-slate-800'
                  }`}
                >
                  {m.content}
                </div>
              ))}
              {chatLoading && (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> 작성 중…
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <div className="p-3 border-t border-slate-800 flex gap-2">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendChat()}
                placeholder='예: 2만원 구매 시 2천원, 5만원 구매 시 5천원 할인'
                className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 outline-none focus:border-teal-500"
              />
              <button
                type="button"
                onClick={sendChat}
                disabled={chatLoading || !input.trim()}
                className="px-3 py-2 bg-teal-700 hover:bg-teal-600 disabled:opacity-40 rounded-lg text-white"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex flex-col min-h-0 overflow-y-auto p-4 space-y-3">
            <div>
              <p className="text-[10px] text-slate-500 mb-1.5">레이아웃 (배경)</p>
              {layouts.length === 0 ? (
                <p className="text-xs text-amber-400/90">「레이아웃」 탭에서 배경을 먼저 만드세요.</p>
              ) : (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {layouts.map(l => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => { setLayoutId(l.id); setImageUrl(''); previewBlobRef.current = null; }}
                      className={`shrink-0 w-16 rounded-lg overflow-hidden border-2 transition-colors ${
                        layoutId === l.id ? 'border-teal-500' : 'border-slate-700 opacity-70 hover:opacity-100'
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={l.backgroundUrl} alt={l.name} className="w-full aspect-[4/5] object-cover" />
                    </button>
                  ))}
                </div>
              )}
              {selectedLayout && (
                <p className="text-[10px] text-slate-600 mt-1">{selectedLayout.name}</p>
              )}
            </div>

            <div className="aspect-[4/5] max-h-[240px] mx-auto w-full max-w-[200px] bg-slate-900 border border-slate-700 rounded-xl overflow-hidden flex items-center justify-center">
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="미리보기" className="w-full h-full object-contain" />
              ) : (
                <div className="text-center p-3 text-slate-600 text-[10px]">
                  <ImagePlus className="w-6 h-6 mx-auto mb-1 opacity-40" />
                  레이아웃 + 문구<br />미리보기
                </div>
              )}
            </div>

            {draft.bodyLines.length > 0 && (
              <div className="bg-slate-900/80 border border-slate-700 rounded-lg p-2">
                <p className="text-[9px] text-slate-500 mb-1">카드 문구</p>
                {draft.bodyLines.map((line, i) => (
                  <p key={i} className="text-[11px] text-teal-300/90">{line}</p>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 text-xs">
              <label className="col-span-2 block">
                <span className="text-slate-500">코드</span>
                <input
                  value={draft.code}
                  onChange={e => setDraft(d => ({ ...d, code: sanitizeCouponCode(e.target.value) }))}
                  className="mt-0.5 w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-white font-mono"
                />
              </label>
              <label className="col-span-2 block">
                <span className="text-slate-500">제목</span>
                <input
                  value={draft.title}
                  onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
                  className="mt-0.5 w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-white"
                />
              </label>
              <select
                value={draft.type}
                onChange={e => setDraft(d => ({ ...d, type: e.target.value as 'percent' | 'fixed' }))}
                className="px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-white"
              >
                <option value="percent">%</option>
                <option value="fixed">원</option>
              </select>
              <input
                type="number"
                value={draft.value}
                onChange={e => setDraft(d => ({ ...d, value: Number(e.target.value) }))}
                className="px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-white"
              />
              <input
                type="date"
                value={draft.endDate}
                onChange={e => setDraft(d => ({ ...d, endDate: e.target.value }))}
                className="col-span-2 px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-white"
              />
            </div>

            {draft.code && (
              <p className="text-[10px] text-slate-500">
                POS: {discountLabel(draft.type, draft.value)}
                {draft.minAmount > 0 && ` · ${draft.minAmount.toLocaleString()}원 이상`}
              </p>
            )}

            {extraCoupons.length > 0 && (
              <div className="text-[10px] text-violet-300/90 space-y-1">
                <p className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> 추가 발행 {extraCoupons.length}개</p>
                {extraCoupons.map((c, i) => (
                  <p key={i} className="text-slate-500 font-mono">{c.code} · {c.bodyLines[0] || discountLabel(c.type, c.value)}</p>
                ))}
              </div>
            )}

            <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={includeBarcode}
                onChange={e => {
                  setIncludeBarcode(e.target.checked);
                  setImageUrl('');
                  previewBlobRef.current = null;
                }}
                className="rounded border-slate-600"
              />
              바코드 포함
            </label>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handlePreview}
                disabled={previewLoading || !layoutId || !draft.code}
                className="flex-1 flex items-center justify-center gap-1 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg text-xs text-slate-300 disabled:opacity-50"
              >
                {previewLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                미리보기
              </button>
              <button
                type="button"
                onClick={publish}
                disabled={publishLoading || !layoutId || publishCount === 0}
                className="flex-1 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 rounded-lg text-xs font-bold text-white"
              >
                {publishLoading
                  ? <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                  : `발행${publishCount > 1 ? ` (${publishCount}개)` : ''}`}
              </button>
            </div>

            {error && <p className="text-xs text-red-400">{error}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
