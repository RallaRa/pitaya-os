'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, ChevronDown, ChevronUp, Loader2, Send, Sparkles } from 'lucide-react';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import type { VoucherAiDraft } from '@/lib/accounting/voucherAiPrompt';
import type { VoucherLine, VoucherType } from '@/lib/accounting/types';

interface ChatRow {
  role: 'user' | 'assistant';
  content: string;
  applied?: boolean;
  warnings?: string[];
}

export interface VoucherAiContextPayload {
  voucherDate: string;
  voucherType: VoucherType;
  description: string;
  lines: VoucherLine[];
  fundMode?: boolean;
}

interface Props {
  storeId: string;
  readOnly?: boolean;
  context: VoucherAiContextPayload;
  onApply: (draft: VoucherAiDraft) => void;
}

const QUICK_PROMPTS = [
  '330000원 식자재 외상매입 분개',
  '오늘 현금 매출 500000원',
  '차대 균형 확인해줘',
  '이 전표 분개 설명해줘',
];

const WELCOME = '자연어로 전표를 입력하세요. 예: "삼성식자재 330000원 외상매입", "어제 카드매출 120만원"\n생성된 분개는 아래 시트에 자동 반영됩니다.';

export default function VoucherEntryAiChat({
  storeId,
  readOnly = false,
  context,
  onApply,
}: Props) {
  const [expanded, setExpanded] = useState(true);
  const [messages, setMessages] = useState<ChatRow[]>([
    { role: 'assistant', content: WELCOME },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const send = useCallback(async (text: string) => {
    const msg = text.trim();
    if (!msg || loading || !storeId || readOnly) return;

    setLoading(true);
    setMessages(prev => [...prev, { role: 'user', content: msg }]);
    setInput('');

    try {
      const headers = await getAuthJsonHeaders();
      const history = messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .slice(-8)
        .map(m => ({ role: m.role, content: m.content }));

      const res = await fetch('/api/accounting/voucher-ai', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          storeId,
          message: msg,
          history,
          context,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'AI 요청 실패');
      }

      let reply = String(data.reply || '처리했습니다.');
      const warnings = Array.isArray(data.warnings) ? data.warnings as string[] : [];
      let applied = false;

      if (data.apply && data.draft?.lines?.length >= 2) {
        onApply(data.draft as VoucherAiDraft);
        applied = true;
        if (data.balanced) {
          reply += '\n\n✅ 분개를 시트에 반영했습니다. (차·대 균형 일치)';
        } else {
          reply += '\n\n⚠️ 분개를 반영했으나 차·대가 맞지 않습니다. 금액을 확인해 주세요.';
        }
      } else if (warnings.length > 0 && !data.apply) {
        reply += `\n\n⚠️ ${warnings.join(' · ')}`;
      }

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: reply,
        applied,
        warnings,
      }]);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : '오류가 발생했습니다.';
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `⚠️ ${errMsg}`,
      }]);
    } finally {
      setLoading(false);
    }
  }, [loading, storeId, readOnly, messages, context, onApply]);

  return (
    <div className="mt-4 border border-slate-600/60 rounded-lg overflow-hidden bg-[#0a1018]">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-[#132238] hover:bg-[#1a2d4a] transition-colors"
      >
        <span className="inline-flex items-center gap-2 text-xs font-medium text-teal-300">
          <Bot className="w-4 h-4 text-teal-400" />
          AI 전표 입력
          <Sparkles className="w-3 h-3 text-teal-500/80" />
        </span>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronUp className="w-4 h-4 text-slate-400" />
        )}
      </button>

      {expanded && (
        <div className="flex flex-col h-[min(360px,45vh)]">
          <div className="flex gap-1.5 px-2 py-2 overflow-x-auto border-b border-slate-700/50 shrink-0">
            {QUICK_PROMPTS.map(q => (
              <button
                key={q}
                type="button"
                disabled={loading || readOnly || !storeId}
                onClick={() => void send(q)}
                className="shrink-0 px-2 py-1 rounded-full text-[10px] bg-slate-800 text-slate-300 hover:bg-teal-900/40 hover:text-teal-200 disabled:opacity-40"
              >
                {q}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 min-h-0">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[92%] rounded-lg px-2.5 py-2 text-[11px] leading-relaxed ${
                  m.role === 'user'
                    ? 'ml-auto bg-teal-800/30 text-teal-50 border border-teal-700/30'
                    : m.applied
                      ? 'bg-teal-950/40 text-slate-100 border border-teal-700/40'
                      : 'bg-slate-900/80 text-slate-200 border border-slate-700/50'
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{m.content}</p>
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-slate-500 text-[10px] px-1">
                <Loader2 className="w-3 h-3 animate-spin text-teal-400" />
                분개 생성 중…
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {readOnly ? (
            <p className="px-3 py-2 text-[10px] text-slate-500 border-t border-slate-700/50">
              작성중(초안) 상태에서만 AI 입력을 사용할 수 있습니다.
            </p>
          ) : (
            <form
              className="flex gap-2 p-2.5 border-t border-slate-700/50 shrink-0"
              onSubmit={e => {
                e.preventDefault();
                void send(input);
              }}
            >
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                disabled={loading || !storeId}
                placeholder='예: "ABC식자재 110000원 외상매입"'
                className="flex-1 rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-[11px] text-white placeholder:text-slate-600 focus:outline-none focus:border-teal-600 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={loading || !input.trim() || !storeId}
                className="rounded-lg bg-teal-700 hover:bg-teal-600 px-3 py-2 text-white disabled:opacity-40 shrink-0"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
