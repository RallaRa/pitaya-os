'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Bot, ChevronDown, ChevronUp, Send, X, Zap, AlertTriangle, Database } from 'lucide-react';
import { getAuthHeaders } from '@/lib/getAuthHeaders';

export type PurchasePage =
  | 'register'
  | 'ledger'
  | 'by-supplier'
  | 'prices'
  | 'trace-ledger'
  | 'trace-numbers';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  badges?: ('data' | 'estimate' | 'warning')[];
}

interface AIPurchasePanelProps {
  currentPage: PurchasePage;
  currentData?: any;
  selectedItems?: any[];
  filters?: any;
}

const PAGE_LABELS: Record<PurchasePage, string> = {
  register: '매입 등록',
  ledger: '매입 원장',
  'by-supplier': '거래처별 매입',
  prices: '품목별 단가',
  'trace-ledger': '거래내역서',
  'trace-numbers': '이력번호 관리',
};

const QUICK_BTNS: Record<PurchasePage, string[]> = {
  register: ['단가 적정한가?', '누락 항목?', '이력번호 확인'],
  ledger: ['이상거래 찾아줘', '거래처 편중 분석', '트렌드 해석'],
  'by-supplier': ['외상 위험 분석', '단가 적정성', '거래처 비교'],
  prices: ['시세 대비 분석', '마진 위험 품목', '발주 타이밍'],
  'trace-ledger': ['누락 항목 찾아줘', '이력번호 검증', '법정 요건 확인'],
  'trace-numbers': ['이상 패턴 탐지', '미확인 이력 확인', '통계 요약'],
};

function parseBadges(text: string): ('data' | 'estimate' | 'warning')[] {
  const badges: ('data' | 'estimate' | 'warning')[] = [];
  if (text.includes('[데이터 기반]')) badges.push('data');
  if (text.includes('[추정]')) badges.push('estimate');
  if (text.includes('[주의]')) badges.push('warning');
  return badges;
}

function buildContextSummary(page: PurchasePage, data: any): string {
  if (!data) return '데이터 없음';
  try {
    if (page === 'ledger') {
      const total = data.records?.reduce((s: number, r: any) => s + (r.totalAmount || 0), 0) || 0;
      const suppliers = new Set(data.records?.map((r: any) => r.supplierName)).size || 0;
      return `${data.period || ''} | 거래처 ${suppliers}곳 | 총매입 ${total.toLocaleString()}원`;
    }
    if (page === 'by-supplier') {
      return `거래처 ${data.suppliers?.length || 0}곳 조회 중`;
    }
    if (page === 'prices') {
      return `품목 ${data.items?.length || 0}개 단가 현황`;
    }
    if (page === 'register') {
      const items = data.items?.length || 0;
      return items > 0 ? `인식 품목 ${items}개 | 합계 ${(data.summary?.totalAmount || 0).toLocaleString()}원` : 'OCR 대기 중';
    }
    if (page === 'trace-ledger') {
      return `이력 기록 ${data.records?.length || 0}건`;
    }
    if (page === 'trace-numbers') {
      return `이력번호 ${data.records?.length || 0}건`;
    }
  } catch { /* ignore */ }
  return '분석 준비 중';
}

