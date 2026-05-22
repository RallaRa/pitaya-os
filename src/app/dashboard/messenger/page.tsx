'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useStore } from '@/context/StoreContext';
import { db } from '@/lib/firebase/firebase';
import {
  collection, query, where, orderBy,
  onSnapshot,
} from 'firebase/firestore';
import {
  MessageCircle, Send, Search, Loader2, ChevronLeft, X,
} from 'lucide-react';
import EmojiPicker, { Theme } from 'emoji-picker-react';

interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: string;
}

interface Room {
  id: string;
  members: string[];
  lastMessage: string;
  lastMessageAt: any;
  unreadCount: Record<string, number>;
}

interface ReplyTo {
  messageId: string;
  senderName: string;
  text: string;
  type: 'text';
}

interface Message {
  id: string;
  roomId: string;
  senderUid: string;
  senderName: string;
  text: string;
  createdAt: any;
  readBy: string[];
  replyTo?: ReplyTo;
  reactions?: Record<string, string[]>;
}

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '👏'];

// 날짜 문자열 비교용 (YYYY-MM-DD)
const getDateStr = (ts: any): string => {
  if (!ts) return '';
  try {
    const d = ts?.toDate?.() ? ts.toDate() : new Date(ts);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('ko-KR');
  } catch { return ''; }
};

