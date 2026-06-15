'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useStore } from '@/context/StoreContext';
import {
  Bot, Send, Plus, Trash2,
  Loader2,
  Edit2, Check, X, AlertCircle, Swords,
  PanelLeftOpen, ChevronDown,
  Mic, MicOff, Volume2, VolumeX, ArrowLeft, Sparkles,
} from 'lucide-react';
import { getAuthHeaders, getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import { useSpeechInput } from '@/hooks/useSpeechInput';
import { useSpeechOutput } from '@/hooks/useSpeechOutput';
import { useIsMobileView } from '@/hooks/useIsMobileView';
import type { DebateEntry, DebateRoundResult } from '@/app/api/ai/route';
import MarketingRecommendPanel, {
  type MarketingRecommendPayload,
} from '@/components/ai/MarketingRecommendPanel';

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
  { id: 'chat',     label: '일반 대화', desc: 'Pitaya OS·매장 데이터·API 기반 Q&A (사원 정보 제외)' },
  { id: 'debate',   label: '토론 모드', desc: '4개 AI가 3라운드 의견 교환 후 종합 답변' },
  { id: 'analysis', label: '분석 모드', desc: '매출·고객 데이터 심층 분석' },
];

/** 사이드바 모드 메뉴 — 토론은 입력창 「토론」 버튼으로만 실행 */
const SIDEBAR_CHAT_MODES = CHAT_MODES.filter(m => m.id !== 'debate');

const DEBATE_TOPICS = ['주말 영업 확대', '온라인 판매 확대', '직원 추가 채용'];

const ANALYSIS_STARTER_PROMPTS = [
  '최근 매출이 왜 하락했는지 분석해줘',
  '이탈 고객과 lost buyers 현황',
  '품목 mix 변화와 급감 SKU',
  '요일별 매출·쿠폰 타깃 제안',
];

const MARKETING_STARTER_PROMPTS = [
  '고객별 쿠폰·마케팅 문자 추천 리스트 엑셀로 만들어줘',
  '이탈 위험 고객에게 보낼 쿠폰과 문자 정리해줘',
  '생일·재방문 주기 초과 고객 마케팅 대상 뽑아줘',
];

interface AnalysisContextMeta {
  pack: string;
  packLabel: string;
  asOf: string;
  summary: {
    netWoW: number | null;
    custWoW: number | null;
    lostBuyers: number;
    decreasingCustomers: number;
  };
}

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
  analysisContext?: AnalysisContextMeta;
  marketingRecommendations?: MarketingRecommendPayload;
}

function formatPct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}

