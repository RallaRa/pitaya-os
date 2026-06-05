'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useStore } from '@/context/StoreContext';
import {
  Bot, User, Send, Plus, Trash2,
  Loader2, MessageSquare,
  Edit2, Check, X, AlertCircle, Swords,
  PanelLeftOpen, PanelLeftClose,
} from 'lucide-react';
import { getAuthHeaders, getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import type { DebateEntry, DebateRoundResult } from '@/app/api/ai/route';

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
type ChatMode = 'chat' | 'debate' | 'analysis';

const CHAT_MODES: { id: ChatMode; label: string; desc: string }[] = [
  { id: 'chat',     label: '일반 대화', desc: 'Pitaya OS 사용법·매장 데이터 Q&A' },
  { id: 'debate',   label: '토론 모드', desc: '4개 AI가 3라운드 의견 교환 후 종합 답변' },
  { id: 'analysis', label: '분석 모드', desc: '매출·고객 데이터 심층 분석' },
];

const DEBATE_TOPICS = ['주말 영업 확대', '온라인 판매 확대', '직원 추가 채용'];

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
  debateRounds?: DebateRoundResult[];
  debateSummary?: string;
  debatePhase?: string;
  chatMode?: ChatMode;
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
    debateRounds:    msg.debateRounds,
    debateSummary:   msg.debateSummary,
    debatePhase:     msg.debatePhase,
    chatMode:        msg.chatMode,
  };
}

function toDate(val: any): Date {
  if (!val) return new Date(0);
  if (typeof val.toDate === 'function') return val.toDate();
  if (val._seconds !== undefined) return new Date(val._seconds * 1000);
  return new Date(val);
}