// 날짜 구분선 라벨
const formatDateLabel = (ts: any): string => {
  if (!ts) return '';
  try {
    const d = ts?.toDate?.() ? ts.toDate() : new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return '오늘';
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return '어제';
    return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch { return ''; }
};

export default function MessengerPage() {
  const { user } = useAuth();
  const { currentStore } = useStore();

  const [users,              setUsers]              = useState<UserProfile[]>([]);
  const [rooms,              setRooms]              = useState<Room[]>([]);
  const [currentRoom,        setCurrentRoom]        = useState<Room | null>(null);
  const [messages,           setMessages]           = useState<Message[]>([]);
  const [input,              setInput]              = useState('');
  const [searchKeyword,      setSearchKeyword]      = useState('');
  const [isLoading,          setIsLoading]          = useState(false);
  const [showUserList,       setShowUserList]       = useState(false);
  const [view,               setView]               = useState<'list' | 'chat'>('list');
  const [showEmojiPicker,    setShowEmojiPicker]    = useState(false);
  const [replyingTo,         setReplyingTo]         = useState<Message | null>(null);
  const [hoveredMsgId,       setHoveredMsgId]       = useState<string | null>(null);
  const [reactionPickerMsgId, setReactionPickerMsgId] = useState<string | null>(null);

  const messagesEndRef    = useRef<HTMLDivElement>(null);
  const unsubscribeRef    = useRef<(() => void) | null>(null);
  const emojiPickerRef    = useRef<HTMLDivElement>(null);
  const emojiButtonRef    = useRef<HTMLButtonElement>(null);
  const reactionPickerRef = useRef<HTMLDivElement>(null);
  const msgRefs           = useRef<Record<string, HTMLDivElement | null>>({});

  // 매장 유저 목록 로드
  const loadUsers = async () => {
    if (!currentStore?.storeId || !user?.uid) return;
    try {
      const res = await fetch(`/api/users?storeId=${currentStore.storeId}`);
      const data = await res.json();
      setUsers((data.users || []).filter((u: UserProfile) => u.uid !== user.uid));
    } catch (e) { console.error(e); }
  };

  useEffect(() => { loadUsers(); }, [currentStore, user]);

  // 채팅방 목록 실시간 구독
  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, 'chat_rooms'),
      where('members', 'array-contains', user.uid),
      where('status', '==', 'active'),
      orderBy('updatedAt', 'desc')
    );
    const unsub = onSnapshot(q, snap => {
      setRooms(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Room[]);
    });
    return () => unsub();
  }, [user]);

  // 채팅방 입장 시: readBy 배치 업데이트 + unreadCount 초기화 + 메시지 구독
  useEffect(() => {
    if (!currentRoom) return;

    const myUid = user?.uid;

    const markRead = () => {
      if (!myUid) return;
      fetch('/api/messenger/messages', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'readAll', roomId: currentRoom.id, uid: myUid }),
      }).catch(console.error);
    };

    markRead();

    if (unsubscribeRef.current) unsubscribeRef.current();

    const q = query(
      collection(db, 'chat_messages'),
      where('roomId', '==', currentRoom.id),
      orderBy('createdAt', 'asc')
    );

    const unsub = onSnapshot(q, snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Message[]);

      if (myUid) {
        const hasUnread = snap.docs.some(d => {
          const data = d.data();
          return data.senderUid !== myUid && !(data.readBy || []).includes(myUid);
        });
        if (hasUnread) markRead();
      }

      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    });

    unsubscribeRef.current = unsub;
    return () => unsub();
  }, [currentRoom]);

  // 이모지 피커 / 반응 피커 외부 클릭 시 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node) &&
        emojiButtonRef.current && !emojiButtonRef.current.contains(e.target as Node)
      ) {
        setShowEmojiPicker(false);
      }
      if (reactionPickerRef.current && !reactionPickerRef.current.contains(e.target as Node)) {
        setReactionPickerMsgId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // 채팅방 입장 (새 대화 시작 or 기존 방 열기)
  const handleEnterRoom = async (targetUid: string) => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/messenger/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: user?.uid, targetUid, storeId: currentStore?.storeId }),
      });
      const data = await res.json();
      if (data.roomId) {
        const room = rooms.find(r => r.id === data.roomId) || {
          id: data.roomId,
          members: [user?.uid || '', targetUid],
          lastMessage: '',
          lastMessageAt: null,
          unreadCount: {},
        } as Room;
        setCurrentRoom(room);
        setView('chat');
        setShowUserList(false);
      }
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); }
  };

  // 메시지 전송 (replyTo 포함)
  const handleSend = async () => {
    if (!input.trim() || !currentRoom || !user?.uid) return;
    const text = input.trim();
    const replyTo = replyingTo ? {
      messageId: replyingTo.id,
      senderName: replyingTo.senderName,
      text: replyingTo.text.slice(0, 50),
      type: 'text' as const,
    } : undefined;
    setInput('');
    setReplyingTo(null);
    try {
      await fetch('/api/messenger/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: currentRoom.id,
          senderUid: user.uid,
          senderName: user.displayName || user.email || '나',
          text,
          replyTo,
        }),
      });
    } catch (e) { console.error(e); }
  };

  // 이모지 반응 토글
  const handleReaction = async (messageId: string, emoji: string) => {
    if (!user?.uid) return;
    setReactionPickerMsgId(null);
    fetch('/api/messenger/messages', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'react', messageId, emoji, uid: user.uid }),
    }).catch(console.error);
  };

  // 원본 메시지로 스크롤
  const scrollToMessage = (messageId: string) => {
    const el = msgRefs.current[messageId];
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.style.transition = 'background-color 0.3s ease';
    el.style.backgroundColor = 'rgba(20, 184, 166, 0.15)';
    setTimeout(() => { el.style.backgroundColor = ''; }, 1500);
  };

  const getPartner = (room: Room) => {
    const partnerUid = room.members.find(m => m !== user?.uid);
    return users.find(u => u.uid === partnerUid) || {
      uid: partnerUid || '', name: '알 수 없음', email: '', role: '',
    };
  };

  const formatTime = (ts: any) => {
    if (!ts) return '';
    const d = ts?.toDate?.() || new Date(ts);
    const now = new Date();
    return d.toDateString() === now.toDateString()
      ? d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
  };

  const filteredUsers = users.filter(u =>
    u.name.includes(searchKeyword) || u.email.includes(searchKeyword)
  );

  return (
    <div className="flex h-full bg-slate-950 rounded-xl overflow-hidden border border-slate-800">

      {/* ── 왼쪽: 채팅방 목록 ── */}
      <div className={`
        ${view === 'chat' ? 'hidden md:flex' : 'flex'}
        w-full md:w-80 flex-shrink-0 flex-col bg-slate-900 border-r border-slate-700
      `}>
        <div className="px-4 py-3 border-b border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-white font-bold text-lg">메신저</h1>
            <button
              onClick={() => setShowUserList(!showUserList)}
              className="bg-teal-600 hover:bg-teal-500 text-white p-1.5 rounded-lg transition-colors"
              title="새 대화"
            >
              <MessageCircle className="w-4 h-4" />
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="검색"
              value={searchKeyword}
              onChange={e => setSearchKeyword(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-slate-100 text-sm placeholder:text-slate-500 focus:outline-none focus:border-teal-500 transition-colors"
            />
          </div>
        </div>

        {/* 유저 목록 (새 대화) */}
        {showUserList && (
          <div className="border-b border-slate-700 max-h-52 overflow-y-auto bg-slate-800/50">
            <p className="text-slate-500 text-xs px-4 py-2 font-medium uppercase tracking-wider">대화 상대 선택</p>
            {filteredUsers.length === 0 ? (
              <p className="text-slate-500 text-sm text-center py-4">같은 매장 직원이 없습니다.</p>
            ) : (
              filteredUsers.map(u => (
                <button
                  key={u.uid}
                  onClick={() => handleEnterRoom(u.uid)}
                  disabled={isLoading}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700 transition-colors text-left"
                >
                  <div className="w-9 h-9 rounded-full bg-teal-600 flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-sm font-bold">{u.name.slice(0, 1)}</span>
                  </div>
                  <div>
                    <p className="text-white text-sm font-medium">{u.name}</p>
                    <p className="text-slate-400 text-xs">{u.role}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        )}

        {/* 채팅방 목록 */}
        <div className="flex-1 overflow-y-auto">
          {rooms.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6">
              <MessageCircle className="w-12 h-12 text-slate-600 mb-3" />
              <p className="text-slate-500 text-sm">대화가 없습니다.</p>
              <p className="text-slate-600 text-xs mt-1">위 아이콘을 눌러 새 대화를 시작하세요.</p>
            </div>
          ) : (
            rooms.map(room => {
              const partner = getPartner(room);
              const unread = room.unreadCount?.[user?.uid || ''] || 0;
              return (
                <button
                  key={room.id}
                  onClick={() => { setCurrentRoom(room); setView('chat'); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-800 transition-colors text-left border-b border-slate-800/50 ${currentRoom?.id === room.id ? 'bg-teal-600/10 border-l-2 border-l-teal-500' : ''}`}
                >
                  <div className="w-11 h-11 rounded-full bg-slate-600 flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-bold">{partner.name.slice(0, 1)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <p className="text-white text-sm font-medium truncate">{partner.name}</p>
                      <p className="text-slate-500 text-xs flex-shrink-0 ml-2">{formatTime(room.lastMessageAt)}</p>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-slate-400 text-xs truncate">{room.lastMessage || '대화를 시작하세요'}</p>
                      {unread > 0 && (
                        <span className="bg-teal-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 ml-2 font-bold">
                          {unread > 99 ? '99+' : unread}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── 오른쪽: 채팅 영역 ── */}
      <div className={`${view === 'list' ? 'hidden md:flex' : 'flex'} flex-1 flex-col min-w-0`}>
        {!currentRoom ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <MessageCircle className="w-16 h-16 text-slate-700 mb-4" />
            <p className="text-slate-500 text-lg font-medium">대화를 선택하세요</p>
            <p className="text-slate-600 text-sm mt-1">왼쪽 목록에서 대화 상대를 선택하거나<br/>새 대화를 시작하세요.</p>
          </div>
        ) : (
          <>
            {/* 채팅 헤더 */}
            <div className="bg-slate-900 border-b border-slate-700 px-4 py-3 flex items-center gap-3">
              <button
                onClick={() => setView('list')}
                className="md:hidden text-slate-400 hover:text-white transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="w-9 h-9 rounded-full bg-slate-600 flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold text-sm">{getPartner(currentRoom).name.slice(0, 1)}</span>
              </div>
              <div>
                <p className="text-white font-bold text-sm">{getPartner(currentRoom).name}</p>
                <p className="text-slate-500 text-xs">{getPartner(currentRoom).role}</p>
              </div>
            </div>

            {/* 메시지 영역 */}
            <div className="flex-1 overflow-y-auto p-4 space-y-1 bg-slate-950">
              {messages.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-slate-600 text-sm">대화를 시작해보세요.</p>
                </div>
              )}

              {messages.map((msg, idx) => {
                const isMine      = msg.senderUid === user?.uid;
                const prevMsg     = messages[idx - 1];
                const showDateSep = getDateStr(msg.createdAt) !== getDateStr(prevMsg?.createdAt);
                const showName    = !isMine && prevMsg?.senderUid !== msg.senderUid;
                const showTime    = !messages[idx + 1] || messages[idx + 1].senderUid !== msg.senderUid;
                const partnerUid  = currentRoom?.members.find(m => m !== user?.uid) ?? '';
                const showActions = hoveredMsgId === msg.id || reactionPickerMsgId === msg.id;

                return (
                  <React.Fragment key={msg.id}>
                    {/* 날짜 구분선 */}
                    {showDateSep && msg.createdAt && (
                      <div className="flex items-center gap-3 py-3">
                        <div className="flex-1 h-px bg-slate-800" />
                        <span className="text-slate-500 text-xs px-2 flex-shrink-0">
                          {formatDateLabel(msg.createdAt)}
                        </span>
                        <div className="flex-1 h-px bg-slate-800" />
                      </div>
                    )}

                    {/* 메시지 행 */}
                    <div
                      ref={el => { msgRefs.current[msg.id] = el; }}
                      className={`flex ${isMine ? 'justify-end' : 'justify-start'} py-0.5`}
                      onMouseEnter={() => setHoveredMsgId(msg.id)}
                      onMouseLeave={() => { if (!reactionPickerMsgId) setHoveredMsgId(null); }}
                    >
                      {/* isMine: 액션 버튼이 버블 왼쪽 */}
                      {isMine && (
                        <div className={`flex items-end gap-0.5 mr-1 pb-1 flex-shrink-0 transition-opacity ${showActions ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                          <button
                            onClick={() => setReplyingTo(msg)}
                            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700 transition-colors"
                            title="답글"
                          >↩</button>
                          <div className="relative">
                            <button
                              onClick={() => setReactionPickerMsgId(reactionPickerMsgId === msg.id ? null : msg.id)}
                              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700 transition-colors"
                              title="이모지 반응"
                            >😊</button>
                            {reactionPickerMsgId === msg.id && (
                              <div
                                ref={reactionPickerRef}
                                className="absolute bottom-full right-0 mb-1 z-50 flex gap-1 bg-slate-800 border border-slate-700 rounded-full px-2 py-1.5 shadow-xl"
                              >
                                {QUICK_EMOJIS.map(emoji => (
                                  <button
                                    key={emoji}
                                    onClick={() => handleReaction(msg.id, emoji)}
                                    className="text-lg hover:scale-125 transition-transform leading-none"
                                  >{emoji}</button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* 버블 영역 */}
                      <div className={`flex gap-2 max-w-[70%] ${isMine ? 'flex-row-reverse' : ''}`}>
                        {/* 아바타 (상대방만) */}
                        {!isMine && (
                          <div className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center flex-shrink-0 self-end">
                            <span className="text-white text-xs font-bold">{msg.senderName.slice(0, 1)}</span>
                          </div>
                        )}

                        <div className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                          {showName && (
                            <p className="text-slate-400 text-xs mb-1 ml-1">{msg.senderName}</p>
                          )}
                          <div className="flex items-end gap-1.5">
                            {isMine && showTime && (
                              <p className="text-slate-600 text-xs mb-0.5 flex-shrink-0">{formatTime(msg.createdAt)}</p>
                            )}
                            <div className={`px-3 py-2 rounded-2xl text-sm max-w-full break-words ${isMine ? 'bg-teal-600 text-white rounded-tr-sm' : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-tl-sm'}`}>
                              {/* 답글 인용 블록 */}
                              {msg.replyTo && (
                                <button
                                  onClick={() => scrollToMessage(msg.replyTo!.messageId)}
                                  className={`w-full text-left mb-2 border-l-2 border-teal-400 pl-2 pr-1 py-1 rounded-r block ${
                                    isMine ? 'bg-teal-700/40' : 'bg-slate-700/60'
                                  }`}
                                >
                                  <p className="text-teal-300 text-[10px] font-semibold truncate">↩ {msg.replyTo.senderName}</p>
                                  <p className="text-xs text-slate-300/80 truncate">{msg.replyTo.text}</p>
                                </button>
                              )}
                              {msg.text}
                              {isMine && (
                                <span className={`text-[10px] ml-1 align-bottom ${msg.readBy?.includes(partnerUid) ? 'text-teal-100' : 'text-teal-300/60'}`}>
                                  {msg.readBy?.includes(partnerUid) ? '✓✓' : '✓'}
                                </span>
                              )}
                            </div>
                            {!isMine && showTime && (
                              <p className="text-slate-600 text-xs mb-0.5 flex-shrink-0">{formatTime(msg.createdAt)}</p>
                            )}
                          </div>

                          {/* 이모지 반응 바 */}
                          {msg.reactions && Object.entries(msg.reactions).some(([, uids]) => uids.length > 0) && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {Object.entries(msg.reactions)
                                .filter(([, uids]) => uids.length > 0)
                                .map(([emoji, uids]) => (
                                  <button
                                    key={emoji}
                                    onClick={() => handleReaction(msg.id, emoji)}
                                    className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs border transition-all ${
                                      uids.includes(user?.uid || '')
                                        ? 'border-teal-500 bg-teal-500/20 text-teal-300'
                                        : 'border-slate-700 bg-slate-800/80 text-slate-300 hover:border-slate-500'
                                    }`}
                                  >
                                    <span>{emoji}</span>
                                    <span className="font-medium ml-0.5">{uids.length}</span>
                                  </button>
                                ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* !isMine: 액션 버튼이 버블 오른쪽 */}
                      {!isMine && (
                        <div className={`flex items-end gap-0.5 ml-1 pb-1 flex-shrink-0 transition-opacity ${showActions ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                          <button
                            onClick={() => setReplyingTo(msg)}
                            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700 transition-colors"
                            title="답글"
                          >↩</button>
                          <div className="relative">
                            <button
                              onClick={() => setReactionPickerMsgId(reactionPickerMsgId === msg.id ? null : msg.id)}
                              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700 transition-colors"
                              title="이모지 반응"
                            >😊</button>
                            {reactionPickerMsgId === msg.id && (
                              <div
                                ref={reactionPickerRef}
                                className="absolute bottom-full left-0 mb-1 z-50 flex gap-1 bg-slate-800 border border-slate-700 rounded-full px-2 py-1.5 shadow-xl"
                              >
                                {QUICK_EMOJIS.map(emoji => (
                                  <button
                                    key={emoji}
                                    onClick={() => handleReaction(msg.id, emoji)}
                                    className="text-lg hover:scale-125 transition-transform leading-none"
                                  >{emoji}</button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </React.Fragment>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* 답글 미리보기 */}
            {replyingTo && (
              <div className="bg-slate-800/80 border-t border-slate-700 px-4 py-2 flex items-center gap-2">
                <div className="w-0.5 self-stretch bg-teal-500 rounded-full flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-teal-400 text-xs font-medium">↩ {replyingTo.senderName}에게 답글</p>
                  <p className="text-slate-400 text-xs truncate">{replyingTo.text.slice(0, 60)}</p>
                </div>
                <button
                  onClick={() => setReplyingTo(null)}
                  className="text-slate-400 hover:text-white transition-colors flex-shrink-0 p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* 입력창 */}
            <div className="bg-slate-900 border-t border-slate-700 p-3">
              <div className="relative">
                {showEmojiPicker && (
                  <div ref={emojiPickerRef} className="absolute bottom-full mb-2 left-0 z-50">
                    <EmojiPicker
                      theme={Theme.DARK}
                      onEmojiClick={(e) => setInput(prev => prev + e.emoji)}
                    />
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <button
                    ref={emojiButtonRef}
                    type="button"
                    onClick={() => setShowEmojiPicker(prev => !prev)}
                    className="text-slate-400 hover:text-teal-400 transition-colors p-2 flex-shrink-0 text-xl leading-none"
                  >
                    😊
                  </button>
                  <textarea
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder="메시지 입력... (Enter 전송)"
                    rows={1}
                    className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-100 text-sm placeholder:text-slate-500 focus:outline-none focus:border-teal-500 transition-colors resize-none"
                  />
                  <button
                    onClick={handleSend}
                    disabled={!input.trim()}
                    className="bg-teal-600 hover:bg-teal-500 disabled:bg-slate-700 text-white p-2.5 rounded-xl transition-colors flex-shrink-0"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
