'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bot, Loader2, Send, Sparkles, Save, RefreshCw, User,
} from 'lucide-react';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import SignageShowPreview from '@/components/signage/SignageShowPreview';
import { topicLabel, type SignageSlidePlan } from '@/lib/signage/signageShowPlanner';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface Props {
  storeId: string;
  initialPrompt?: string;
  onSaved?: () => void;
  onError?: (msg: string) => void;
}

const STARTERS = [
  '인기 품목·오늘의 Pick 로테이션으로 구성해줘',
  'Pick 품목을 구매 유도 문구로 강조해줘',
  '인기 품목만 한 장 더 넣어줘',
  '쿠폰·혜택 슬라이드 추가해줘',
];

export default function SignageShowStudio({ storeId, initialPrompt, onSaved, onError }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [slides, setSlides] = useState<SignageSlidePlan[]>([]);
  const [planning, setPlanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewPlaying, setPreviewPlaying] = useState(true);
  const [contextSummary, setContextSummary] = useState<{
    storeName?: string;
    weather?: string;
    rotation?: string[];
  } | null>(null);
  const bootedRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const planShow = useCallback(async (message: string, currentSlides?: SignageSlidePlan[]) => {
    if (!storeId || planning) return;
    setPlanning(true);
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/signage/plan-show', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          storeId,
          message,
          existingSlides: currentSlides || slides,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '쇼 구성 실패');

      setSlides(data.slides || []);
      setContextSummary(data.contextSummary || null);
      setMessages(prev => [
        ...prev,
        ...(message.trim() ? [{ role: 'user' as const, content: message.trim() }] : []),
        { role: 'assistant', content: data.reply || '쇼를 구성했습니다.' },
      ]);
      setPreviewPlaying(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '쇼 구성 실패';
      onError?.(msg);
    } finally {
      setPlanning(false);
    }
  }, [storeId, planning, slides, onError]);

  useEffect(() => {
    if (!storeId || bootedRef.current) return;
    bootedRef.current = true;
    planShow(initialPrompt?.trim() || '');
  }, [storeId, initialPrompt, planShow]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, planning]);

  const sendMessage = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || planning) return;
    setInput('');
    await planShow(msg, slides);
  };

  const saveToPending = async () => {
    if (!storeId || !slides.length || saving) return;
    setSaving(true);
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/signage/create-show', {
        method: 'POST',
        headers,
        body: JSON.stringify({ storeId, slides, autoApprove: false }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '저장 실패');
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: `${data.count}장 슬라이드를 펜딩에 저장했습니다. 확정 탭에서 검토하세요.` },
      ]);
      onSaved?.();
    } catch (e: unknown) {
      onError?.(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const totalDuration = slides.reduce((sum, s) => sum + s.duration, 0);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 min-h-0">
      {/* 대화 패널 */}
      <div className="flex flex-col min-h-[420px] xl:min-h-[560px] bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-violet-400" />
          <div>
            <h2 className="text-sm font-semibold text-white">AI 쇼 기획</h2>
            <p className="text-[10px] text-gray-500">인기·Pick 품목 로테이션 · 고객용 문구만</p>
          </div>
        </div>

        {contextSummary && (
          <div className="px-4 py-2 border-b border-gray-800/80 bg-gray-950/50 text-[10px] text-gray-400 space-y-0.5">
            <p>{contextSummary.storeName} · {contextSummary.weather}</p>
            {contextSummary.rotation?.map(line => (
              <p key={line} className="text-violet-300/80">• {line}</p>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
          {messages.length === 0 && !planning && (
            <p className="text-center text-gray-500 text-xs py-6">
              로드 시 30일 판매 데이터로 인기·Pick 품목을 골라 4~5장 쇼가 자동 생성됩니다. (4시간마다 로테이션)
            </p>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-full bg-violet-600 flex items-center justify-center shrink-0">
                  <Bot className="w-3.5 h-3.5 text-white" />
                </div>
              )}
              <div
                className={`max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-tr-sm'
                    : 'bg-gray-800 text-gray-200 border border-gray-700 rounded-tl-sm'
                }`}
              >
                {msg.content}
              </div>
              {msg.role === 'user' && (
                <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
                  <User className="w-3.5 h-3.5 text-white" />
                </div>
              )}
            </div>
          ))}

          {planning && (
            <div className="flex items-center gap-2 text-gray-500 text-xs">
              <Loader2 className="w-4 h-4 animate-spin" />
              매장 데이터 분석 · 슬라이드 구성 중…
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="px-3 pb-2 flex flex-wrap gap-1.5">
          {STARTERS.map(q => (
            <button
              key={q}
              type="button"
              onClick={() => sendMessage(q)}
              disabled={planning}
              className="text-[10px] px-2 py-1 rounded-full bg-gray-800 text-gray-400 hover:bg-violet-900/30 hover:text-violet-200 border border-gray-700 disabled:opacity-40"
            >
              {q}
            </button>
          ))}
        </div>

        <form
          className="p-3 border-t border-gray-800 flex gap-2"
          onSubmit={e => { e.preventDefault(); sendMessage(); }}
        >
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="예: Pick 품목을 삼겹살로 바꿔줘"
            disabled={planning}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-violet-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={planning || !input.trim()}
            className="p-2.5 rounded-xl bg-violet-600 text-white disabled:opacity-40 hover:bg-violet-500 touch-target"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>

      {/* 미리보기 패널 */}
      <div className="flex flex-col min-h-[420px] xl:min-h-[560px] bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-white">TV 미리보기</h2>
            <p className="text-[10px] text-gray-500">
              {slides.length > 0
                ? `${slides.length}장 · 총 ${totalDuration}초`
                : '4~5장 · 20~30초 목표'}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => planShow('로테이션 품목 기준으로 다시 구성해줘', slides)}
              disabled={planning}
              className="px-3 py-2 rounded-lg text-xs bg-gray-800 text-gray-300 hover:bg-gray-700 flex items-center gap-1 disabled:opacity-40 touch-target"
            >
              <RefreshCw size={14} className={planning ? 'animate-spin' : ''} />
              재구성
            </button>
            <button
              type="button"
              onClick={saveToPending}
              disabled={saving || !slides.length || planning}
              className="px-3 py-2 rounded-lg text-xs bg-green-700 text-white hover:bg-green-600 flex items-center gap-1 disabled:opacity-40 touch-target"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              펜딩 저장
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          <SignageShowPreview
            slides={slides}
            playing={previewPlaying}
            onPlayingChange={setPreviewPlaying}
          />

          {slides.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">슬라이드 구성</p>
              {slides.map((slide, i) => (
                <div key={slide.id} className="rounded-xl bg-gray-950 border border-gray-800 p-3 text-xs">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-gray-500">{i + 1}.</span>
                    <span className="text-violet-300">{topicLabel(slide.topic)}</span>
                    <span className="text-gray-600 ml-auto">{slide.duration}초</span>
                  </div>
                  <p className="font-semibold text-gray-200">{slide.title}</p>
                  <p className="text-gray-400 mt-0.5">{slide.body}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