// ── 협업 토론 UI (3라운드 + 종합) ─────────────────────────────────────
function CollaborativeDebateView({
  rounds,
  summary,
}: {
  rounds: DebateRoundResult[];
  summary?: string;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  return (
    <div className="mt-3 w-full space-y-4">
      <div className="flex items-center gap-2">
        <Swords className="w-4 h-4 text-yellow-400" />
        <span className="text-yellow-400 text-xs font-bold uppercase tracking-wider">4AI 협업 토론</span>
        <span className="text-slate-500 text-xs">— 3라운드 의견 교환</span>
      </div>

      {rounds.map(round => (
        <div key={round.round} className="space-y-2">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{round.label}</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            {round.entries.map(entry => {
              const key = `${round.round}-${entry.model}`;
              const colors = DEBATE_COLORS[entry.model] ?? { border: 'border-slate-600', header: 'text-slate-300', badge: 'bg-slate-700 text-slate-300' };
              const isExpanded = expanded[key] ?? true;
              const preview = entry.text.slice(0, 120);
              const needsExpand = entry.text.length > 120;

              return (
                <div key={key} className={`bg-slate-900 border ${colors.border} rounded-xl overflow-hidden`}>
                  <div className="flex items-center justify-between px-3 py-2 bg-slate-800/60">
                    <div className="flex items-center gap-2">
                      <span>{entry.emoji}</span>
                      <span className={`font-semibold text-xs ${colors.header}`}>{entry.name}</span>
                    </div>
                  </div>
                  <div className="px-3 py-2.5">
                    {entry.error ? (
                      <p className="text-red-400 text-xs flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> {entry.error}
                      </p>
                    ) : (
                      <>
                        <p className="text-slate-300 text-xs leading-relaxed whitespace-pre-wrap">
                          {isExpanded ? entry.text : preview + (needsExpand ? '...' : '')}
                        </p>
                        {needsExpand && (
                          <button
                            onClick={() => setExpanded(prev => ({ ...prev, [key]: !isExpanded }))}
                            className="mt-1 text-[10px] text-slate-500 hover:text-slate-300"
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
      ))}

      {summary && (
        <div className="bg-amber-900/20 border border-amber-500/30 rounded-xl px-4 py-3">
          <p className="text-amber-400 text-[11px] font-bold mb-1.5">📋 최종 종합 의견</p>
          <p className="text-slate-200 text-sm leading-relaxed whitespace-pre-wrap">{summary}</p>
        </div>
      )}
    </div>
  );
}

// ── 레거시 단일 라운드 카드 (호환) ─────────────────────────────────────
function DebateCards({ entries }: { entries: DebateEntry[] }) {
  return <CollaborativeDebateView rounds={[{ round: 1, label: 'AI 의견', entries }]} />;
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
  const [showSidebar,    setShowSidebar]    = useState(false);
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const [editingId,      setEditingId]      = useState<string | null>(null);
  const [editTitle,      setEditTitle]      = useState('');
  const [selectedModel,  setSelectedModel]  = useState<ModelId>('auto');
  const [chatMode,       setChatMode]       = useState<ChatMode>('chat');
  const [activeIds,      setActiveIds]      = useState<Set<string>>(new Set());
  const [modelsLoaded,   setModelsLoaded]   = useState(false);
  const [sendError,      setSendError]      = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const apply = () => {
      const mobile = mq.matches;
      setIsMobileLayout(mobile);
      setShowSidebar(!mobile);
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    getAuthHeaders()
      .then(headers => fetch('/api/ai', { headers }))
      .then(r => r.json())
      .then(d => {
        if (d.models) {
          setActiveIds(new Set(d.models.filter((m: any) => m.active).map((m: any) => m.id)));
        }
      })
      .catch(() => {})
      .finally(() => setModelsLoaded(true));
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
    setChatMode('chat');
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

  // ── 4AI 협업 토론 (3라운드 + 종합) ──
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
          message:  userMsg.content,
          history:  historyForAI,
          model:    'debate',
          storeId:  currentStore?.storeId || '',
          chatMode: 'debate',
        }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || data.text || `API 오류 (${res.status})`);
      }
      if (!Array.isArray(data.debateRounds) || data.debateRounds.length === 0) {
        throw new Error('사용 가능한 AI 응답이 없습니다. API 키를 확인해주세요.');
      }

      const failed = (data.failedModels as { model: string; error: string }[] | undefined) ?? [];
      const okCount = (data.debate as DebateEntry[] | undefined)?.filter(e => e.text && !e.error).length ?? 0;

      const aiMsg: Message = {
        role:          'model',
        content:       data.debateSummary || data.text || '토론이 완료되었습니다.',
        timestamp:     new Date().toISOString(),
        usedModel:     '4AI 토론',
        debate:        data.debate,
        debateRounds:  data.debateRounds,
        debateSummary: data.debateSummary,
        chatMode:      'debate',
      };

      const finalMessages = [...newMessages, aiMsg];
      setMessages(finalMessages);

      if (failed.length > 0) {
        setSendError(`${failed.length}개 AI 응답 실패 (${failed.map(f => f.model).join(', ')}) — ${okCount}개 AI 의견 반영됨`);
      }

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

  // ── 일반 메시지 전송 ──
  const handleSend = async () => {
    if (!input.trim() || isLoading || isDebating) return;
    if (chatMode === 'debate') {
      return handleDebate();
    }
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
      const res = await fetch('/api/ai', {
        method:  'POST',
        headers: await getAuthJsonHeaders(),
        body:    JSON.stringify({
          message:  userMsg.content,
          history:  historyForAI,
          model:    selectedModel,
          storeId:  currentStore?.storeId || '',
          chatMode,
        }),
      });

      const data = await res.json();

      if (data.error || !res.ok) {
        const errMsg = data.error || data.text || `API 오류 (${res.status})`;
        setSendError(`${modelInfo.name} 오류: ${errMsg}`);
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
        chatMode,
      };

      const finalMessages = [...newMessages, aiMsg];
      setMessages(finalMessages);

      const modePrefix = chatMode === 'analysis' ? '[분석] ' : '';
      const title = modePrefix + userMsg.content.slice(0, 20) + (userMsg.content.length > 20 ? '...' : '');
      await saveConversation(finalMessages, title);

    } catch (e: any) {
      setSendError(`네트워크 오류: ${e.message}`);
      setMessages(historyForAI);
      setInput(userMsg.content);
    } finally {
      setIsLoading(false);
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
  const hasAnyAi = !modelsLoaded || activeIds.size > 0;
  const canSend = !isWorking && !!input.trim() && hasAnyAi;
  const isModelActive = (id: ModelId) => {
    if (!modelsLoaded) return true;
    if (id === 'auto') return activeIds.size > 0;
    return activeIds.has(id);
  };
  const activeMode = CHAT_MODES.find(m => m.id === chatMode)!;
  const inputPlaceholder =
    chatMode === 'debate'
      ? (messages.length === 0
        ? '토론 주제를 입력하세요 (예: 주말 영업 확대)'
        : '추가 의견 입력 (선택)')
      : chatMode === 'analysis'
        ? '매출·고객·매입 데이터 분석 질문을 입력하세요...'
        : '메시지를 입력하세요... (Enter 전송, Shift+Enter 줄바꿈)';

  return (
    <div className="flex flex-1 min-h-0 bg-slate-950 md:rounded-xl overflow-hidden md:border md:border-slate-800 relative">

      {/* 모바일: 목록 열릴 때 배경 딤 */}
      {isMobileLayout && showSidebar && (
        <button
          type="button"
          aria-label="대화 목록 닫기"
          className="absolute inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setShowSidebar(false)}
        />
      )}

      {/* ── 대화 목록 사이드바 ── */}
      <div
        className={`
          flex-shrink-0 bg-slate-900 border-r border-slate-700
          flex flex-col overflow-hidden z-50
          transition-all duration-200 ease-out
          ${isMobileLayout
            ? `absolute inset-y-0 left-0 w-[min(20rem,88vw)] shadow-2xl ${showSidebar ? 'translate-x-0' : '-translate-x-full'}`
            : `${showSidebar ? 'w-72' : 'w-0'}`
          }
        `}
      >
        <div className="p-3 border-b border-slate-700 flex items-center gap-2">
          {isMobileLayout && (
            <button
              type="button"
              onClick={() => setShowSidebar(false)}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 shrink-0"
              aria-label="대화 목록 닫기"
            >
              <PanelLeftClose className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={handleNewChat}
            className="flex-1 flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-500 text-white px-4 py-2.5 rounded-xl font-medium text-sm transition-colors"
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
        <div className="bg-slate-900 border-b border-slate-700 px-3 sm:px-4 py-3 flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setShowSidebar(v => !v)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
            aria-label={showSidebar ? '대화 목록 접기' : '대화 목록 펼치기'}
            title={showSidebar ? '대화 목록 접기' : '대화 목록 펼치기'}
          >
            {showSidebar
              ? <PanelLeftClose className="w-5 h-5" />
              : <PanelLeftOpen className="w-5 h-5" />}
            <span className="text-xs font-medium md:hidden">목록</span>
          </button>
          <Bot className="w-5 h-5 text-teal-400 shrink-0" />
          <div className="min-w-0 flex-1">
            <h1 className="text-white font-bold text-sm truncate">
              {currentId ? (conversations.find(c => c.id === currentId)?.title || 'AI 대화') : '새 대화'}
            </h1>
            <p className="text-slate-500 text-xs truncate">Pitaya OS AI Assistant</p>
          </div>
        </div>

        {/* 모드 탭 */}
        <div className="bg-slate-900/80 border-b border-slate-700 px-4 py-2">
          <div className="flex items-center gap-1">
            {CHAT_MODES.map(mode => (
              <button
                key={mode.id}
                type="button"
                onClick={() => { setChatMode(mode.id); setSendError(null); }}
                title={mode.desc}
                className={`
                  px-4 py-2 rounded-lg text-xs font-semibold transition-all
                  ${chatMode === mode.id
                    ? 'bg-teal-600 text-white ring-2 ring-teal-400/50 shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'}
                `}
              >
                {mode.label}
              </button>
            ))}
          </div>
          <p className="text-slate-500 text-[11px] mt-1">{activeMode.desc}</p>
        </div>

        {/* 메시지 목록 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Bot className="w-16 h-16 text-teal-400/30 mb-4" />
              <h2 className="text-white font-bold text-xl mb-2">
                {chatMode === 'debate' ? '어떤 주제로 토론할까요?' : chatMode === 'analysis' ? '무엇을 분석해 드릴까요?' : '무엇을 도와드릴까요?'}
              </h2>
              <p className="text-slate-500 text-sm max-w-sm leading-relaxed">
                {chatMode === 'debate' ? (
                  <>
                    4개 AI가 주제에 대해 3라운드 의견을 교환합니다.<br />
                    <span className="text-slate-400">1라운드: 초기 의견 → 2·3라운드: 서로 반응</span><br />
                    <span className="text-slate-400">📋 마지막에 종합 권고안 제공</span>
                  </>
                ) : chatMode === 'analysis' ? (
                  <>
                    Pitaya OS 매장 데이터 기반 심층 분석입니다.<br />
                    <span className="text-slate-400">📊 오늘/어제 매출, 고객 TOP5 자동 연동</span><br />
                    <span className="text-slate-400">🔒 조회만 가능, 데이터 수정 불가</span>
                  </>
                ) : (
                  <>
                    Pitaya OS 전담 AI 분석가입니다.<br />
                    <span className="text-slate-400">🎯 Groq가 질문 분석 후 최적 AI 자동 선택</span><br />
                    <span className="text-slate-400">📊 매장 매출·고객 데이터 자동 연동</span><br />
                    <span className="text-slate-400">🔍 이력번호 축산물 자동 조회</span>
                  </>
                )}
              </p>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex gap-2 sm:gap-3 w-full ${msg.role === 'user' ? 'flex-row-reverse justify-end' : ''}`}>
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                  msg.role === 'user' ? 'bg-blue-600' : 'bg-teal-600'
                }`}>
                  {msg.role === 'user'
                    ? <User className="w-4 h-4 text-white" />
                    : <Bot  className="w-4 h-4 text-white" />
                  }
                </div>

                <div className={`flex flex-col gap-1 min-w-0 flex-1 ${(msg.debateRounds?.length || msg.debate?.length) ? 'max-w-full' : 'max-w-[min(100%,42rem)]'}`}>
                  {/* 말풍선 (토론은 헤더만, 개별 카드는 DebateCards에서) */}
                  {(!msg.debateRounds?.length && (!msg.debate || msg.debate.length === 0)) && (
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

                  {msg.debateRounds && msg.debateRounds.length > 0 && (
                    <CollaborativeDebateView rounds={msg.debateRounds} summary={msg.debateSummary || msg.content} />
                  )}

                  {(!msg.debateRounds?.length) && msg.debate && msg.debate.length > 0 && (
                    <DebateCards entries={msg.debate} />
                  )}

                  {/* 모델 배지 */}
                  {msg.role === 'model' && (msg.usedModel || msg.debatePhase) && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {msg.debatePhase && (
                        <span className={`self-start text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                          msg.debatePhase === '찬성' ? 'bg-green-500/20 text-green-400 border-green-500/30'
                          : msg.debatePhase === '반대' ? 'bg-red-500/20 text-red-400 border-red-500/30'
                          : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                        }`}>
                          {msg.debatePhase === '찬성' ? '✅ 찬성' : msg.debatePhase === '반대' ? '❌ 반대' : '📋 종합'}
                        </span>
                      )}
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
                    <span className="text-yellow-400 text-xs font-medium mr-1">4AI 3라운드 토론 중... (30~90초)</span>
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

          {/* 텍스트 입력 (버튼보다 위 — 입력 후 버튼 활성화) */}
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
              placeholder={inputPlaceholder}
              rows={1}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 text-sm placeholder:text-slate-500 focus:outline-none focus:border-teal-500 transition-colors resize-none"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!canSend}
              title={chatMode === 'debate' ? '4AI 토론 시작' : '메시지 전송'}
              className={`disabled:bg-slate-700 disabled:cursor-not-allowed text-white p-3 rounded-xl transition-colors flex-shrink-0 ${
                chatMode === 'debate'
                  ? 'bg-yellow-600 hover:bg-yellow-500'
                  : 'bg-teal-600 hover:bg-teal-500'
              }`}
            >
              {isLoading
                ? <Loader2 className="w-5 h-5 animate-spin" />
                : chatMode === 'debate'
                  ? <Swords className="w-5 h-5" />
                  : <Send className="w-5 h-5" />}
            </button>
          </div>

          {/* 토론 모드: 빠른 주제 + 액션 버튼 */}
          {chatMode === 'debate' && (
            <div className="space-y-2">
              {messages.length === 0 && (
                <div className="flex flex-wrap gap-2">
                  {DEBATE_TOPICS.map(topic => (
                    <button
                      key={topic}
                      type="button"
                      onClick={() => setInput(topic)}
                      className="px-3 py-1.5 rounded-full text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700 hover:border-yellow-500/40 hover:text-yellow-300 transition-colors"
                    >
                      {topic}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleDebate}
                  disabled={!canSend}
                  title="4개 AI가 3라운드 의견 교환 후 종합 답변"
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold border transition-all ${
                    isDebating
                      ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40 cursor-not-allowed'
                      : 'bg-yellow-600/90 text-white border-yellow-500 hover:bg-yellow-500 disabled:opacity-40 disabled:cursor-not-allowed'
                  }`}
                >
                  <Swords className="w-3.5 h-3.5" />
                  4AI 토론 시작
                </button>
                {!input.trim() && (
                  <span className="text-[11px] text-slate-500">주제 입력 또는 위 예시 클릭 후 버튼 활성화</span>
                )}
              </div>
            </div>
          )}

          {/* 모델 선택 + 4AI 토론 (일반/분석 모드) */}
          {chatMode !== 'debate' && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {MODELS.map(m => {
              const modelActive = isModelActive(m.id);
              const isSelected = selectedModel === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => { if (modelActive) setSelectedModel(m.id); }}
                  title={!modelActive ? 'API 키 미설정' : `${m.name} ${m.subName}`}
                  disabled={!modelActive}
                  className={`
                    flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold
                    border transition-all
                    ${isSelected ? m.activeCls : modelActive ? m.inactiveCls : 'bg-slate-900 text-slate-600 border-slate-800 cursor-not-allowed opacity-40'}
                  `}
                >
                  <span>{m.emoji}</span>
                  <span>{m.name}</span>
                  <span className={`text-[10px] font-normal ${isSelected ? 'opacity-80' : 'opacity-60'}`}>{m.subName}</span>
                  {!modelActive && <span className="text-[9px]">🔒</span>}
                </button>
              );
            })}

            <div className="w-px h-5 bg-slate-700 mx-1" />

            <button
              type="button"
              onClick={handleDebate}
              disabled={!canSend}
              title={!input.trim() ? '메시지 입력 후 활성화' : '4AI 3라운드 협업 토론'}
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
            {!input.trim() && (
              <span className="text-[11px] text-slate-500">메시지 입력 후 4AI 토론 활성화</span>
            )}
          </div>
          )}
        </div>
      </div>
    </div>
  );
}
