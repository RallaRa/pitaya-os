'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Loader2, Send } from 'lucide-react';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';

interface ChatCard {
  label: string;
  value: string;
}

interface PendingAction {
  type: string;
  patch: Record<string, unknown>;
  summary: string;
  impact: string;
  dangerous?: boolean;
}

interface ChatRow {
  role: 'user' | 'assistant';
  text: string;
  responseType?: 'answer' | 'confirm' | 'warning';
  cards?: ChatCard[];
  pendingAction?: PendingAction | null;
}

const QUICK_COMMANDS = [
  '현황 요약',
  '오늘 결과',
  '리스크 확인',
  '보수적 모드',
  '공격적 모드',
  '오늘은 매매 중단해',
];

function sessionId() {
  if (typeof window === 'undefined') return 'default';
  let id = localStorage.getItem('pitaya_stock_chat_session');
  if (!id) {
    id = `chat_${Date.now()}`;
    localStorage.setItem('pitaya_stock_chat_session', id);
  }
  return id;
}

export default function StockAiChatPanel() {
  const [expanded, setExpanded] = useState(true);
  const [messages, setMessages] = useState<ChatRow[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadHistory = useCallback(async () => {
    const headers = await getAuthJsonHeaders();
    headers['x-stock-chat-session'] = sessionId();
    const res = await fetch('/api/stock/chat', { headers });
    if (res.ok) {
      const json = await res.json();
      setMessages(json.messages || []);
    }
  }, []);

  useEffect(() => { void loadHistory(); }, [loadHistory]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  const send = async (text: string, opts?: { confirm?: boolean; force?: boolean }) => {
    const msg = text.trim();
    if (!msg && !opts?.confirm) return;
    setLoading(true);
    try {
      const headers = await getAuthJsonHeaders();
      const sid = sessionId();
      headers['x-stock-chat-session'] = sid;
      const body: Record<string, unknown> = {
        sessionId: sid,
        message: msg,
        history: messages.slice(-5),
      };
      if (opts?.confirm && pending) {
        body.confirm = true;
        body.pendingAction = pending;
        body.force = opts.force;
      }
      if (!opts?.confirm) {
        setMessages(prev => [...prev, { role: 'user', text: msg }]);
        setInput('');
      }
      const res = await fetch('/api/stock/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (opts?.confirm) {
        setPending(null);
        if (json.ok) {
          setMessages(prev => [...prev, { role: 'assistant', text: `✅ ${pending?.summary || '적용 완료'}` }]);
        }
        return;
      }
      if (json.message) {
        setMessages(prev => [...prev, json.message as ChatRow]);
        if (json.message.pendingAction) setPending(json.message.pendingAction);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 md:relative md:bottom-auto border-t border-slate-700/80 bg-slate-950/95 backdrop-blur-md">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-2 text-sm text-slate-300 hover:bg-slate-900/80"
      >
        <span className="font-medium">AI 트레이더 대화</span>
        {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
      </button>

      {expanded && (
        <div className="flex flex-col h-[min(420px,50vh)] md:h-[380px]">
          <div className="flex gap-2 px-3 py-2 overflow-x-auto border-b border-slate-800">
            {QUICK_COMMANDS.map(cmd => (
              <button
                key={cmd}
                type="button"
                onClick={() => void send(cmd)}
                className="shrink-0 px-2.5 py-1 rounded-full text-[11px] bg-slate-800 text-slate-300 hover:bg-teal-900/40 hover:text-teal-200"
              >
                {cmd}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            {messages.length === 0 && (
              <p className="text-xs text-slate-500 text-center py-6">
                포트폴리오·시장·전략 변경을 자연어로 물어보세요.
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[90%] rounded-xl px-3 py-2 text-sm ${
                  m.role === 'user'
                    ? 'ml-auto bg-teal-900/40 text-teal-50'
                    : m.responseType === 'warning'
                      ? 'bg-red-950/50 border border-red-500/30 text-red-100'
                      : 'bg-slate-900/80 text-slate-200 border border-slate-800'
                }`}
              >
                <p className="whitespace-pre-wrap">{m.text}</p>
                {m.cards && (
                  <div className="mt-2 grid grid-cols-3 gap-1">
                    {m.cards.map(c => (
                      <div key={c.label} className="rounded bg-slate-950/60 px-2 py-1 text-[10px]">
                        <p className="text-slate-500">{c.label}</p>
                        <p className="text-slate-200 font-medium">{c.value}</p>
                      </div>
                    ))}
                  </div>
                )}
                {m.pendingAction && pending && (
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => void send('', { confirm: true })}
                      className="px-3 py-1 rounded-lg bg-teal-700 text-white text-xs"
                    >
                      확인
                    </button>
                    <button
                      type="button"
                      onClick={() => setPending(null)}
                      className="px-3 py-1 rounded-lg bg-slate-700 text-slate-200 text-xs"
                    >
                      취소
                    </button>
                    {m.responseType === 'warning' && (
                      <button
                        type="button"
                        onClick={() => void send('', { confirm: true, force: true })}
                        className="px-3 py-1 rounded-lg bg-red-800 text-white text-xs"
                      >
                        그래도 실행
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-slate-500 text-xs">
                <Loader2 className="w-3 h-3 animate-spin" /> AI 분석 중…
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <form
            className="flex gap-2 p-3 border-t border-slate-800"
            onSubmit={e => {
              e.preventDefault();
              void send(input);
            }}
          >
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="예: 지금 포트폴리오 상태 어때?"
              className="flex-1 rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-teal-600"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="rounded-lg bg-teal-700 px-3 py-2 text-white disabled:opacity-40"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
