'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useStore } from '@/context/StoreContext';
import {
  Bot, User, Send, Plus, Trash2,
  Loader2, MessageSquare, ChevronLeft,
  Edit2, Check, X, AlertCircle, Home, Swords,
} from 'lucide-react';
import { getAuthHeaders, getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import type { DebateEntry } from '@/app/api/ai/route';

// ── 모델 정의 ──────────────────────────────────────────────────────
const MODELS = [
  {
    id:          'auto',
    name:        '자동선택',
    subName:     'Groq 분석',
    emoji:       '🎯',
    color:       'teal',
    activeCls:   'bg-teal-600 text-white border-teal-600',
    inactiveCls: 'bg-slate-800 text-teal-400 border-teal-500/30 hover:bg-teal-500/10',
    badgeCls:    'bg-teal-500/20 text-teal-400 border-teal-500/30',
  },
  {
    id:          'gemini',
    name:        'Gemini',
    subName:     '2.5 Flash',
    emoji:       '⚡',
    color:       'blue',
    activeCls:   'bg-blue-600 text-white border-blue-600',
    inactiveCls: 'bg-slate-800 text-blue-400 border-blue-500/30 hover:bg-blue-500/10',
    badgeCls:    'bg-blue-500/20 text-blue-400 border-blue-500/30',
  },
  {
    id:          'claude',
    name:        'Claude',
    subName:     'Sonnet 4.6',
    emoji:       '🧠',
    color:       'purple',
    activeCls:   'bg-purple-600 text-white border-purple-600',
    inactiveCls: 'bg-slate-800 text-purple-400 border-purple-500/30 hover:bg-purple-500/10',
    badgeCls:    'bg-purple-500/20 text-purple-400 border-purple-500/30',
  },
  {
    id:          'gpt',
    name:        'GPT-4o',
    subName:     'OpenAI',
    emoji:       '👔',
    color:       'green',
    activeCls:   'bg-green-600 text-white border-green-600',
    inactiveCls: 'bg-slate-800 text-green-400 border-green-500/30 hover:bg-green-500/10',
    badgeCls:    'bg-green-500/20 text-green-400 border-green-500/30',
  },
  {
    id:          'groq',
    name:        'Groq',
    subName:     'Llama3 70B',
    emoji:       '🟠',
    color:       'orange',
    activeCls:   'bg-orange-600 text-white border-orange-600',
    inactiveCls: 'bg-slate-800 text-orange-400 border-orange-500/30 hover:bg-orange-500/10',
    badgeCls:    'bg-orange-500/20 text-orange-400 border-orange-500/30',
  },
] as const;

type ModelId = typeof MODELS[number]['id'];

// usedModel 문자열 → badge 스타일 맵
const MODEL_BY_NAME: Record<string, typeof MODELS[number]> = {
  'Gemini 2.5 Flash':  MODELS[1],
  'Claude Sonnet 4.6': MODELS[2],
  'GPT-4o':            MODELS[3],
  'Groq Llama3 70B':   MODELS[4],
  'Groq Llama3 8B':    MODELS[4],
};

const DEBATE_COLORS: Record<string, { border: string; header: string; badge: string }> = {
  gemini: { border: 'border-blue-500/40',   header: 'text-blue-400',   badge: 'bg-blue-500/20 text-blue-300' },
  claude: { border: 'border-purple-500/40', header: 'text-purple-400', badge: 'bg-purple-500/20 text-purple-300' },
  gpt:    { border: 'border-green-500/40',  header: 'text-green-400',  badge: 'bg-green-500/20 text-green-300' },
  groq:   { border: 'border-orange-500/40', header: 'text-orange-400', badge: 'bg-orange-500/20 text-orange-300' },
};

// ── 타입 ────────────────────────────────────────────────────────────
interface Message {
  role: 'user' | 'model';
  content: string;
  timestamp: string;
  usedModel?: string;
  isAuto?: boolean;
  autoSelectedBy?: string;
  debate?: DebateEntry[];
}

interface Conversation {
  id: string;
  storeId: string;
  uid: string;
  title: string;
  messages: Message[];
  updatedAt: any;
}

function normalizeMsg(msg: any): Message {
  return {
    role:            msg.role === 'ai' ? 'model' : (msg.role || 'model'),
    content:         msg.content || msg.text || '',
    timestamp:       msg.timestamp || msg.createdAt || new Date().toISOString(),
    usedModel:       msg.usedModel,
    isAuto:          msg.isAuto,
    autoSelectedBy:  msg.autoSelectedBy,
    debate:          msg.debate,
  };
}

function toDate(val: any): Date {
  if (!val) return new Date(0);
  if (typeof val.toDate === 'function') return val.toDate();
  if (val._seconds !== undefined) return new Date(val._seconds * 1000);
  return new Date(val);
}

// ── 토론 카드 컴포넌트 ───────────────────────────────────────────────
function DebateCards({ entries }: { entries: DebateEntry[] }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  return (
    <div className="mt-3 w-full">
      <div className="flex items-center gap-2 mb-3">
        <Swords className="w-4 h-4 text-yellow-400" />
        <span className="text-yellow-400 text-xs font-bold uppercase tracking-wider">4AI 복합 토론</span>
        <span className="text-slate-500 text-xs">— {entries.length}개 AI 동시 답변</span>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {entries.map((entry) => {
          const colors = DEBATE_COLORS[entry.model] ?? { border: 'border-slate-600', header: 'text-slate-300', badge: 'bg-slate-700 text-slate-300' };
          const isExpanded = expanded[entry.model] ?? true;
          const preview = entry.text.slice(0, 120);
          const needsExpand = entry.text.length > 120;

          return (
            <div
              key={entry.model}
              className={`bg-slate-900 border ${colors.border} rounded-xl overflow-hidden`}
            >
              <div className={`flex items-center justify-between px-4 py-2.5 bg-slate-800/60`}>
                <div className="flex items-center gap-2">
                  <span className="text-base">{entry.emoji}</span>
                  <span className={`font-semibold text-sm ${colors.header}`}>{entry.name}</span>
                </div>
                {!entry.error && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${colors.badge}`}>
                    {entry.text ? `${entry.text.length}자` : '—'}
                  </span>
                )}
              </div>
              <div className="px-4 py-3">
                {entry.error ? (
                  <p className="text-red-400 text-xs flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {entry.error}
                  </p>
                ) : (
                  <>
                    <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
                      {isExpanded ? entry.text : preview + (needsExpand ? '...' : '')}
                    </p>
                    {needsExpand && (
                      <button
                        onClick={() => setExpanded(prev => ({ ...prev, [entry.model]: !isExpanded }))}
                        className="mt-2 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                      >
                        {isExpanded ? '접기 ▲' : '더 보기 ▼'}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 메인 컴포넌트 ────────────────────────────────────────────────────
export default function AiChatPage() {
  const { user }         = useAuth();
  const { currentStore } = useStore();

  const [conversations,  setConversations]  = useState<Conversation[]>([]);
  const [currentId,      setCurrentId]      = useState<string | null>(null);
  const [messages,       setMessages]       = useState<Message[]>([]);
  const [input,          setInput]          = useState('');
  const [isLoading,      setIsLoading]      = useState(false);
  const [isDebating,     setIsDebating]     = useState(false);
  const [isLoadingList,  setIsLoadingList]  = useState(true);
  const [showSidebar,    setShowSidebar]    = useState(true);
  const [editingId,      setEditingId]      = useState<string | null>(null);
  const [editTitle,      setEditTitle]      = useState('');
  const [selectedModel,  setSelectedModel]  = useState<ModelId>('auto');
  const [activeIds,      setActiveIds]      = useState<Set<string>>(new Set());
  const [sendError,      setSendError]      = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getAuthHeaders()
      .then(headers => fetch('/api/ai', { headers }))
      .then(r => r.json())
      .then(d => {
        if (d.models) {
          setActiveIds(new Set(d.models.filter((m: any) => m.active).map((m: any) => m.id)));
        }
      })
      .catch(() => {});
  }, []);

  const loadConversations = useCallback(async () => {
    if (!user?.uid) return;
    setIsLoadingList(true);
    try {
      const params = new URLSearchParams({ uid: user.uid });
      if (currentStore?.storeId) params.set('storeId', currentStore.storeId);
      const headers = await getAuthHeaders();
      const res  = await fetch(`/api/conversations?${params}`, { headers });
      const data = await res.json();
      setConversations(data.conversations || []);
    } finally {
      setIsLoadingList(false);
    }
  }, [user?.uid, currentStore?.storeId]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, isDebating]);

  const handleSelect = (conv: Conversation) => {
    setCurrentId(conv.id);
    setMessages((conv.messages || []).map(normalizeMsg));
    setSendError(null);
    setShowSidebar(false);
  };

  const handleNewChat = () => {
    setCurrentId(null);
    setMessages([]);
    setInput('');
    setSendError(null);
    setShowSidebar(false);
  };

  // ── 공통 대화 저장 ──
  const saveConversation = async (finalMessages: Message[], title: string) => {
    const saveRes = await fetch('/api/conversations', {
      method:  'POST',
      headers: await getAuthJsonHeaders(),
      body:    JSON.stringify({
        ...(currentId ? { conversationId: currentId } : { title }),
        uid:      user?.uid,
        storeId:  currentStore?.storeId || '',
        messages: finalMessages,
      }),
    });
    const saveData = await saveRes.json();
    if (saveData.id && !currentId) setCurrentId(saveData.id);
    await loadConversations();
  };

  // ── 일반 메시지 전송 ──
  const handleSend = async () => {
    if (!input.trim() || isLoading || isDebating) return;
    setSendError(null);

    const modelInfo = MODELS.find(m => m.id === selectedModel) ?? MODELS[0];

    const userMsg: Message = {
      role:      'user',
      content:   input.trim(),
      timestamp: new Date().toISOString(),
    };

    const historyForAI = [...messages];
    const newMessages  = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const endpoint = selectedModel === 'auto' ? '/api/ai' : `/api/ai/${selectedModel}`;
      const res = await fetch(endpoint, {
        method:  'POST',
        headers: await getAuthJsonHeaders(),
        body:    JSON.stringify({
          message: userMsg.content,
          history: historyForAI,
          model:   selectedModel,
        }),
      });

      const data = await res.json();

      if (data.error && data.error !== 'api_key_missing') {
        setSendError(`${modelInfo.name} 오류: ${data.error}`);
        setMessages(historyForAI);
        setInput(userMsg.content);
        return;
      }

      const aiMsg: Message = {
        role:           'model',
        content:        data.text || '응답을 받지 못했습니다.',
        timestamp:      new Date().toISOString(),
        usedModel:      data.usedModel || modelInfo.name,
        isAuto:         data.isAuto,
        autoSelectedBy: data.autoSelectedBy,
      };

      const finalMessages = [...newMessages, aiMsg];
      setMessages(finalMessages);

      const title = userMsg.content.slice(0, 20) + (userMsg.content.length > 20 ? '...' : '');
      await saveConversation(finalMessages, title);

    } catch (e: any) {
      setSendError(`네트워크 오류: ${e.message}`);
      setMessages(historyForAI);
      setInput(userMsg.content);
    } finally {
      setIsLoading(false);
    }
  };

  // ── 4AI 토론 ──
  const handleDebate = async () => {
    if (!input.trim() || isLoading || isDebating) return;
    setSendError(null);

    const userMsg: Message = {
      role:      'user',
      content:   input.trim(),
      timestamp: new Date().toISOString(),
    };

    const historyForAI = [...messages];
    const newMessages  = [...messages, userMsg];
    setMessages(newMessages);
    const savedInput = input.trim();
    setInput('');
    setIsDebating(true);

    try {
      const res = await fetch('/api/ai', {
        method:  'POST',
        headers: await getAuthJsonHeaders(),
        body:    JSON.stringify({
          message: userMsg.content,
          history: historyForAI,
          model:   'debate',
        }),
      });

      const data = await res.json();

      const aiMsg: Message = {
        role:      'model',
        content:   '4개 AI의 답변을 비교합니다:',
        timestamp: new Date().toISOString(),
        usedModel: '4AI 토론',
        debate:    data.debate || [],
      };

      const finalMessages = [...newMessages, aiMsg];
      setMessages(finalMessages);

      const title = `[토론] ${userMsg.content.slice(0, 16)}...`;
      await saveConversation(finalMessages, title);

    } catch (e: any) {
      setSendError(`토론 오류: ${e.message}`);
      setMessages(historyForAI);
      setInput(savedInput);
    } finally {
      setIsDebating(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('이 대화를 삭제하시겠습니까?')) return;
    await fetch(`/api/conversations?id=${id}`, { method: 'DELETE', headers: await getAuthHeaders() });
    if (currentId === id) { setCurrentId(null); setMessages([]); setSendError(null); }
    await loadConversations();
  };

  const handleRenameStart = (conv: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(conv.id);
    setEditTitle(conv.title);
  };

  const handleRenameSave = async (id: string) => {
    const conv = conversations.find(c => c.id === id);
    await fetch('/api/conversations', {
      method:  'POST',
      headers: await getAuthJsonHeaders(),
      body:    JSON.stringify({
        conversationId: id,
        uid:            user?.uid,
        storeId:        currentStore?.storeId || '',
        title:          editTitle,
        messages:       conv?.messages || [],
      }),
    });
    setEditingId(null);
    await loadConversations();
  };

  const groupByDate = (convs: Conversation[]) => {
    const today     = new Date();
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    const weekAgo   = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);
    const ts = (c: Conversation) => toDate(c.updatedAt);
    return {
      '오늘':    convs.filter(c => ts(c).toDateString() === today.toDateString()),
      '어제':    convs.filter(c => ts(c).toDateString() === yesterday.toDateString()),
      '이번 주': convs.filter(c => {
        const d = ts(c);
        return d > weekAgo
          && d.toDateString() !== today.toDateString()
          && d.toDateString() !== yesterday.toDateString();
      }),
      '이전':    convs.filter(c => ts(c) <= weekAgo),
    };
  };

  const grouped = groupByDate(conversations);
  const isWorking = isLoading || isDebating;

  return (
    <div className="flex h-[calc(100vh-2rem)] bg-slate-950 rounded-xl overflow-hidden border border-slate-800">

      {/* ── 대화 목록 사이드바 ── */}
      <div className={`
        ${showSidebar ? 'w-72' : 'w-0 md:w-72'}
        flex-shrink-0 bg-slate-900 border-r border-slate-700
        flex flex-col transition-all duration-200 overflow-hidden
      `}>
        <div className="p-3 border-b border-slate-700">
          <button
            onClick={handleNewChat}
            className="w-full flex items-center gap-2 bg-teal-600 hover:bg-teal-500 text-white px-4 py-2.5 rounded-xl font-medium text-sm transition-colors"
          >
            <Plus className="w-4 h-4" />새 대화
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {isLoadingList ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 text-teal-400 animate-spin" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="text-center py-8">
              <MessageSquare className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="text-slate-500 text-sm">대화 기록이 없습니다.</p>
            </div>
          ) : (
            Object.entries(grouped).map(([group, convs]) =>
              convs.length > 0 && (
                <div key={group} className="mb-4">
                  <p className="text-slate-500 text-xs font-medium px-2 py-1 uppercase tracking-wider">{group}</p>
                  {convs.map(conv => (
                    <div
                      key={conv.id}
                      onClick={() => handleSelect(conv)}
                      className={`
                        group flex items-center gap-2 px-3 py-2
                        rounded-lg cursor-pointer transition-colors mb-0.5
                        ${currentId === conv.id ? 'bg-teal-600/20 text-teal-400' : 'hover:bg-slate-800 text-slate-300'}
                      `}
                    >
                      {editingId === conv.id ? (
                        <div className="flex-1 flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          <input
                            value={editTitle}
                            onChange={e => setEditTitle(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter')  handleRenameSave(conv.id);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                            className="flex-1 bg-slate-700 text-white text-sm px-2 py-1 rounded focus:outline-none focus:ring-1 focus:ring-teal-500"
                            autoFocus
                          />
                          <button onClick={() => handleRenameSave(conv.id)} className="text-teal-400 hover:text-teal-300">
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setEditingId(null)} className="text-slate-400 hover:text-slate-200">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <MessageSquare className="w-4 h-4 flex-shrink-0 opacity-60" />
                          <span className="flex-1 text-sm truncate">{conv.title}</span>
                          <div className="hidden group-hover:flex items-center gap-1">
                            <button onClick={e => handleRenameStart(conv, e)} className="p-1 hover:text-white text-slate-400 transition-colors">
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button onClick={e => handleDelete(conv.id, e)} className="p-1 hover:text-red-400 text-slate-400 transition-colors">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )
            )
          )}
        </div>
      </div>

      {/* ── 채팅 영역 ── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* 헤더 */}
        <div className="bg-slate-900 border-b border-slate-700 px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className="md:hidden text-slate-400 hover:text-white transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <Link href="/dashboard" className="p-1 text-slate-500 hover:text-teal-400 transition-colors rounded-lg hover:bg-slate-800 shrink-0" title="홈으로">
            <Home className="w-4 h-4" />
          </Link>
          <Bot className="w-5 h-5 text-teal-400" />
          <div>
            <h1 className="text-white font-bold text-sm">
              {currentId ? (conversations.find(c => c.id === currentId)?.title || 'AI 대화') : '새 대화'}
            </h1>
            <p className="text-slate-500 text-xs">Pitaya OS AI Assistant</p>
          </div>
        </div>

        {/* 메시지 목록 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Bot className="w-16 h-16 text-teal-400/30 mb-4" />
              <h2 className="text-white font-bold text-xl mb-2">무엇을 분석해 드릴까요?</h2>
              <p className="text-slate-500 text-sm max-w-sm leading-relaxed">
                Pitaya OS 전담 AI 분석가입니다.<br />
                <span className="text-slate-400">🎯 Groq가 질문 분석 후 최적 AI 자동 선택</span><br />
                <span className="text-slate-400">⚔️ 4AI 토론으로 다양한 관점 비교</span><br />
                <span className="text-slate-400">🔍 이력번호 축산물 자동 조회</span>
              </p>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex gap-3 ${msg.debate ? 'w-full max-w-4xl' : 'max-w-[75%]'} ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                  msg.role === 'user' ? 'bg-blue-600' : 'bg-teal-600'
                }`}>
                  {msg.role === 'user'
                    ? <User className="w-4 h-4 text-white" />
                    : <Bot  className="w-4 h-4 text-white" />
                  }
                </div>

                <div className="flex flex-col gap-1 min-w-0 flex-1">
                  {/* 말풍선 (토론은 헤더만, 개별 카드는 DebateCards에서) */}
                  {(!msg.debate || msg.debate.length === 0) && (
                    <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                      msg.role === 'user'
                        ? 'bg-blue-600 text-white rounded-tr-sm'
                        : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-tl-sm'
                    }`}>
                      {msg.content}
                      <p className={`text-xs mt-1 ${msg.role === 'user' ? 'text-blue-200' : 'text-slate-500'}`}>
                        {new Date(msg.timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  )}

                  {/* 토론 결과 카드 */}
                  {msg.debate && msg.debate.length > 0 && (
                    <DebateCards entries={msg.debate} />
                  )}

                  {/* 모델 배지 */}
                  {msg.role === 'model' && msg.usedModel && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {msg.usedModel === '4AI 토론' ? (
                        <span className="self-start text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                          ⚔️ 4AI 토론
                        </span>
                      ) : (() => {
                        const m = MODEL_BY_NAME[msg.usedModel];
                        return (
                          <span className={`self-start text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                            m ? m.badgeCls : 'bg-slate-700 text-slate-400 border-slate-600'
                          }`}>
                            {m?.emoji ?? '🤖'} {msg.usedModel}
                            {msg.isAuto && (
                              <span className="ml-1 opacity-60 font-normal">
                                {msg.autoSelectedBy === 'groq' ? '(Groq 선택)' : '(자동)'}
                              </span>
                            )}
                          </span>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* 로딩 인디케이터 */}
          {isWorking && (
            <div className="flex justify-start">
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-teal-600 flex items-center justify-center flex-shrink-0">
                  {isDebating
                    ? <Swords className="w-4 h-4 text-white" />
                    : <Bot    className="w-4 h-4 text-white" />
                  }
                </div>
                <div className="bg-slate-800 border border-slate-700 px-4 py-3 rounded-2xl rounded-tl-sm flex items-center gap-2">
                  {isDebating && (
                    <span className="text-yellow-400 text-xs font-medium mr-1">4개 AI 답변 수집 중...</span>
                  )}
                  <div className="flex gap-1">
                    {[0, 1, 2].map(i => (
                      <div
                        key={i}
                        className={`w-2 h-2 rounded-full animate-bounce ${isDebating ? 'bg-yellow-400' : 'bg-teal-400'}`}
                        style={{ animationDelay: `${i * 0.15}s` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 입력 영역 */}
        <div className="bg-slate-900 border-t border-slate-700 p-4 space-y-3">

          {/* 에러 배너 */}
          {sendError && (
            <div className="flex items-center gap-2 bg-red-900/30 border border-red-700/50 rounded-xl px-3 py-2 text-sm text-red-400">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="flex-1">{sendError}</span>
              <button onClick={() => setSendError(null)} className="text-red-400 hover:text-red-200 shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* 모델 선택 + 토론 버튼 */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {MODELS.map(m => {
              const isModelActive = m.id === 'auto'
                ? activeIds.size > 0
                : activeIds.size === 0 || activeIds.has(m.id);
              const isSelected = selectedModel === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => { if (isModelActive) setSelectedModel(m.id); }}
                  title={!isModelActive ? 'API 키 미설정' : `${m.name} ${m.subName}`}
                  disabled={!isModelActive}
                  className={`
                    flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold
                    border transition-all
                    ${isSelected ? m.activeCls : isModelActive ? m.inactiveCls : 'bg-slate-900 text-slate-600 border-slate-800 cursor-not-allowed opacity-40'}
                  `}
                >
                  <span>{m.emoji}</span>
                  <span>{m.name}</span>
                  <span className={`text-[10px] font-normal ${isSelected ? 'opacity-80' : 'opacity-60'}`}>{m.subName}</span>
                  {!isModelActive && <span className="text-[9px]">🔒</span>}
                </button>
              );
            })}

            {/* 구분선 */}
            <div className="w-px h-5 bg-slate-700 mx-1" />

            {/* 4AI 토론 버튼 */}
            <button
              onClick={handleDebate}
              disabled={isWorking || !input.trim()}
              title="4개 AI가 동시에 답변 — 다양한 관점 비교"
              className={`
                flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all
                ${isDebating
                  ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40 cursor-not-allowed'
                  : 'bg-slate-800 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/10 disabled:opacity-40 disabled:cursor-not-allowed'
                }
              `}
            >
              <Swords className="w-3 h-3" />
              <span>4AI 토론</span>
            </button>
          </div>

          {/* 텍스트 입력 */}
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="메시지를 입력하세요... (Enter 전송, Shift+Enter 줄바꿈)"
              rows={1}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 text-sm placeholder:text-slate-500 focus:outline-none focus:border-teal-500 transition-colors resize-none"
            />
            <button
              onClick={handleSend}
              disabled={isWorking || !input.trim()}
              className="bg-teal-600 hover:bg-teal-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white p-3 rounded-xl transition-colors flex-shrink-0"
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
