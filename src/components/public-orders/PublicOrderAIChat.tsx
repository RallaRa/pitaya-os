'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Bot, Send, Loader2, Copy, ExternalLink } from 'lucide-react';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import { AiUsedBadge, type AiMetaDisplay } from '@/components/AiUsedBadge';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  publicUrl?: string;
  ai?: AiMetaDisplay;
}

interface Props {
  storeId: string;
  sessionId?: string | null;
  onSessionChange: (sessionId: string | null) => void;
  onRefresh: () => void;
}

const QUICK_PROMPTS = [
  '설 특판 회차 만들어줘',
  '한우 등심 50kg 89000원, 한돈 삼겹 30kg 12000원 추가',
  '접수 시작해줘',
  '주문 현황 알려줘',
];

export default function PublicOrderAIChat({
  storeId,
  sessionId,
  onSessionChange,
  onRefresh,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content:
        '공개 주문을 **말로** 만들 수 있습니다.\n\n예시:\n• 「5월 한우 특판 회차 만들고 등심 50kg 89000원, 갈비 30kg 65000원 넣어줘」\n• 「접수 시작해줘」\n• 「마감 처리해줘」\n• 「링크 알려줘」\n\n회차·품목·접수 상태를 AI가 자동으로 설정합니다.',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || loading || !storeId) return;

    const userMsg: ChatMessage = { role: 'user', content: text.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/public-orders/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          storeId,
          sessionId: sessionId || undefined,
          message: text.trim(),
          history: messages.slice(-10).map(m => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '요청 실패');

      if (data.sessionId) onSessionChange(data.sessionId);
      onRefresh();

      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: data.reply || '처리했습니다.',
          publicUrl: data.publicUrl,
          ai: data.ai,
        },
      ]);
    } catch (e: unknown) {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: `⚠️ ${e instanceof Error ? e.message : '오류가 발생했습니다'}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [loading, storeId, sessionId, messages, onSessionChange, onRefresh]);

  const copyLink = (url: string) => {
    navigator.clipboard.writeText(url);
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border-l border-slate-800">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-800 shrink-0">
        <Bot className="w-4 h-4 text-teal-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-teal-300">AI 공개주문</p>
          <p className="text-[10px] text-slate-500 truncate">말로 회차·품목·접수 설정</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[92%] rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-teal-600/30 text-teal-100'
                  : 'bg-slate-800 text-slate-200'
              }`}
            >
              {msg.content}
              {msg.publicUrl && (
                <div className="mt-2 pt-2 border-t border-slate-700/60 flex flex-wrap gap-2 items-center">
                  <code className="text-[10px] text-slate-400 truncate max-w-[180px]">{msg.publicUrl}</code>
                  <button
                    type="button"
                    onClick={() => copyLink(msg.publicUrl!)}
                    className="p-1 text-slate-400 hover:text-white"
                    title="링크 복사"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                  <a
                    href={msg.publicUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 text-slate-400 hover:text-white"
                    title="미리보기"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
              {msg.ai && <AiUsedBadge ai={msg.ai} className="mt-2" />}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-slate-800 rounded-xl px-3 py-2 flex items-center gap-2 text-xs text-slate-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-400" />
              처리 중…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="px-3 py-2 border-t border-slate-800 shrink-0">
        <div className="flex gap-1.5 flex-wrap mb-2">
          {QUICK_PROMPTS.map(q => (
            <button
              key={q}
              type="button"
              disabled={loading}
              onClick={() => send(q)}
              className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 px-2 py-1 rounded-lg border border-slate-700/50 disabled:opacity-40"
            >
              {q}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder="예: 6월 특판 만들고 한우 등심 50kg 89000원 추가해줘"
            disabled={loading}
            className="flex-1 bg-slate-800 border border-slate-700/60 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-teal-500/50 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => send(input)}
            disabled={loading || !input.trim()}
            className="bg-teal-600 hover:bg-teal-500 disabled:bg-slate-700 text-white px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
