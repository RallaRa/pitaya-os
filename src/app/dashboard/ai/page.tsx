'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useStore } from '@/context/StoreContext';
import {
  Bot, User, Send, Plus, Trash2,
  Loader2, MessageSquare, ChevronLeft,
  Edit2, Check, X
} from 'lucide-react';

type ModelChoice = 'auto' | 'gemini' | 'claude' | 'gpt';

const MODEL_OPTIONS: { value: ModelChoice; emoji: string; label: string }[] = [
  { value: 'auto',   emoji: '🤖', label: '자동 (권장)' },
  { value: 'gemini', emoji: '⚡', label: 'Gemini'      },
  { value: 'claude', emoji: '🧠', label: 'Claude'      },
  { value: 'gpt',    emoji: '👔', label: 'GPT'         },
];

const MODEL_BADGE: Record<string, string> = {
  'Gemini 2.5 Flash':  '⚡',
  'Claude 3.5 Sonnet': '🧠',
  'GPT-4o':            '👔',
};

interface Message {
  role: 'user' | 'model';
  content: string;
  timestamp: string;
  usedModel?: string;
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
    role:      msg.role === 'ai' ? 'model' : (msg.role || 'model'),
    content:   msg.content || msg.text || '',
    timestamp: msg.timestamp || msg.createdAt || new Date().toISOString(),
    usedModel: msg.usedModel,
  };
}

function toDate(val: any): Date {
  if (!val) return new Date(0);
  if (typeof val.toDate === 'function') return val.toDate();
  if (val._seconds !== undefined) return new Date(val._seconds * 1000);
  return new Date(val);
}

export default function AiChatPage() {
  const { user }         = useAuth();
  const { currentStore } = useStore();

  const [conversations,  setConversations]  = useState<Conversation[]>([]);
  const [currentId,      setCurrentId]      = useState<string | null>(null);
  const [messages,       setMessages]       = useState<Message[]>([]);
  const [input,          setInput]          = useState('');
  const [isLoading,      setIsLoading]      = useState(false);
  const [isLoadingList,  setIsLoadingList]  = useState(true);
  const [showSidebar,    setShowSidebar]    = useState(true);
  const [editingId,      setEditingId]      = useState<string | null>(null);
  const [editTitle,      setEditTitle]      = useState('');
  const [selectedModel,  setSelectedModel]  = useState<ModelChoice>('auto');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    if (!user?.uid) return;
    setIsLoadingList(true);
    try {
      const params = new URLSearchParams({ uid: user.uid });
      if (currentStore?.storeId) params.set('storeId', currentStore.storeId);
      const res  = await fetch(`/api/conversations?${params}`);
      const data = await res.json();
      setConversations(data.conversations || []);
    } finally {
      setIsLoadingList(false);
    }
  }, [user?.uid, currentStore?.storeId]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSelect = (conv: Conversation) => {
    setCurrentId(conv.id);
    setMessages((conv.messages || []).map(normalizeMsg));
    setShowSidebar(false);
  };

  const handleNewChat = () => {
    setCurrentId(null);
    setMessages([]);
    setInput('');
    setShowSidebar(false);
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

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
      const res  = await fetch('/api/ai', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          message: userMsg.content,
          history: historyForAI,
          model:   selectedModel,
        }),
      });
      const data = await res.json();

      const aiMsg: Message = {
        role:      'model',
        content:   data.text || '응답을 받지 못했습니다.',
        timestamp: new Date().toISOString(),
        usedModel: data.usedModel || '',
      };

      const finalMessages = [...newMessages, aiMsg];
      setMessages(finalMessages);

      const title   = userMsg.content.slice(0, 20) + (userMsg.content.length > 20 ? '...' : '');
      const saveRes = await fetch('/api/conversations', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
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

    } catch (e: any) {
      setMessages(prev => [...prev, {
        role:      'model',
        content:   `오류: ${e.message}`,
        timestamp: new Date().toISOString(),
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('이 대화를 삭제하시겠습니까?')) return;
    await fetch(`/api/conversations?id=${id}`, { method: 'DELETE' });
    if (currentId === id) { setCurrentId(null); setMessages([]); }
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
      headers: { 'Content-Type': 'application/json' },
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
      '오늘':   convs.filter(c => ts(c).toDateString() === today.toDateString()),
      '어제':   convs.filter(c => ts(c).toDateString() === yesterday.toDateString()),
      '이번 주': convs.filter(c => {
        const d = ts(c);
        return d > weekAgo
          && d.toDateString() !== today.toDateString()
          && d.toDateString() !== yesterday.toDateString();
      }),
      '이전':   convs.filter(c => ts(c) <= weekAgo),
    };
  };

  const grouped = groupByDate(conversations);

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
                              if (e.key === 'Enter') handleRenameSave(conv.id);
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
              <h2 className="text-white font-bold text-xl mb-2">무엇을 도와드릴까요?</h2>
              <p className="text-slate-500 text-sm max-w-sm">
                Pitaya OS AI 어시스턴트입니다.<br />
                경영, 매출, 재고 등 무엇이든 물어보세요.
              </p>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex gap-3 max-w-[75%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                  msg.role === 'user' ? 'bg-blue-600' : 'bg-teal-600'
                }`}>
                  {msg.role === 'user'
                    ? <User className="w-4 h-4 text-white" />
                    : <Bot  className="w-4 h-4 text-white" />
                  }
                </div>

                <div className="flex flex-col gap-1">
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

                  {/* usedModel 뱃지 */}
                  {msg.role === 'model' && msg.usedModel && (
                    <span className="text-[11px] text-slate-500 pl-1 flex items-center gap-1">
                      <span>{MODEL_BADGE[msg.usedModel] ?? '🤖'}</span>
                      <span>{msg.usedModel}이 작성함</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-teal-600 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <div className="bg-slate-800 border border-slate-700 px-4 py-3 rounded-2xl rounded-tl-sm flex items-center">
                  <div className="flex gap-1">
                    {[0, 1, 2].map(i => (
                      <div
                        key={i}
                        className="w-2 h-2 bg-teal-400 rounded-full animate-bounce"
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

          {/* 모델 선택 */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-slate-500 mr-1">모델:</span>
            {MODEL_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setSelectedModel(opt.value)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                  selectedModel === opt.value
                    ? 'bg-teal-500 text-slate-950'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700 border border-slate-700'
                }`}
              >
                {opt.emoji} {opt.label}
              </button>
            ))}
          </div>

          {/* 텍스트 입력 */}
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
              }}
              placeholder="메시지를 입력하세요... (Enter 전송, Shift+Enter 줄바꿈)"
              rows={1}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 text-sm placeholder:text-slate-500 focus:outline-none focus:border-teal-500 transition-colors resize-none"
            />
            <button
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
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