export default function AIPurchasePanel({ currentPage, currentData, selectedItems, filters }: AIPurchasePanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: `안녕하세요! ${PAGE_LABELS[currentPage]} 화면에서 도움드리겠습니다. 궁금한 점이나 분석이 필요한 내용을 말씀해 주세요.`,
    },
  ]);
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef  = useRef<AbortController | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Message = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    const assistantMsg: Message = { role: 'assistant', content: '' };
    setMessages(prev => [...prev, assistantMsg]);

    try {
      const headers = await getAuthHeaders();
      abortRef.current = new AbortController();

      const res = await fetch('/api/purchases/ai-panel', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: {
            currentPage,
            currentData: currentData || {},
            selectedItems,
            filters,
          },
          message: text,
          history: messages.slice(-6).map(m => ({ role: m.role, content: m.content })),
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) throw new Error('API 오류');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') break;
          try {
            const parsed = JSON.parse(raw);
            const delta = parsed.choices?.[0]?.delta?.content || '';
            full += delta;
            setMessages(prev => {
              const next = [...prev];
              next[next.length - 1] = {
                role: 'assistant',
                content: full,
                badges: parseBadges(full),
              };
              return next;
            });
          } catch { /* skip */ }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setMessages(prev => {
          const next = [...prev];
          next[next.length - 1] = { role: 'assistant', content: '⚠️ 오류가 발생했습니다. 다시 시도해 주세요.' };
          return next;
        });
      }
    } finally {
      setLoading(false);
    }
  }, [loading, messages, currentPage, currentData, selectedItems, filters]);

  const contextSummary = buildContextSummary(currentPage, currentData);

  /* ── 데스크탑 패널 ── */
  const panelContent = (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-700/60 shrink-0">
        <Bot className="w-4 h-4 text-teal-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-teal-300">AI 매입 어드바이저</p>
          <p className="text-[10px] text-slate-500 truncate">{PAGE_LABELS[currentPage]} 분석 중</p>
        </div>
        <button
          onClick={() => setCollapsed(c => !c)}
          className="text-slate-500 hover:text-slate-300 transition-colors p-0.5"
        >
          {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
      </div>

      {!collapsed && (
        <>
          {/* 컨텍스트 카드 */}
          <div className="px-3 py-2 bg-slate-800/40 border-b border-slate-700/40 shrink-0">
            <p className="text-[10px] text-slate-500 truncate">{contextSummary}</p>
          </div>

          {/* 대화 영역 */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[90%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-teal-600/30 text-teal-100'
                    : 'bg-slate-800 text-slate-200'
                }`}>
                  {msg.badges && msg.badges.length > 0 && (
                    <div className="flex gap-1 mb-1 flex-wrap">
                      {msg.badges.includes('data') && (
                        <span className="flex items-center gap-0.5 text-[9px] bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded-full border border-blue-500/30">
                          <Database className="w-2.5 h-2.5" />데이터 기반
                        </span>
                      )}
                      {msg.badges.includes('estimate') && (
                        <span className="flex items-center gap-0.5 text-[9px] bg-slate-600/40 text-slate-400 px-1.5 py-0.5 rounded-full border border-slate-600/40">
                          <Zap className="w-2.5 h-2.5" />추정
                        </span>
                      )}
                      {msg.badges.includes('warning') && (
                        <span className="flex items-center gap-0.5 text-[9px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded-full border border-amber-500/30">
                          <AlertTriangle className="w-2.5 h-2.5" />주의
                        </span>
                      )}
                    </div>
                  )}
                  <p className="whitespace-pre-wrap break-words">
                    {msg.content}
                    {loading && i === messages.length - 1 && msg.role === 'assistant' && !msg.content && (
                      <span className="inline-flex gap-0.5 ml-1">
                        <span className="w-1 h-1 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1 h-1 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1 h-1 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </span>
                    )}
                  </p>
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* 퀵버튼 */}
          <div className="px-3 py-2 border-t border-slate-700/40 shrink-0">
            <div className="flex gap-1.5 flex-wrap">
              {QUICK_BTNS[currentPage].map(q => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  disabled={loading}
                  className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 px-2 py-1 rounded-lg border border-slate-700/50 transition-colors disabled:opacity-40"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* 입력 영역 */}
          <div className="px-3 pb-3 shrink-0">
            <div className="flex gap-2 mt-2">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
                placeholder="질문 입력..."
                disabled={loading}
                className="flex-1 bg-slate-800 border border-slate-700/60 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-teal-500/50 disabled:opacity-50"
              />
              <button
                onClick={() => send(input)}
                disabled={loading || !input.trim()}
                className="bg-teal-600 hover:bg-teal-500 disabled:bg-slate-700 text-white px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );

  return (
    <>
      {/* 데스크탑: 우측 고정 패널 */}
      <div className="hidden md:flex flex-col w-80 bg-slate-900 border-l border-slate-800/60 h-full">
        {panelContent}
      </div>

      {/* 모바일: 하단 슬라이드업 */}
      <div className="md:hidden">
        <button
          onClick={() => setMobileOpen(true)}
          className="fixed bottom-20 right-4 z-30 bg-teal-600 hover:bg-teal-500 text-white rounded-full p-3 shadow-lg transition-colors"
        >
          <Bot className="w-5 h-5" />
        </button>
        {mobileOpen && (
          <div className="fixed inset-0 z-40 flex flex-col justify-end">
            <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
            <div className="relative bg-slate-900 rounded-t-2xl border-t border-slate-700 h-[70vh] flex flex-col z-10">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/60 shrink-0">
                <div className="flex items-center gap-2">
                  <Bot className="w-4 h-4 text-teal-400" />
                  <p className="text-sm font-semibold text-teal-300">AI 매입 어드바이저</p>
                </div>
                <button onClick={() => setMobileOpen(false)} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-hidden flex flex-col">{panelContent}</div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
