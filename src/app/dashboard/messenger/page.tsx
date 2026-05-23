'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useStore } from '@/context/StoreContext';
import { db, storage } from '@/lib/firebase/firebase';
import {
  collection, query, where, orderBy,
  onSnapshot, doc, setDoc, serverTimestamp,
} from 'firebase/firestore';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import {
  MessageCircle, Send, Search, ChevronLeft, X,
  MoreVertical, Edit2, Trash2, Paperclip, ChevronUp, ChevronDown,
} from 'lucide-react';
import EmojiPicker, { Theme } from 'emoji-picker-react';

/* ── Types ── */
interface UserProfile { uid: string; name: string; email: string; role: string; }

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
  deletedAt?: any;
  editedAt?: any;
  originalText?: string;
  fileUrl?: string;
  fileName?: string;
  fileType?: string;
}

/* ── Constants & Helpers ── */
const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '👏'];
const escRx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getDateStr = (ts: any): string => {
  if (!ts) return '';
  try {
    const d = ts?.toDate?.() ? ts.toDate() : new Date(ts);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('ko-KR');
  } catch { return ''; }
};

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

/* ════════════════════════════════════════════════════════ */
export default function MessengerPage() {
  const { user } = useAuth();
  const { currentStore } = useStore();

  /* ── Base state ── */
  const [users,         setUsers]         = useState<UserProfile[]>([]);
  const [myRole,        setMyRole]        = useState('');
  const [rooms,         setRooms]         = useState<Room[]>([]);
  const [currentRoom,   setCurrentRoom]   = useState<Room | null>(null);
  const [messages,      setMessages]      = useState<Message[]>([]);
  const [input,         setInput]         = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [isLoading,     setIsLoading]     = useState(false);
  const [showUserList,  setShowUserList]  = useState(false);
  const [view,          setView]          = useState<'list' | 'chat'>('list');

  /* ── Emoji / Reply ── */
  const [showEmojiPicker,     setShowEmojiPicker]     = useState(false);
  const [replyingTo,          setReplyingTo]          = useState<Message | null>(null);
  const [hoveredMsgId,        setHoveredMsgId]        = useState<string | null>(null);
  const [reactionPickerMsgId, setReactionPickerMsgId] = useState<string | null>(null);

  /* ── B: Edit / Delete ── */
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editText,     setEditText]     = useState('');

  /* ── C: Room menu ── */
  const [showRoomMenu, setShowRoomMenu] = useState(false);

  /* ── D: Message search ── */
  const [showMsgSearch,      setShowMsgSearch]      = useState(false);
  const [msgSearchQuery,     setMsgSearchQuery]     = useState('');
  const [msgSearchIdx,       setMsgSearchIdx]       = useState(0);
  const [searchHighlightId,  setSearchHighlightId]  = useState<string | null>(null);

  /* ── A: File upload ── */
  const [isUploading,     setIsUploading]     = useState(false);
  const [uploadProgress,  setUploadProgress]  = useState(0);

  /* ── E: Presence ── */
  const [partnerOnline, setPartnerOnline] = useState(false);

  /* ── Refs ── */
  const messagesEndRef     = useRef<HTMLDivElement>(null);
  const unsubscribeRef     = useRef<(() => void) | null>(null);
  const emojiPickerRef     = useRef<HTMLDivElement>(null);
  const emojiButtonRef     = useRef<HTMLButtonElement>(null);
  const reactionPickerRef  = useRef<HTMLDivElement>(null);
  const roomMenuRef        = useRef<HTMLDivElement>(null);
  const msgRefs            = useRef<Record<string, HTMLDivElement | null>>({});
  const fileInputRef       = useRef<HTMLInputElement>(null);

  /* ── D: computed search results ── */
  const msgSearchResults = useMemo(() => {
    if (!msgSearchQuery.trim()) return [];
    const q = msgSearchQuery.toLowerCase();
    return messages
      .filter(m => !m.deletedAt && m.text?.toLowerCase().includes(q))
      .map(m => m.id);
  }, [messages, msgSearchQuery]);

  /* ── Helpers ── */
  const formatTime = (ts: any) => {
    if (!ts) return '';
    const d = ts?.toDate?.() || new Date(ts);
    return d.toDateString() === new Date().toDateString()
      ? d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
  };

  const getPartner = (room: Room) => {
    const uid = room.members.find(m => m !== user?.uid);
    return users.find(u => u.uid === uid) || { uid: uid || '', name: '알 수 없음', email: '', role: '' };
  };

  /* D: text highlight */
  const highlightText = (text: string): React.ReactNode => {
    if (!msgSearchQuery.trim()) return text;
    const parts = text.split(new RegExp(`(${escRx(msgSearchQuery)})`, 'gi'));
    return (
      <>
        {parts.map((part, i) =>
          part.toLowerCase() === msgSearchQuery.toLowerCase()
            ? <mark key={i} className="bg-yellow-400/40 text-yellow-200 rounded-sm px-0.5 not-italic">{part}</mark>
            : part
        )}
      </>
    );
  };

  /* ══════════════════════════════════════════════
     Effects
  ══════════════════════════════════════════════ */

  /* My role */
  useEffect(() => {
    if (!user?.uid) return;
    fetch(`/api/users?uid=${user.uid}`)
      .then(r => r.json())
      .then(d => setMyRole(d.user?.role || ''))
      .catch(() => {});
  }, [user]);

  /* Users in store */
  useEffect(() => {
    if (!currentStore?.storeId || !user?.uid) return;
    fetch(`/api/users?storeId=${currentStore.storeId}`)
      .then(r => r.json())
      .then(d => setUsers((d.users || []).filter((u: UserProfile) => u.uid !== user.uid)))
      .catch(console.error);
  }, [currentStore, user]);

  /* Room list (realtime) */
  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, 'chat_rooms'),
      where('members', 'array-contains', user.uid),
      where('status', '==', 'active'),
      orderBy('updatedAt', 'desc'),
    );
    return onSnapshot(q, snap => {
      setRooms(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Room[]);
    });
  }, [user]);

  /* Messages + read receipt */
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
      orderBy('createdAt', 'asc'),
    );

    const unsub = onSnapshot(q, snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Message[]);
      if (myUid && snap.docs.some(d => {
        const data = d.data();
        return data.senderUid !== myUid && !(data.readBy || []).includes(myUid);
      })) markRead();
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    });

    unsubscribeRef.current = unsub;
    return () => unsub();
  }, [currentRoom]);

  /* E: Own presence heartbeat */
  useEffect(() => {
    if (!user?.uid) return;
    const presRef = doc(db, 'presence', user.uid);
    const update = (online: boolean) =>
      setDoc(presRef, { online, lastSeen: serverTimestamp() }, { merge: true }).catch(() => {});

    update(true);
    const iv = setInterval(() => update(true), 30_000);
    const onVis = () => update(!document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => { update(false); clearInterval(iv); document.removeEventListener('visibilitychange', onVis); };
  }, [user]);

  /* E: Partner presence */
  useEffect(() => {
    if (!currentRoom) { setPartnerOnline(false); return; }
    const partnerUid = currentRoom.members.find(m => m !== user?.uid);
    if (!partnerUid) return;

    const unsub = onSnapshot(doc(db, 'presence', partnerUid), snap => {
      if (!snap.exists()) { setPartnerOnline(false); return; }
      const { online, lastSeen } = snap.data();
      if (online) { setPartnerOnline(true); return; }
      const last = lastSeen?.toDate?.();
      setPartnerOnline(last ? Date.now() - last.getTime() < 2 * 60_000 : false);
    });

    return () => { unsub(); setPartnerOnline(false); };
  }, [currentRoom, user]);

  /* Outside click handler */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node) &&
        emojiButtonRef.current && !emojiButtonRef.current.contains(e.target as Node)
      ) setShowEmojiPicker(false);
      if (reactionPickerRef.current && !reactionPickerRef.current.contains(e.target as Node))
        setReactionPickerMsgId(null);
      if (roomMenuRef.current && !roomMenuRef.current.contains(e.target as Node))
        setShowRoomMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  /* D: Scroll to search result on idx change */
  useEffect(() => {
    const msgId = msgSearchResults[msgSearchIdx];
    if (!msgId) return;
    setSearchHighlightId(msgId);
    msgRefs.current[msgId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const t = setTimeout(() => setSearchHighlightId(null), 1500);
    return () => clearTimeout(t);
  }, [msgSearchIdx, msgSearchResults]);

  /* ══════════════════════════════════════════════
     Handlers
  ══════════════════════════════════════════════ */

  const handleEnterRoom = async (targetUid: string) => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/messenger/rooms', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: user?.uid, targetUid, storeId: currentStore?.storeId }),
      });
      const data = await res.json();
      if (data.roomId) {
        const room = rooms.find(r => r.id === data.roomId) || {
          id: data.roomId, members: [user?.uid || '', targetUid],
          lastMessage: '', lastMessageAt: null, unreadCount: {},
        } as Room;
        setCurrentRoom(room);
        setView('chat');
        setShowUserList(false);
      }
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); }
  };

  const handleSend = async () => {
    if (!input.trim() || !currentRoom || !user?.uid) return;
    const text = input.trim();
    const replyTo = replyingTo ? {
      messageId: replyingTo.id, senderName: replyingTo.senderName,
      text: replyingTo.text.slice(0, 50), type: 'text' as const,
    } : undefined;
    setInput('');
    setReplyingTo(null);
    await fetch('/api/messenger/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomId: currentRoom.id, senderUid: user.uid,
        senderName: user.displayName || user.email || '나', text, replyTo,
      }),
    }).catch(console.error);
  };

  const handleReaction = async (messageId: string, emoji: string) => {
    if (!user?.uid) return;
    setReactionPickerMsgId(null);
    await fetch('/api/messenger/messages', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'react', messageId, emoji, uid: user.uid }),
    }).catch(console.error);
  };

  /* B: Delete */
  const handleDeleteMsg = async (messageId: string) => {
    if (!confirm('메시지를 삭제하시겠습니까?')) return;
    await fetch('/api/messenger/messages', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', messageId }),
    }).catch(console.error);
  };

  /* B: Save edit */
  const handleSaveEdit = async (messageId: string) => {
    if (!editText.trim()) return;
    await fetch('/api/messenger/messages', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'edit', messageId, text: editText.trim() }),
    }).catch(console.error);
    setEditingMsgId(null);
    setEditText('');
  };

  /* C: Leave room */
  const handleLeaveRoom = async () => {
    if (!currentRoom || !user?.uid) return;
    await fetch('/api/messenger/rooms', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'leave', roomId: currentRoom.id, uid: user.uid }),
    }).catch(console.error);
    setCurrentRoom(null);
    setView('list');
    setShowRoomMenu(false);
  };

  /* C: Archive (superuser) */
  const handleArchiveRoom = async () => {
    if (!currentRoom || myRole !== 'superuser') return;
    if (!confirm('대화방을 아카이브 처리하시겠습니까?')) return;
    await fetch('/api/messenger/rooms', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', roomId: currentRoom.id }),
    }).catch(console.error);
    setCurrentRoom(null);
    setView('list');
    setShowRoomMenu(false);
  };

  /* A: File upload */
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentRoom || !user?.uid) return;
    e.target.value = '';

    if (file.size > 10 * 1024 * 1024) {
      alert('파일 크기는 10MB 이하여야 합니다.');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const path = `chat_files/${currentRoom.id}/${Date.now()}_${file.name}`;
      const ref = storageRef(storage, path);
      const task = uploadBytesResumable(ref, file);

      await new Promise<void>((resolve, reject) => {
        task.on(
          'state_changed',
          snap => setUploadProgress(Math.round(snap.bytesTransferred / snap.totalBytes * 100)),
          reject,
          async () => {
            const url = await getDownloadURL(task.snapshot.ref);
            await fetch('/api/messenger/messages', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                roomId: currentRoom.id, senderUid: user.uid,
                senderName: user.displayName || user.email || '나',
                text: file.name, fileUrl: url, fileName: file.name, fileType: file.type,
              }),
            });
            resolve();
          },
        );
      });
    } catch {
      alert('파일 업로드에 실패했습니다.');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  /* Reply scroll */
  const scrollToMessage = (messageId: string) => {
    const el = msgRefs.current[messageId];
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.style.transition = 'background-color 0.3s ease';
    el.style.backgroundColor = 'rgba(20, 184, 166, 0.15)';
    setTimeout(() => { el.style.backgroundColor = ''; }, 1500);
  };

  const filteredUsers = users.filter(u =>
    u.name.includes(searchKeyword) || u.email.includes(searchKeyword)
  );

  /* ══════════════════════════════════════════════
     JSX
  ══════════════════════════════════════════════ */
  return (
    <div className="flex h-full bg-slate-950 rounded-xl overflow-hidden border border-slate-800">

      {/* ═══════ LEFT: Room list ═══════ */}
      <div className={`
        ${view === 'chat' ? 'hidden md:flex' : 'flex'}
        w-full md:w-80 flex-shrink-0 flex-col bg-slate-900 border-r border-slate-700
      `}>
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-white font-bold text-lg">메신저</h1>
            <button
              onClick={() => setShowUserList(v => !v)}
              className="bg-teal-600 hover:bg-teal-500 text-white p-1.5 rounded-lg transition-colors"
              title="새 대화"
            >
              <MessageCircle className="w-4 h-4" />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text" placeholder="검색"
              value={searchKeyword} onChange={e => setSearchKeyword(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-slate-100 text-sm placeholder:text-slate-500 focus:outline-none focus:border-teal-500 transition-colors"
            />
          </div>
        </div>

        {/* User list (new chat) */}
        {showUserList && (
          <div className="border-b border-slate-700 max-h-52 overflow-y-auto bg-slate-800/50">
            <p className="text-slate-500 text-xs px-4 py-2 font-medium uppercase tracking-wider">대화 상대 선택</p>
            {filteredUsers.length === 0
              ? <p className="text-slate-500 text-sm text-center py-4">같은 매장 직원이 없습니다.</p>
              : filteredUsers.map(u => (
                <button
                  key={u.uid} onClick={() => handleEnterRoom(u.uid)} disabled={isLoading}
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
              ))}
          </div>
        )}

        {/* Room list */}
        <div className="flex-1 overflow-y-auto">
          {rooms.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6">
              <MessageCircle className="w-12 h-12 text-slate-600 mb-3" />
              <p className="text-slate-500 text-sm">대화가 없습니다.</p>
              <p className="text-slate-600 text-xs mt-1">위 아이콘을 눌러 새 대화를 시작하세요.</p>
            </div>
          ) : rooms.map(room => {
            const partner = getPartner(room);
            const unread  = room.unreadCount?.[user?.uid || ''] || 0;
            const isActive = currentRoom?.id === room.id;
            return (
              <button
                key={room.id}
                onClick={() => { setCurrentRoom(room); setView('chat'); }}
                className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-800 transition-colors text-left border-b border-slate-800/50 ${isActive ? 'bg-teal-600/10 border-l-2 border-l-teal-500' : ''}`}
              >
                {/* E: avatar + online dot */}
                <div className="relative flex-shrink-0">
                  <div className="w-11 h-11 rounded-full bg-slate-600 flex items-center justify-center">
                    <span className="text-white font-bold">{partner.name.slice(0, 1)}</span>
                  </div>
                  {isActive && partnerOnline && (
                    <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 rounded-full border-2 border-slate-900" />
                  )}
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
          })}
        </div>
      </div>

      {/* ═══════ RIGHT: Chat area ═══════ */}
      <div className={`${view === 'list' ? 'hidden md:flex' : 'flex'} flex-1 flex-col min-w-0`}>
        {!currentRoom ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <MessageCircle className="w-16 h-16 text-slate-700 mb-4" />
            <p className="text-slate-500 text-lg font-medium">대화를 선택하세요</p>
            <p className="text-slate-600 text-sm mt-1">왼쪽 목록에서 대화 상대를 선택하거나<br />새 대화를 시작하세요.</p>
          </div>
        ) : (
          <>
            {/* ── Chat header ── */}
            <div className="bg-slate-900 border-b border-slate-700 px-4 py-3 flex items-center gap-3">
              <button
                onClick={() => setView('list')}
                className="md:hidden text-slate-400 hover:text-white transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              {/* E: avatar + online dot */}
              <div className="relative flex-shrink-0">
                <div className="w-9 h-9 rounded-full bg-slate-600 flex items-center justify-center">
                  <span className="text-white font-bold text-sm">{getPartner(currentRoom).name.slice(0, 1)}</span>
                </div>
                {partnerOnline && (
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-400 rounded-full border-2 border-slate-900" />
                )}
              </div>

              {/* E: name + status */}
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-sm truncate">{getPartner(currentRoom).name}</p>
                <p className={`text-xs ${partnerOnline ? 'text-green-400' : 'text-slate-500'}`}>
                  {partnerOnline ? '온라인' : '오프라인'}
                </p>
              </div>

              {/* D: message search toggle */}
              <button
                onClick={() => {
                  setShowMsgSearch(v => !v);
                  setMsgSearchQuery('');
                  setMsgSearchIdx(0);
                }}
                className={`p-2 rounded-lg transition-colors ${showMsgSearch ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
                title="메시지 검색"
              >
                <Search className="w-4 h-4" />
              </button>

              {/* C: room menu */}
              <div ref={roomMenuRef} className="relative">
                <button
                  onClick={() => setShowRoomMenu(v => !v)}
                  className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                  title="메뉴"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
                {showRoomMenu && (
                  <div className="absolute right-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-50 min-w-36 overflow-hidden">
                    <button
                      onClick={handleLeaveRoom}
                      className="w-full text-left px-4 py-3 text-sm text-red-400 hover:bg-slate-700 transition-colors"
                    >
                      대화방 나가기
                    </button>
                    {myRole === 'superuser' && (
                      <button
                        onClick={handleArchiveRoom}
                        className="w-full text-left px-4 py-3 text-sm text-orange-400 hover:bg-slate-700 transition-colors border-t border-slate-700"
                      >
                        아카이브 처리
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* D: message search bar */}
            {showMsgSearch && (
              <div className="bg-slate-900 border-b border-slate-700 px-3 py-2 flex items-center gap-2">
                <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <input
                  autoFocus
                  value={msgSearchQuery}
                  onChange={e => { setMsgSearchQuery(e.target.value); setMsgSearchIdx(0); }}
                  placeholder="메시지 검색..."
                  className="flex-1 bg-transparent text-slate-100 text-sm placeholder:text-slate-500 focus:outline-none"
                />
                {msgSearchQuery && (
                  <span className="text-slate-400 text-xs flex-shrink-0">
                    {msgSearchResults.length > 0 ? `${msgSearchIdx + 1}/${msgSearchResults.length}` : '결과 없음'}
                  </span>
                )}
                <button
                  onClick={() => setMsgSearchIdx(i => Math.max(0, i - 1))}
                  disabled={!msgSearchResults.length || msgSearchIdx === 0}
                  className="p-1 text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setMsgSearchIdx(i => Math.min(msgSearchResults.length - 1, i + 1))}
                  disabled={!msgSearchResults.length || msgSearchIdx === msgSearchResults.length - 1}
                  className="p-1 text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
                <button
                  onClick={() => { setShowMsgSearch(false); setMsgSearchQuery(''); setMsgSearchIdx(0); }}
                  className="p-1 text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* A: upload progress */}
            {isUploading && (
              <div className="bg-slate-900 border-b border-slate-700 px-4 py-2 flex items-center gap-3">
                <Paperclip className="w-4 h-4 text-teal-400 flex-shrink-0" />
                <span className="text-slate-400 text-xs">업로드 중... {uploadProgress}%</span>
                <div className="flex-1 h-1 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-teal-500 rounded-full transition-all duration-200"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* ── Messages area ── */}
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
                const showActions = (hoveredMsgId === msg.id || reactionPickerMsgId === msg.id) && !msg.deletedAt;
                const canEdit     = isMine && !msg.deletedAt;
                const canDelete   = !msg.deletedAt && (isMine || myRole === 'superuser');
                const isSearchHit = searchHighlightId === msg.id;
                const isSearchMatch = !!msgSearchQuery.trim() && !msg.deletedAt
                  && msg.text?.toLowerCase().includes(msgSearchQuery.toLowerCase());

                return (
                  <React.Fragment key={msg.id}>
                    {/* Date separator */}
                    {showDateSep && msg.createdAt && (
                      <div className="flex items-center gap-3 py-3">
                        <div className="flex-1 h-px bg-slate-800" />
                        <span className="text-slate-500 text-xs px-2 flex-shrink-0">{formatDateLabel(msg.createdAt)}</span>
                        <div className="flex-1 h-px bg-slate-800" />
                      </div>
                    )}

                    {/* Message row */}
                    <div
                      ref={el => { msgRefs.current[msg.id] = el; }}
                      className={`flex ${isMine ? 'justify-end' : 'justify-start'} py-0.5 rounded-lg transition-colors duration-300 ${isSearchHit ? 'bg-yellow-400/10' : ''}`}
                      onMouseEnter={() => setHoveredMsgId(msg.id)}
                      onMouseLeave={() => { if (!reactionPickerMsgId) setHoveredMsgId(null); }}
                    >
                      {/* isMine: action buttons LEFT of bubble */}
                      {isMine && (
                        <div className={`flex items-end gap-0.5 mr-1 pb-1 flex-shrink-0 transition-opacity ${showActions ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                          {/* B: Edit */}
                          {canEdit && (
                            <button
                              onClick={() => { setEditingMsgId(msg.id); setEditText(msg.text); }}
                              className="text-slate-400 hover:text-teal-400 p-1 rounded-lg hover:bg-slate-700 transition-colors"
                              title="수정"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {/* B: Delete */}
                          {canDelete && (
                            <button
                              onClick={() => handleDeleteMsg(msg.id)}
                              className="text-slate-400 hover:text-red-400 p-1 rounded-lg hover:bg-slate-700 transition-colors"
                              title="삭제"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {/* Reply */}
                          <button
                            onClick={() => setReplyingTo(msg)}
                            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700 transition-colors"
                            title="답글"
                          >↩</button>
                          {/* Reaction */}
                          <div className="relative">
                            <button
                              onClick={() => setReactionPickerMsgId(reactionPickerMsgId === msg.id ? null : msg.id)}
                              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700 transition-colors"
                            >😊</button>
                            {reactionPickerMsgId === msg.id && (
                              <div ref={reactionPickerRef} className="absolute bottom-full right-0 mb-1 z-50 flex gap-1 bg-slate-800 border border-slate-700 rounded-full px-2 py-1.5 shadow-xl">
                                {QUICK_EMOJIS.map(emoji => (
                                  <button key={emoji} onClick={() => handleReaction(msg.id, emoji)}
                                    className="text-lg hover:scale-125 transition-transform leading-none"
                                  >{emoji}</button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Bubble area */}
                      <div className={`flex gap-2 max-w-[70%] ${isMine ? 'flex-row-reverse' : ''}`}>
                        {/* Avatar (partner only) */}
                        {!isMine && (
                          <div className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center flex-shrink-0 self-end">
                            <span className="text-white text-xs font-bold">{msg.senderName.slice(0, 1)}</span>
                          </div>
                        )}

                        <div className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                          {showName && <p className="text-slate-400 text-xs mb-1 ml-1">{msg.senderName}</p>}

                          <div className="flex items-end gap-1.5">
                            {isMine && showTime && (
                              <p className="text-slate-600 text-xs mb-0.5 flex-shrink-0">{formatTime(msg.createdAt)}</p>
                            )}

                            <div className={`px-3 py-2 rounded-2xl text-sm max-w-full break-words
                              ${isMine ? 'bg-teal-600 text-white rounded-tr-sm' : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-tl-sm'}
                              ${isSearchMatch ? 'ring-1 ring-yellow-400/30' : ''}
                            `}>
                              {/* Reply quote */}
                              {msg.replyTo && (
                                <button
                                  onClick={() => scrollToMessage(msg.replyTo!.messageId)}
                                  className={`w-full text-left mb-2 border-l-2 border-teal-400 pl-2 pr-1 py-1 rounded-r block ${isMine ? 'bg-teal-700/40' : 'bg-slate-700/60'}`}
                                >
                                  <p className="text-teal-300 text-[10px] font-semibold truncate">↩ {msg.replyTo.senderName}</p>
                                  <p className="text-xs text-slate-300/80 truncate">{msg.replyTo.text}</p>
                                </button>
                              )}

                              {/* A: Image */}
                              {msg.fileUrl && msg.fileType?.startsWith('image/') && (
                                <img
                                  src={msg.fileUrl}
                                  alt={msg.fileName || '이미지'}
                                  className="max-w-full max-h-48 rounded-lg object-contain cursor-pointer mb-1 block"
                                  onClick={() => window.open(msg.fileUrl, '_blank')}
                                />
                              )}

                              {/* A: File (non-image) */}
                              {msg.fileUrl && !msg.fileType?.startsWith('image/') && (
                                <a
                                  href={msg.fileUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1.5 mb-1 underline opacity-90 max-w-[200px]"
                                >
                                  <Paperclip className="w-3 h-3 flex-shrink-0" />
                                  <span className="truncate text-sm">{msg.fileName || '파일'}</span>
                                </a>
                              )}

                              {/* B: Message content */}
                              {msg.deletedAt ? (
                                <p className="text-slate-400 italic text-sm">삭제된 메시지입니다.</p>
                              ) : editingMsgId === msg.id ? (
                                /* Edit mode */
                                <div className="flex flex-col gap-2 min-w-[160px]">
                                  <textarea
                                    value={editText}
                                    onChange={e => setEditText(e.target.value)}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                                        e.preventDefault();
                                        handleSaveEdit(msg.id);
                                      }
                                      if (e.key === 'Escape') setEditingMsgId(null);
                                    }}
                                    autoFocus
                                    rows={2}
                                    className="bg-transparent border border-teal-400/60 rounded-lg px-2 py-1 text-sm resize-none focus:outline-none focus:border-teal-400"
                                  />
                                  <div className="flex gap-1 justify-end">
                                    <button onClick={() => setEditingMsgId(null)} className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded transition-colors">취소</button>
                                    <button onClick={() => handleSaveEdit(msg.id)} className="text-xs bg-teal-600 hover:bg-teal-500 text-white px-2 py-1 rounded transition-colors">저장</button>
                                  </div>
                                </div>
                              ) : (
                                /* Normal text — hide if file-only (text === fileName) */
                                (!msg.fileUrl || msg.text !== msg.fileName) && (
                                  <span>
                                    {highlightText(msg.text)}
                                    {msg.editedAt && (
                                      <span className="text-[10px] ml-1 opacity-50">(수정됨)</span>
                                    )}
                                  </span>
                                )
                              )}

                              {/* Read receipt */}
                              {isMine && !msg.deletedAt && (
                                <span className={`text-[10px] ml-1 align-bottom ${msg.readBy?.includes(partnerUid) ? 'text-teal-100' : 'text-teal-300/60'}`}>
                                  {msg.readBy?.includes(partnerUid) ? '✓✓' : '✓'}
                                </span>
                              )}
                            </div>

                            {!isMine && showTime && (
                              <p className="text-slate-600 text-xs mb-0.5 flex-shrink-0">{formatTime(msg.createdAt)}</p>
                            )}
                          </div>

                          {/* Reaction bar */}
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

                      {/* !isMine: action buttons RIGHT of bubble */}
                      {!isMine && (
                        <div className={`flex items-end gap-0.5 ml-1 pb-1 flex-shrink-0 transition-opacity ${showActions ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                          {/* Reply */}
                          <button
                            onClick={() => setReplyingTo(msg)}
                            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700 transition-colors"
                            title="답글"
                          >↩</button>
                          {/* Reaction */}
                          <div className="relative">
                            <button
                              onClick={() => setReactionPickerMsgId(reactionPickerMsgId === msg.id ? null : msg.id)}
                              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700 transition-colors"
                            >😊</button>
                            {reactionPickerMsgId === msg.id && (
                              <div ref={reactionPickerRef} className="absolute bottom-full left-0 mb-1 z-50 flex gap-1 bg-slate-800 border border-slate-700 rounded-full px-2 py-1.5 shadow-xl">
                                {QUICK_EMOJIS.map(emoji => (
                                  <button key={emoji} onClick={() => handleReaction(msg.id, emoji)}
                                    className="text-lg hover:scale-125 transition-transform leading-none"
                                  >{emoji}</button>
                                ))}
                              </div>
                            )}
                          </div>
                          {/* B: Delete (superuser can delete others') */}
                          {canDelete && (
                            <button
                              onClick={() => handleDeleteMsg(msg.id)}
                              className="text-slate-400 hover:text-red-400 p-1 rounded-lg hover:bg-slate-700 transition-colors"
                              title="삭제"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </React.Fragment>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Reply preview */}
            {replyingTo && (
              <div className="bg-slate-800/80 border-t border-slate-700 px-4 py-2 flex items-center gap-2">
                <div className="w-0.5 self-stretch bg-teal-500 rounded-full flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-teal-400 text-xs font-medium">↩ {replyingTo.senderName}에게 답글</p>
                  <p className="text-slate-400 text-xs truncate">{replyingTo.text.slice(0, 60)}</p>
                </div>
                <button onClick={() => setReplyingTo(null)} className="text-slate-400 hover:text-white transition-colors flex-shrink-0 p-1">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Input area */}
            <div className="bg-slate-900 border-t border-slate-700 p-3">
              {/* A: hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"
                className="hidden"
                onChange={handleFileSelect}
              />
              <div className="relative">
                {showEmojiPicker && (
                  <div ref={emojiPickerRef} className="absolute bottom-full mb-2 left-0 z-50">
                    <EmojiPicker theme={Theme.DARK} onEmojiClick={e => setInput(p => p + e.emoji)} />
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <button
                    ref={emojiButtonRef}
                    type="button"
                    onClick={() => setShowEmojiPicker(p => !p)}
                    className="text-slate-400 hover:text-teal-400 transition-colors p-2 flex-shrink-0 text-xl leading-none"
                  >😊</button>

                  {/* A: file attach */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="text-slate-400 hover:text-teal-400 disabled:opacity-40 transition-colors p-2 flex-shrink-0"
                    title="파일 첨부 (최대 10MB)"
                  >
                    <Paperclip className="w-5 h-5" />
                  </button>

                  <textarea
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
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
                    disabled={!input.trim() || isUploading}
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
