'use client';

import { useState, useRef } from 'react';
import {
  Sparkles, Send, Loader2, ImagePlus, Wand2, Download, Upload,
} from 'lucide-react';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import {
  EMPTY_COUPON_DRAFT,
  discountLabel,
  sanitizeCouponCode,
  type CouponDraft,
} from '@/lib/coupons/types';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface Props {
  storeId: string;
  storeName: string;
  onPublished: () => void;
  onClose: () => void;
}

export default function CouponAiCreator({ storeId, storeName, onPublished, onClose }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: '안녕하세요! 원하시는 쿠폰을 말씀해 주세요. 예: "한우 10% 할인, 이번 주말까지, 코드 HANWOO10"',
    },
  ]);
  const [input, setInput] = useState('');
  const [draft, setDraft] = useState<CouponDraft>({ ...EMPTY_COUPON_DRAFT });
  const [imageUrl, setImageUrl] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [publishLoading, setPublishLoading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

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
      const res = await fetch('/api/coupons/ai-chat', {
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
      setMessages(m => [...m, { role: 'assistant', content: data.reply }]);
      scrollChat();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI 대화 실패');
    } finally {
      setChatLoading(false);
    }
  };

  const generateImage = async () => {
    const code = sanitizeCouponCode(draft.code);
    if (!code) {
      setError('쿠폰 코드를 먼저 정해 주세요 (대화로 요청하거나 아래 코드 입력)');
      return;
    }
    setImageLoading(true);
    setError('');
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/coupons/generate-image', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          storeId,
          code,
          title: draft.title || code,
          type: draft.type,
          value: draft.value,
          imagePrompt: draft.imagePrompt,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '이미지 생성 실패');
      setImageUrl(data.imageUrl);
      setDraft(d => ({ ...d, code }));
    } catch (e) {
      setError(e instanceof Error ? e.message : '이미지 생성 실패');
    } finally {
      setImageLoading(false);
    }
  };

  const uploadImage = async (file: File) => {
    const code = sanitizeCouponCode(draft.code);
    if (!code) {
      setError('쿠폰 코드를 먼저 입력해 주세요');
      return;
    }
    setImageLoading(true);
    setError('');
    try {
      const b64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/coupons/upload-image', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          storeId,
          code,
          title: draft.title || code,
          type: draft.type,
          value: draft.value,
          fileContent: b64,
          fileName: file.name,
          mimeType: file.type,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '업로드 실패');
      setImageUrl(data.imageUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : '업로드 실패');
    } finally {
      setImageLoading(false);
    }
  };

  const publish = async () => {
    const code = sanitizeCouponCode(draft.code);
    if (!code || !draft.value) {
      setError('코드와 할인값이 필요합니다');
      return;
    }
    setPublishLoading(true);
    setError('');
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/coupons', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          storeId,
          code,
          type: draft.type,
          value: draft.value,
          minAmount: draft.minAmount,
          maxDiscount: draft.maxDiscount,
          maxUse: draft.maxUse,
          startDate: draft.startDate || null,
          endDate: draft.endDate || null,
          title: draft.title,
          description: draft.description,
          imageUrl,
          imagePrompt: draft.imagePrompt,
          barcodeValue: code,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '발행 실패');
      onPublished();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : '발행 실패');
    } finally {
      setPublishLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 md:p-6">
      <div className="w-full max-w-5xl max-h-[92vh] bg-slate-950 border border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-violet-400" />
            <div>
              <h2 className="text-sm font-semibold text-slate-100">AI 쿠폰 만들기</h2>
              <p className="text-[11px] text-slate-500">{storeName} · 대화 → 이미지·바코드 → 발행</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-300 text-sm px-2">
            닫기
          </button>
        </div>

        <div className="flex-1 grid md:grid-cols-2 min-h-0">
          {/* Chat */}
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
                placeholder="예: 등심 5000원 할인, 6월 말까지"
                className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 outline-none focus:border-violet-500"
              />
              <button
                type="button"
                onClick={sendChat}
                disabled={chatLoading || !input.trim()}
                className="px-3 py-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-40 rounded-lg text-white"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Preview + draft */}
          <div className="flex flex-col min-h-0 overflow-y-auto p-4 space-y-4">
            <div className="aspect-[4/5] max-h-[340px] mx-auto w-full max-w-[280px] bg-slate-900 border border-slate-700 rounded-xl overflow-hidden flex items-center justify-center">
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="쿠폰 미리보기" className="w-full h-full object-contain" />
              ) : (
                <div className="text-center p-4 text-slate-600 text-xs">
                  <ImagePlus className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  AI 이미지 생성 또는<br />직접 업로드하면<br />바코드가 합성됩니다
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <label className="col-span-2 block">
                <span className="text-slate-500">코드 (바코드)</span>
                <input
                  value={draft.code}
                  onChange={e => setDraft(d => ({ ...d, code: sanitizeCouponCode(e.target.value) }))}
                  className="mt-1 w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-white font-mono"
                />
              </label>
              <label className="col-span-2 block">
                <span className="text-slate-500">제목</span>
                <input
                  value={draft.title}
                  onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
                  className="mt-1 w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-white"
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
                value={draft.startDate}
                onChange={e => setDraft(d => ({ ...d, startDate: e.target.value }))}
                className="px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-white"
              />
              <input
                type="date"
                value={draft.endDate}
                onChange={e => setDraft(d => ({ ...d, endDate: e.target.value }))}
                className="px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-white"
              />
            </div>

            {draft.code && (
              <p className="text-[11px] text-teal-400/90">
                {discountLabel(draft.type, draft.value)}
                {draft.endDate && ` · ~${draft.endDate}`}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={generateImage}
                disabled={imageLoading}
                className="flex items-center gap-1.5 px-3 py-2 bg-violet-800/60 hover:bg-violet-700/60 border border-violet-600/40 rounded-lg text-xs text-violet-200 disabled:opacity-50"
              >
                {imageLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                AI 이미지+바코드
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={imageLoading}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg text-xs text-slate-300 disabled:opacity-50"
              >
                <Upload className="w-3.5 h-3.5" />
                이미지 업로드
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) uploadImage(f);
                  e.target.value = '';
                }}
              />
              {imageUrl && (
                <a
                  href={imageUrl}
                  download={`coupon-${draft.code || 'pitaya'}.png`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg text-xs text-slate-300"
                >
                  <Download className="w-3.5 h-3.5" />
                  PNG 저장
                </a>
              )}
            </div>

            {error && <p className="text-xs text-red-400">{error}</p>}

            <button
              type="button"
              onClick={publish}
              disabled={publishLoading || !draft.code}
              className="w-full py-2.5 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 rounded-xl text-sm font-bold text-white"
            >
              {publishLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : '쿠폰 발행'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