function AnalysisContextChips({ ctx }: { ctx: AnalysisContextMeta }) {
  const { summary } = ctx;
  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-1">
      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-teal-500/15 text-teal-300 border-teal-500/30">
        📊 {ctx.packLabel}
      </span>
      <span className="text-[11px] px-2 py-0.5 rounded-full border bg-slate-800 text-slate-300 border-slate-700">
        매출 WoW {formatPct(summary.netWoW)}
      </span>
      <span className="text-[11px] px-2 py-0.5 rounded-full border bg-slate-800 text-slate-300 border-slate-700">
        객수 WoW {formatPct(summary.custWoW)}
      </span>
      <span className="text-[11px] px-2 py-0.5 rounded-full border bg-slate-800 text-slate-300 border-slate-700">
        lost buyers {summary.lostBuyers}명
      </span>
      <span className="text-[11px] px-2 py-0.5 rounded-full border bg-slate-800 text-slate-300 border-slate-700">
        구매감소 {summary.decreasingCustomers}명
      </span>
      <span className="text-[10px] text-slate-500">기준 {ctx.asOf}</span>
    </div>
  );
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
    analysisContext: msg.analysisContext,
    marketingRecommendations: msg.marketingRecommendations,
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
  const isMobileLayout = useIsMobileView();
  const [editingId,      setEditingId]      = useState<string | null>(null);
  const [editTitle,      setEditTitle]      = useState('');
  const [selectedModel,  setSelectedModel]  = useState<ModelId>('auto');
  const [chatMode,       setChatMode]       = useState<ChatMode>('chat');
  const [activeIds,      setActiveIds]      = useState<Set<string>>(new Set());
  const [modelsLoaded,   setModelsLoaded]   = useState(false);
  const [sendError,      setSendError]      = useState<string | null>(null);
  const [voiceConversation, setVoiceConversation] = useState(false);
  const [showModelMenu,  setShowModelMenu]  = useState(false);
  const [showModeMenu,   setShowModeMenu]   = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const voiceConversationRef = useRef(voiceConversation);
  const isWorkingRef = useRef(false);
  const sendFromVoiceRef = useRef<(text: string) => void>(() => {});

  useEffect(() => { voiceConversationRef.current = voiceConversation; }, [voiceConversation]);

  useEffect(() => {
    setShowSidebar(!isMobileLayout);
  }, [isMobileLayout]);

  const { enabled: ttsEnabled, setEnabled: setTtsEnabled, speaking, speak, stop: stopSpeaking, supported: ttsSupported } = useSpeechOutput();

  const { listening, supported: sttSupported, toggle: toggleListening, start: startListening, stop: stopListening } = useSpeechInput({
    onFinalTranscript: (text) => {
      if (voiceConversationRef.current) {
        sendFromVoiceRef.current(text);
        return;
      }
      setInput(prev => (prev ? `${prev} ${text}` : text));
    },
    onError: (msg) => setSendError(msg),
  });

  useEffect(() => {
    setVoiceConversation(ttsEnabled);
  }, [ttsEnabled]);

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
  const handleDebate = async (textOverride?: string) => {
    const messageText = (textOverride ?? input).trim();
    if (!messageText || isLoading || isDebating) return;
    setSendError(null);
    stopListening();
    stopSpeaking();

    const userMsg: Message = {
      role:      'user',
      content:   messageText,
      timestamp: new Date().toISOString(),
    };

    const historyForAI = [...messages];
    const newMessages  = [...messages, userMsg];
    setMessages(newMessages);
    if (!textOverride) setInput('');
    setIsDebating(true);
    isWorkingRef.current = true;

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

      speak(aiMsg.content, () => {
        if (voiceConversationRef.current) startListening();
      });

    } catch (e: any) {
      setSendError(`토론 오류: ${e.message}`);
      setMessages(historyForAI);
      if (!textOverride) setInput(messageText);
    } finally {
      setIsDebating(false);
      isWorkingRef.current = false;
    }
  };

  // ── 일반 메시지 전송 ──
  const handleSend = async (textOverride?: string) => {
    const messageText = (textOverride ?? input).trim();
    if (!messageText || isLoading || isDebating) return;
    if (chatMode === 'debate') {
      return handleDebate(messageText);
    }
    setSendError(null);
    stopListening();
    stopSpeaking();

    const modelInfo = MODELS.find(m => m.id === selectedModel) ?? MODELS[0];

    const userMsg: Message = {
      role:      'user',
      content:   messageText,
      timestamp: new Date().toISOString(),
    };

    const historyForAI = [...messages];
    const newMessages  = [...messages, userMsg];
    setMessages(newMessages);
    if (!textOverride) setInput('');
    setIsLoading(true);
    isWorkingRef.current = true;

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
        if (!textOverride) setInput(messageText);
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
        analysisContext: data.analysisContext,
        marketingRecommendations: data.marketingRecommendations,
      };

      const finalMessages = [...newMessages, aiMsg];
      setMessages(finalMessages);

      const modePrefix = chatMode === 'analysis' ? '[분석] ' : '';
      const title = modePrefix + userMsg.content.slice(0, 20) + (userMsg.content.length > 20 ? '...' : '');
      await saveConversation(finalMessages, title);

      speak(aiMsg.content, () => {
        if (voiceConversationRef.current) startListening();
      });

    } catch (e: any) {
      setSendError(`네트워크 오류: ${e.message}`);
      setMessages(historyForAI);
      if (!textOverride) setInput(messageText);
    } finally {
      setIsLoading(false);
      isWorkingRef.current = false;
    }
  };

  sendFromVoiceRef.current = (text: string) => {
    setInput(text);
    void handleSend(text);
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
  const selectedModelInfo = MODELS.find(m => m.id === selectedModel) ?? MODELS[0];
  const currentTitle = currentId
    ? (conversations.find(c => c.id === currentId)?.title || 'AI 대화')
    : '새 대화';
  const inputPlaceholder =
    chatMode === 'debate'
      ? (messages.length === 0
        ? '토론 주제를 입력하세요 (예: 주말 영업 확대)'
        : '추가 의견 입력 (선택)')
      : chatMode === 'analysis'
        ? '매출·고객·매입 데이터 분석 질문을 입력하세요...'
        : '메시지를 입력하세요... (Enter 전송, Shift+Enter 줄바꿈)';

  return (
    <div className="flex h-full w-full bg-[#212121] text-[#ececec] overflow-hidden relative">

      {isMobileLayout && showSidebar && (
        <button
          type="button"
          aria-label="대화 목록 닫기"
          className="absolute inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setShowSidebar(false)}
        />
      )}

      <aside
        className={`
          flex-shrink-0 flex flex-col bg-[#171717] border-r border-[#2f2f2f] z-50 overflow-hidden
          transition-transform duration-200 ease-out
          ${isMobileLayout
            ? `absolute inset-y-0 left-0 w-[min(17.5rem,88vw)] shadow-2xl ${showSidebar ? 'translate-x-0' : '-translate-x-full'}`
            : 'relative w-[260px]'
          }
        `}
      >
        <div className="p-3 border-b border-[#2f2f2f] space-y-2">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-[#b4b4b4] hover:text-[#ececec] hover:bg-[#2f2f2f] text-sm transition-colors"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" />
            <span className="truncate">Pitaya OS</span>
          </Link>
          <button
            onClick={handleNewChat}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border border-[#3f3f3f] bg-transparent hover:bg-[#2f2f2f] text-[#ececec] text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            새 대화
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {isLoadingList ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 text-[#b4b4b4] animate-spin" />
            </div>
          ) : conversations.length === 0 ? (
            <p className="text-center text-[#6b6b6b] text-sm py-8">대화 기록이 없습니다</p>
          ) : (
            Object.entries(grouped).map(([group, convs]) =>
              convs.length > 0 && (
                <div key={group} className="mb-3">
                  <p className="text-[#6b6b6b] text-[11px] font-medium px-2 py-1">{group}</p>
                  {convs.map(conv => (
                    <div
                      key={conv.id}
                      onClick={() => handleSelect(conv)}
                      className={`
                        group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-colors mb-0.5
                        ${currentId === conv.id ? 'bg-[#2f2f2f] text-[#ececec]' : 'text-[#b4b4b4] hover:bg-[#2f2f2f]/70 hover:text-[#ececec]'}
                      `}
                    >
                      {editingId === conv.id ? (
                        <div className="flex-1 flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          <input
                            value={editTitle}
                            onChange={e => setEditTitle(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleRenameSave(conv.id);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                            className="flex-1 bg-[#2f2f2f] text-[#ececec] text-sm px-2 py-1 rounded focus:outline-none focus:ring-1 focus:ring-[#6b6b6b]"
                            autoFocus
                          />
                          <button onClick={() => handleRenameSave(conv.id)} className="text-[#ececec]">
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setEditingId(null)} className="text-[#6b6b6b]">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <span className="flex-1 text-sm truncate">{conv.title}</span>
                          <div className={`flex items-center gap-0.5 shrink-0 ${isMobileLayout ? '' : 'hidden group-hover:flex'}`}>
                            <button onClick={e => handleRenameStart(conv, e)} className="p-1.5 touch-target flex items-center justify-center hover:text-[#ececec] text-[#6b6b6b]">
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button onClick={e => handleDelete(conv.id, e)} className="p-1.5 touch-target flex items-center justify-center hover:text-red-400 text-[#6b6b6b]">
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

        <div className="p-3 border-t border-[#2f2f2f] space-y-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowModeMenu(v => !v)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-[#2f2f2f] text-sm text-[#ececec] hover:bg-[#3f3f3f] transition-colors"
            >
              <span>{activeMode.label}</span>
              <ChevronDown className="w-4 h-4 text-[#6b6b6b]" />
            </button>
            {showModeMenu && (
              <div className="absolute bottom-full left-0 right-0 mb-1 rounded-lg border border-[#3f3f3f] bg-[#2f2f2f] shadow-xl overflow-hidden z-10">
                {SIDEBAR_CHAT_MODES.map(mode => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => { setChatMode(mode.id); setShowModeMenu(false); setSendError(null); }}
                    className={`w-full text-left px-3 py-2 text-sm transition-colors ${chatMode === mode.id ? 'bg-[#3f3f3f] text-[#ececec]' : 'text-[#b4b4b4] hover:bg-[#3f3f3f]/60'}`}
                  >
                    <div className="font-medium">{mode.label}</div>
                    <div className="text-[11px] text-[#6b6b6b] mt-0.5">{mode.desc}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          {currentStore?.storeName && (
            <p className="text-[11px] text-[#6b6b6b] px-1 truncate">{currentStore.storeName}</p>
          )}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <header className="h-12 shrink-0 flex items-center gap-2 px-3 sm:px-4 border-b border-[#2f2f2f] bg-[#212121]">
          {isMobileLayout && (
            <button
              type="button"
              onClick={() => setShowSidebar(true)}
              className="p-2 rounded-lg text-[#b4b4b4] hover:text-[#ececec] hover:bg-[#2f2f2f]"
              aria-label="대화 목록"
            >
              <PanelLeftOpen className="w-5 h-5" />
            </button>
          )}
          <h1 className="flex-1 text-sm font-medium text-[#ececec] truncate min-w-0">{currentTitle}</h1>

          {chatMode !== 'debate' && (
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setShowModelMenu(v => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-[#b4b4b4] hover:text-[#ececec] hover:bg-[#2f2f2f] transition-colors"
              >
                <span>{selectedModelInfo.emoji}</span>
                <span className="hidden sm:inline">{selectedModelInfo.name}</span>
                <ChevronDown className="w-4 h-4" />
              </button>
              {showModelMenu && (
                <div className="absolute right-0 top-full mt-1 w-52 rounded-lg border border-[#3f3f3f] bg-[#2f2f2f] shadow-xl overflow-hidden z-20">
                  {MODELS.map(m => {
                    const modelActive = isModelActive(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        disabled={!modelActive}
                        onClick={() => { if (modelActive) { setSelectedModel(m.id); setShowModelMenu(false); } }}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${selectedModel === m.id ? 'bg-[#3f3f3f] text-[#ececec]' : 'text-[#b4b4b4] hover:bg-[#3f3f3f]/60'} ${!modelActive ? 'opacity-40 cursor-not-allowed' : ''}`}
                      >
                        <span>{m.emoji}</span>
                        <div>
                          <div>{m.name}</div>
                          <div className="text-[11px] text-[#6b6b6b]">{m.subName}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {(sttSupported || ttsSupported) && (
            <button
              type="button"
              onClick={() => {
                const next = !ttsEnabled;
                setTtsEnabled(next);
                setVoiceConversation(next);
                if (!next) {
                  stopListening();
                  stopSpeaking();
                } else if (sttSupported && !isWorkingRef.current) {
                  startListening();
                }
              }}
              title={ttsEnabled ? '음성 대화 끄기' : '음성 대화 켜기'}
              className={`p-2 rounded-lg transition-colors ${ttsEnabled ? 'bg-[#d97757]/20 text-[#d97757]' : 'text-[#b4b4b4] hover:text-[#ececec] hover:bg-[#2f2f2f]'}`}
            >
              {ttsEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
            </button>
          )}
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto w-full px-4 py-6 sm:py-8">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-4">
                <div className="w-12 h-12 rounded-full bg-[#2f2f2f] flex items-center justify-center mb-4">
                  <Sparkles className="w-6 h-6 text-[#d97757]" />
                </div>
                <h2 className="text-2xl font-medium text-[#ececec] mb-2">
                  {chatMode === 'debate' ? '어떤 주제로 토론할까요?' : chatMode === 'analysis' ? '무엇을 분석해 드릴까요?' : '무엇을 도와드릴까요?'}
                </h2>
                <p className="text-[#6b6b6b] text-sm max-w-md leading-relaxed">{activeMode.desc}</p>
                {chatMode === 'analysis' && (
                  <div className="flex flex-wrap justify-center gap-2 mt-6 max-w-lg">
                    {ANALYSIS_STARTER_PROMPTS.map(prompt => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => setInput(prompt)}
                        className="px-3 py-2 rounded-full text-xs bg-[#2f2f2f] text-[#b4b4b4] border border-[#3f3f3f] hover:border-[#6b6b6b] hover:text-[#ececec] transition-colors"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                )}
                {chatMode === 'chat' && (
                  <div className="flex flex-wrap justify-center gap-2 mt-6 max-w-lg">
                    {MARKETING_STARTER_PROMPTS.map(prompt => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => setInput(prompt)}
                        className="px-3 py-2 rounded-full text-xs bg-teal-500/10 text-teal-300 border border-teal-500/30 hover:border-teal-400/50 hover:text-teal-200 transition-colors"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                )}
                {chatMode === 'debate' && (
                  <div className="flex flex-wrap justify-center gap-2 mt-6">
                    {DEBATE_TOPICS.map(topic => (
                      <button
                        key={topic}
                        type="button"
                        onClick={() => setInput(topic)}
                        className="px-3 py-2 rounded-full text-xs bg-[#2f2f2f] text-[#b4b4b4] border border-[#3f3f3f] hover:border-[#d97757]/40 hover:text-[#ececec] transition-colors"
                      >
                        {topic}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-8">
              {messages.map((msg, idx) => (
                <div key={idx} className="group">
                  {msg.role === 'user' ? (
                    <div className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl bg-[#2f2f2f] px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap text-[#ececec]">
                        {msg.content}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {(!msg.debateRounds?.length && (!msg.debate || msg.debate.length === 0)) && (
                        <div className="text-[15px] leading-relaxed whitespace-pre-wrap text-[#ececec]">
                          {msg.content}
                        </div>
                      )}
                      {msg.debateRounds && msg.debateRounds.length > 0 && (
                        <CollaborativeDebateView rounds={msg.debateRounds} summary={msg.debateSummary || msg.content} />
                      )}
                      {(!msg.debateRounds?.length) && msg.debate && msg.debate.length > 0 && (
                        <DebateCards entries={msg.debate} />
                      )}
                      {(msg.usedModel || msg.debatePhase) && (
                        <div className="flex items-center gap-1.5 flex-wrap md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                          {msg.debatePhase && (
                            <span className="text-[11px] px-2 py-0.5 rounded-full border border-[#3f3f3f] text-[#b4b4b4]">
                              {msg.debatePhase}
                            </span>
                          )}
                          {msg.usedModel && (
                            <span className="text-[11px] px-2 py-0.5 rounded-full border border-[#3f3f3f] text-[#6b6b6b]">
                              {msg.usedModel}
                            </span>
                          )}
                        </div>
                      )}
                      {msg.analysisContext && <AnalysisContextChips ctx={msg.analysisContext} />}
                      {msg.marketingRecommendations && user?.uid && currentStore?.storeId && (
                        <MarketingRecommendPanel
                          data={msg.marketingRecommendations}
                          storeId={currentStore.storeId}
                          uid={user.uid}
                        />
                      )}
                    </div>
                  )}
                </div>
              ))}

              {isWorking && (
                <div className="flex items-center gap-2 text-[#6b6b6b] text-sm">
                  {isDebating ? (
                    <Swords className="w-4 h-4 text-[#d97757] animate-pulse" />
                  ) : (
                    <Bot className="w-4 h-4 animate-pulse" />
                  )}
                  <span>{isDebating ? '4AI 토론 중...' : chatMode === 'analysis' ? '분석 중...' : '생각 중...'}</span>
                </div>
              )}
            </div>
            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="shrink-0 px-4 pb-4 pt-2 safe-bottom">
          <div className="max-w-3xl mx-auto w-full">
            {sendError && (
              <div className="mb-2 flex items-center gap-2 rounded-xl border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-300">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span className="flex-1">{sendError}</span>
                <button onClick={() => setSendError(null)} className="text-red-300 hover:text-red-100">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {(listening || speaking) && (
              <p className="mb-2 text-center text-xs text-[#d97757]">
                {speaking ? '🔊 AI 응답 재생 중...' : '🎤 듣고 있습니다...'}
              </p>
            )}

            <div className="rounded-2xl border border-[#3f3f3f] bg-[#2f2f2f] shadow-lg focus-within:border-[#6b6b6b] transition-colors">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
                placeholder={inputPlaceholder}
                rows={1}
                className="w-full bg-transparent px-4 pt-4 pb-2 text-[15px] text-[#ececec] placeholder:text-[#6b6b6b] focus:outline-none resize-none min-h-[52px] max-h-40"
              />
              <div className="flex items-center justify-between gap-2 px-3 pb-3">
                <div className="flex items-center gap-1 flex-wrap min-w-0">
                  {chatMode === 'debate' ? (
                    <button
                      type="button"
                      onClick={() => void handleDebate()}
                      disabled={!canSend}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-[#d97757] hover:bg-[#3f3f3f] disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Swords className="w-3.5 h-3.5" />
                      4AI 토론
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleDebate()}
                      disabled={!canSend}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-[#6b6b6b] hover:text-[#ececec] hover:bg-[#3f3f3f] disabled:opacity-40"
                    >
                      <Swords className="w-3.5 h-3.5" />
                      토론
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {sttSupported && (
                    <button
                      type="button"
                      onClick={toggleListening}
                      disabled={isWorking || speaking}
                      title={listening ? '음성 입력 중지' : voiceConversation ? '음성으로 말하기' : '음성 입력'}
                      className={`p-2 rounded-lg transition-colors disabled:opacity-40 ${listening ? 'bg-[#d97757]/20 text-[#d97757]' : 'text-[#b4b4b4] hover:text-[#ececec] hover:bg-[#3f3f3f]'}`}
                    >
                      {listening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleSend()}
                    disabled={!canSend}
                    title="전송"
                    className="p-2 rounded-lg bg-[#ececec] text-[#212121] hover:bg-white disabled:bg-[#3f3f3f] disabled:text-[#6b6b6b] disabled:cursor-not-allowed transition-colors"
                  >
                    {isWorking ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            </div>

            <p className="text-center text-[11px] text-[#6b6b6b] mt-2">
              Enter 전송 · Shift+Enter 줄바꿈
              {voiceConversation && sttSupported && ttsSupported ? ' · 음성 대화 모드' : ''}
            </p>
          </div>
        </div>
      </div>

      {(showModelMenu || showModeMenu) && (
        <button
          type="button"
          className="fixed inset-0 z-10 cursor-default"
          aria-label="메뉴 닫기"
          onClick={() => { setShowModelMenu(false); setShowModeMenu(false); }}
        />
      )}
    </div>
  );

}
