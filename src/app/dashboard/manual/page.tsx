'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  BookOpen, Bot, User, Send, Loader2, Home, ChevronRight, List,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useStore } from '@/context/StoreContext';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import WikiMarkdown, { WikiRelatedLink } from '@/components/wiki/WikiMarkdown';
import { renderWikiLinkedText, extractWikiSlugs } from '@/lib/wiki/parseWikiLinks';
import type { WikiDoc } from '@/lib/wiki/types';

interface ChatMessage {
  role: 'user' | 'model';
  content: string;
  timestamp: string;
  usedModel?: string;
}

const SUGGESTED = [
  '오전 마감 보고서는 어떻게 확인해?',
  '쇼케이스 위생 점검 순서 알려줘',
  '한우 세일 알림은 어떻게 보내?',
  '공개 주문 들어오면 뭐부터 해?',
];

export default function ManualPage() {
  const { user } = useAuth();
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId;

  const [docs, setDocs] = useState<WikiDoc[]>([]);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [showDocList, setShowDocList] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const slugTitleMap = useMemo(
    () => Object.fromEntries(docs.map(d => [d.slug, d.title])),
    [docs],
  );

  const activeDoc = useMemo(
    () => docs.find(d => d.slug === activeSlug) ?? docs[0] ?? null,
    [docs, activeSlug],
  );

  const loadDocs = useCallback(async () => {
    if (!storeId || !user) return;
    setLoadingDocs(true);
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch(`/api/wiki?storeId=${encodeURIComponent(storeId)}`, { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'load failed');
      setDocs(data.docs || []);
      setActiveSlug(prev => {
        if (prev && data.docs?.some((d: WikiDoc) => d.slug === prev)) return prev;
        return data.docs?.[0]?.slug ?? null;
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingDocs(false);
    }
  }, [storeId, user]);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const openSlug = useCallback((slug: string) => {
    setActiveSlug(slug);
    setShowDocList(false);
  }, []);

  const sendMessage = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || !storeId || sending) return;

    setInput('');
    setSendError(null);
    const userMsg: ChatMessage = {
      role: 'user',
      content: msg,
      timestamp: new Date().toISOString(),
    };
    setMessages(m => [...m, userMsg]);
    setSending(true);

    try {
      const headers = await getAuthJsonHeaders();
      const history = [...messages, userMsg].map(m => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch('/api/ai', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: msg,
          storeId,
          model: 'auto',
          chatMode: 'chat',
          wikiMode: true,
          history: history.slice(0, -1),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI 오류');

      const reply = data.reply || data.text || data.message || '답변을 받지 못했습니다.';
      setMessages(m => [
        ...m,
        {
          role: 'model',
          content: reply,
          timestamp: new Date().toISOString(),
          usedModel: data.usedModel,
        },
      ]);

      const linked = extractWikiSlugs(reply);
      const firstKnown = linked.find(s => slugTitleMap[s] || docs.some(d => d.slug === s));
      if (firstKnown) setActiveSlug(firstKnown);
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : '전송 실패';
      setSendError(errMsg);
    } finally {
      setSending(false);
    }
  };

  const categories = useMemo(() => {
    const map = new Map<string, WikiDoc[]>();
    for (const d of docs) {
      const list = map.get(d.category) || [];
      list.push(d);
      map.set(d.category, list);
    }
    return [...map.entries()];
  }, [docs]);

  return (
    <div className="flex flex-col h-[calc(100vh-0px)] md:h-screen bg-slate-950">
      {/* 헤더 */}
      <header className="shrink-0 border-b border-slate-800 bg-slate-900 px-4 py-3 flex items-center gap-3">
        <Link href="/dashboard" className="text-slate-500 hover:text-teal-400" title="홈">
          <Home className="w-4 h-4" />
        </Link>
        <BookOpen className="w-5 h-5 text-amber-400" />
        <div className="flex-1 min-w-0">
          <h1 className="text-white font-bold text-sm truncate">AI 매장 백과</h1>
          <p className="text-slate-500 text-xs truncate">
            {currentStore?.storeName || '매장'} · Pitaya OS 사용법 위키
          </p>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 flex-col lg:flex-row">
        {/* 좌: AI 채팅 40% */}
        <section className="flex flex-col min-h-0 border-b lg:border-b-0 lg:border-r border-slate-800 lg:w-[40%]">
          <div className="px-4 py-2 border-b border-slate-800/80 flex items-center gap-2">
            <Bot className="w-4 h-4 text-teal-400" />
            <span className="text-xs font-semibold text-slate-300">AI 안내</span>
            <span className="text-[10px] text-slate-500">답변에 [[문서]] 링크 포함</span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center py-8">
                <BookOpen className="w-12 h-12 text-amber-400/20 mx-auto mb-3" />
                <p className="text-slate-400 text-sm mb-4">
                  Pitaya OS 메뉴·업무 절차를 물어보세요.<br />
                  오른쪽 백과 문서와 연결됩니다.
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {SUGGESTED.map(q => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => sendMessage(q)}
                      className="text-xs px-3 py-1.5 rounded-full bg-slate-800 text-slate-300 hover:bg-teal-600/20 hover:text-teal-300 border border-slate-700"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'model' && (
                  <div className="w-7 h-7 rounded-full bg-teal-600 flex items-center justify-center shrink-0">
                    <Bot className="w-3.5 h-3.5 text-white" />
                  </div>
                )}
                <div
                  className={`max-w-[90%] px-3 py-2 rounded-xl text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white rounded-tr-sm'
                      : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-tl-sm'
                  }`}
                >
                  <div className="whitespace-pre-wrap">
                    {msg.role === 'model'
                      ? renderWikiLinkedText(msg.content, openSlug, slugTitleMap)
                      : msg.content}
                  </div>
                  {msg.usedModel && (
                    <p className="text-[10px] mt-1 opacity-60">{msg.usedModel}</p>
                  )}
                </div>
                {msg.role === 'user' && (
                  <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
                    <User className="w-3.5 h-3.5 text-white" />
                  </div>
                )}
              </div>
            ))}

            {sending && (
              <div className="flex items-center gap-2 text-slate-500 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                답변 생성 중…
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {sendError && (
            <p className="px-4 text-red-400 text-xs">{sendError}</p>
          )}

          <form
            className="p-3 border-t border-slate-800 flex gap-2"
            onSubmit={e => { e.preventDefault(); sendMessage(); }}
          >
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="예: 위생일지 저장 방법"
              className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              disabled={sending || !storeId}
            />
            <button
              type="submit"
              disabled={sending || !input.trim() || !storeId}
              className="p-2 rounded-xl bg-teal-600 text-white disabled:opacity-40 hover:bg-teal-500"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
        </section>

        {/* 우: 위키 60% */}
        <section className="flex flex-col min-h-0 lg:w-[60%] bg-slate-900/50">
          <div className="px-4 py-2 border-b border-slate-800 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowDocList(!showDocList)}
              className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:bg-slate-800"
            >
              <List className="w-4 h-4" />
            </button>
            <span className="text-xs font-semibold text-amber-400/90">백과 문서</span>
            {activeDoc && (
              <span className="text-xs text-slate-400 truncate flex-1">{activeDoc.title}</span>
            )}
            {activeDoc?.relatedPath && (
              <Link
                href={activeDoc.relatedPath}
                className="text-[10px] text-teal-400 hover:text-teal-300 flex items-center gap-0.5 shrink-0"
              >
                메뉴 이동 <ChevronRight className="w-3 h-3" />
              </Link>
            )}
          </div>

          <div className="flex flex-1 min-h-0">
            {/* 문서 목록 */}
            <aside
              className={`
                ${showDocList ? 'flex' : 'hidden'} lg:flex
                flex-col w-48 shrink-0 border-r border-slate-800 overflow-y-auto
              `}
            >
              {loadingDocs ? (
                <p className="p-4 text-slate-500 text-xs">불러오는 중…</p>
              ) : (
                categories.map(([cat, items]) => (
                  <div key={cat} className="mb-2">
                    <p className="px-3 py-1 text-[10px] font-bold text-slate-500 uppercase">{cat}</p>
                    {items.map(d => (
                      <button
                        key={d.slug}
                        type="button"
                        onClick={() => openSlug(d.slug)}
                        className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                          activeDoc?.slug === d.slug
                            ? 'bg-amber-500/15 text-amber-200 font-semibold'
                            : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                        }`}
                      >
                        {d.title}
                      </button>
                    ))}
                  </div>
                ))
              )}
            </aside>

            {/* 본문 */}
            <div className="flex-1 overflow-y-auto p-5">
              {loadingDocs ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="w-8 h-8 animate-spin text-slate-600" />
                </div>
              ) : activeDoc ? (
                <>
                  <WikiMarkdown
                    content={activeDoc.content}
                    onWikiLink={openSlug}
                    slugTitleMap={slugTitleMap}
                  />
                  {activeDoc.relatedPath && (
                    <WikiRelatedLink
                      href={activeDoc.relatedPath}
                      label={activeDoc.title}
                    />
                  )}
                </>
              ) : (
                <p className="text-slate-500 text-sm text-center py-12">
                  문서가 없습니다. 관리자에게 시드 등록을 요청하세요.
                </p>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
