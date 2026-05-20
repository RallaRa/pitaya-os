'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  Bot, User, Send, Plus, Trash2,
  Loader2, MessageSquare, ChevronLeft,
  Edit2, Check, X
} from 'lucide-react';

interface Message {
  role: 'user' | 'ai';
  text: string;
  createdAt: string;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: any;
}

export default function AiChatPage() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [showSidebar, setShowSidebar] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 대화 목록 로드
  const loadConversations = async () => {
    if (!user?.uid) return;
    setIsLoadingList(true);
    try {
      const res = await fetch(`/api/conversations?uid=${user.uid}`);
      const data = await res.json();
      setConversations(data.conversations || []);
    } finally {
      setIsLoadingList(false);
    }
  };

  useEffect(() => { loadConversations(); }, [user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // 대화 선택
  const handleSelect = async (conv: Conversation) => {
    setCurrentId(conv.id);
    setMessages(conv.messages || []);
    setShowSidebar(false);
  };

  // 새 대화 시작
  const handleNewChat = async () => {
    setCurrentId(null);
    setMessages([]);
    setInput('');
    setShowSidebar(false);
  };

  // 메시지 전송
  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: Message = {
      role: 'user',
      text: input.trim(),
      createdAt: new Date().toISOString(),
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      // AI 응답
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: input.trim(),
          persona: 'assistant'
        }),
      });
      const data = await res.json();

      const aiMsg: Message = {
        role: 'ai',
        text: data.text || '응답을 받지 못했습니다.',
        createdAt: new Date().toISOString(),
      };

      const finalMessages = [...newMessages, aiMsg];
      setMessages(finalMessages);

      // Firestore 저장
      const title = userMsg.text.slice(0, 20) +
        (userMsg.text.length > 20 ? '...' : '');

      if (currentId) {
        // 기존 대화 업데이트
        await fetch('/api/conversations', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: currentId,
            messages: finalMessages
          }),
        });
      } else {
        // 새 대화 생성
        const saveRes = await fetch('/api/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uid: user?.uid,
            title,
            messages: finalMessages
          }),
        });
        const saveData = await saveRes.json();
        if (saveData.id) setCurrentId(saveData.id);
      }

      await loadConversations();
    } catch (e: any) {
      setMessages(prev => [...prev, {
        role: 'ai',
        text: `오류: ${e.message}`,
        createdAt: new Date().toISOString(),
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  // 대화 삭제
  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('이 대화를 삭제하시겠습니까?')) return;
    await fetch(`/api/conversations?id=${id}`, { method: 'DELETE' });
    if (currentId === id) {
      setCurrentId(null);
      setMessages([]);
    }
    await loadConversations();
  };

  // 제목 수정
  const handleRenameStart = (conv: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(conv.id);
    setEditTitle(conv.title);
  };

  const handleRenameSave = async (id: string) => {
    await fetch('/api/conversations', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, title: editTitle,
        messages: conversations.find(c => c.id === id)?.messages || []
      }),
    });
    setEditingId(null);
    await loadConversations();
  };

  // 날짜 그룹핑
  const groupByDate = (convs: Conversation[]) => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    return {
      '오늘': convs.filter(c => {
        const d = c.updatedAt?.toDate?.() || new Date(c.updatedAt);
        return d.toDateString() === today.toDateString();
      }),
      '어제': convs.filter(c => {
        const d = c.updatedAt?.toDate?.() || new Date(c.updatedAt);
        return d.toDateString() === yesterday.toDateString();
      }),
      '이번 주': convs.filter(c => {
        const d = c.updatedAt?.toDate?.() || new Date(c.updatedAt);
        return d > weekAgo &&
          d.toDateString() !== today.toDateString() &&
          d.toDateString() !== yesterday.toDateString();
      }),
      '이전': convs.filter(c => {
        const d = c.updatedAt?.toDate?.() || new Date(c.updatedAt);
        return d <= weekAgo;
      }),
    };
  };

  const grouped = groupByDate(conversations);

  return (
    <div className="flex h-[calc(100vh-2rem)] bg-slate-950
      rounded-xl overflow-hidden border border-slate-800">

      {/* 사이드바 — 대화 목록 */}
      <div className={`
        ${showSidebar ? 'w-72' : 'w-0 md:w-72'}
        flex-shrink-0 bg-slate-900 border-r border-slate-700
        flex flex-col transition-all duration-200 overflow-hidden
      `}>
        {/* 새 대화 버튼 */}
        <div className="p-3 border-b border-slate-700">
          <button
            onClick={handleNewChat}
            className="w-full flex items-center gap-2
              bg-teal-600 hover:bg-teal-500 text-white
              px-4 py-2.5 rounded-xl font-medium text-sm
              transition-colors"
          >
            <Plus className="w-4 h-4" />
            새 대화
          </button>
        </div>

        {/* 대화 목록 */}
        <div className="flex-1 overflow-y-auto p-2">
          {isLoadingList ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 text-teal-400 animate-spin" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="text-center py-8">
              <MessageSquare className="w-8 h-8 text-slate-600
                mx-auto mb-2" />
              <p className="text-slate-500 text-sm">
                대화 기록이 없습니다.
              </p>
            </div>
          ) : (
            Object.entries(grouped).map(([group, convs]) =>
              convs.length > 0 && (
                <div key={group} className="mb-4">
                  <p className="text-slate-500 text-xs font-medium
                    px-2 py-1 uppercase tracking-wider">
                    {group}
                  </p>
                  {convs.map(conv => (
                    <div key={conv.id}
                      onClick={() => handleSelect(conv)}
                      className={`
                        group flex items-center gap-2 px-3 py-2
                        rounded-lg cursor-pointer transition-colors mb-0.5
                        ${currentId === conv.id
                          ? 'bg-teal-600/20 text-teal-400'
                          : 'hover:bg-slate-800 text-slate-300'}
                      `}
                    >
                      {editingId === conv.id ? (
                        <div className="flex-1 flex items-center gap-1"
                          onClick={e => e.stopPropagation()}>
                          <input
                            value={editTitle}
                            onChange={e => setEditTitle(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter')
                                handleRenameSave(conv.id);
                              if (e.key === 'Escape')
                                setEditingId(null);
                            }}
                            className="flex-1 bg-slate-700 text-white
                              text-sm px-2 py-1 rounded
                              focus:outline-none focus:ring-1
                              focus:ring-teal-500"
                            autoFocus
                          />
                          <button onClick={() => handleRenameSave(conv.id)}
                            className="text-teal-400 hover:text-teal-300">
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setEditingId(null)}
                            className="text-slate-400 hover:text-slate-200">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <MessageSquare className="w-4 h-4
                            flex-shrink-0 opacity-60" />
                          <span className="flex-1 text-sm truncate">
                            {conv.title}
                          </span>
                          <div className="hidden group-hover:flex
                            items-center gap-1">
                            <button
                              onClick={e => handleRenameStart(conv, e)}
                              className="p-1 hover:text-white
                                text-slate-400 transition-colors"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button
                              onClick={e => handleDelete(conv.id, e)}
                              className="p-1 hover:text-red-400
                                text-slate-400 transition-colors"
                            >
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

      {/* 채팅 영역 */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* 헤더 */}
        <div className="bg-slate-900 border-b border-slate-700
          px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className="md:hidden text-slate-400 hover:text-white
              transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <Bot className="w-5 h-5 text-teal-400" />
          <div>
            <h1 className="text-white font-bold text-sm">
              {currentId
                ? conversations.find(c => c.id === currentId)?.title
                  || 'AI 대화'
                : '새 대화'
              }
            </h1>
            <p className="text-slate-500 text-xs">
              Pitaya OS AI Assistant
            </p>
          </div>
        </div>

        {/* 메시지 영역 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center
              h-full text-center">
              <Bot className="w-16 h-16 text-teal-400/30 mb-4" />
              <h2 className="text-white font-bold text-xl mb-2">
                무엇을 도와드릴까요?
              </h2>
              <p className="text-slate-500 text-sm max-w-sm">
                Pitaya OS AI 어시스턴트입니다.<br/>
                경영, 매출, 재고 등 무엇이든 물어보세요.
              </p>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div key={idx}
              className={`flex ${msg.role === 'user'
                ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex gap-3 max-w-[75%]
                ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>

                {/* 아바타 */}
                <div className={`flex-shrink-0 w-8 h-8 rounded-full
                  flex items-center justify-center
                  ${msg.role === 'user'
                    ? 'bg-blue-600' : 'bg-teal-600'}`}>
                  {msg.role === 'user'
                    ? <User className="w-4 h-4 text-white" />
                    : <Bot className="w-4 h-4 text-white" />
                  }
                </div>

                {/* 말풍선 */}
                <div className={`px-4 py-3 rounded-2xl text-sm
                  leading-relaxed whitespace-pre-wrap
                  ${msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-tr-sm'
                    : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-tl-sm'
                  }`}>
                  {msg.text}
                  <p className={`text-xs mt-1
                    ${msg.role === 'user'
                      ? 'text-blue-200' : 'text-slate-500'}`}>
                    {new Date(msg.createdAt).toLocaleTimeString('ko-KR', {
                      hour: '2-digit', minute: '2-digit'
                    })}
                  </p>
                </div>
              </div>
            </div>
          ))}

          {/* AI 타이핑 */}
          {isLoading && (
            <div className="flex justify-start">
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-teal-600
                  flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <div className="bg-slate-800 border border-slate-700
                  px-4 py-3 rounded-2xl rounded-tl-sm
                  flex items-center gap-2">
                  <div className="flex gap-1">
                    {[0,1,2].map(i => (
                      <div key={i}
                        className="w-2 h-2 bg-teal-400 rounded-full
                          animate-bounce"
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

        {/* 입력창 */}
        <div className="bg-slate-900 border-t border-slate-700 p-4">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="메시지를 입력하세요... (Enter로 전송, Shift+Enter 줄바꿈)"
              rows={1}
              className="flex-1 bg-slate-800 border border-slate-700
                rounded-xl px-4 py-3 text-slate-100 text-sm
                placeholder:text-slate-500 focus:outline-none
                focus:border-teal-500 transition-colors resize-none"
            />
            <button
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              className="bg-teal-600 hover:bg-teal-500
                disabled:bg-slate-700 disabled:cursor-not-allowed
                text-white p-3 rounded-xl transition-colors
                flex-shrink-0"
            >
              {isLoading
                ? <Loader2 className="w-5 h-5 animate-spin" />
                : <Send className="w-5 h-5" />
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
