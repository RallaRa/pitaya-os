'use client';

import { useState, useRef, useEffect, useCallback, DragEvent } from 'react';
import { Bot, Send, Loader2, Copy, ExternalLink, Paperclip, Image as ImageIcon, X } from 'lucide-react';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import { compressImageFile } from '@/lib/compressImageClient';
import { AiUsedBadge, type AiMetaDisplay } from '@/components/AiUsedBadge';

interface AttachedImage {
  id: string;
  name: string;
  preview: string;
  content: string;
  mimeType: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  publicUrl?: string;
  ai?: AiMetaDisplay;
  imagePreviews?: string[];
}

interface Props {
  storeId: string;
  sessionId?: string | null;
  onSessionChange: (sessionId: string | null) => void;
  onRefresh: () => void;
}

const QUICK_PROMPTS = [
  '설 특판 회차 만들어줘',
  '한우 등심 50kg 89000원 추가',
  '접수 시작해줘',
  '주문 현황 알려줘',
];

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

export default function PublicOrderAIChat({
  storeId,
  sessionId,
  onSessionChange,
  onRefresh,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content:
        '공개 주문을 **말로** 또는 **사진으로** 만들 수 있습니다.\n\n• 텍스트: 「5월 특판 만들고 등심 50kg 89000원 추가」\n• 사진: 품목 사진 첨부 + 「이 품목 추가해줘」\n• 드래그·붙여넣기·📎 버튼 지원\n\nAI가 품목명·가격을 인식하고 사진을 품목에 연결합니다.',
    },
  ]);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<AttachedImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const addImageFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (!list.length) return;

    const added: AttachedImage[] = [];
    for (const file of list.slice(0, 5 - attachments.length)) {
      try {
        const content = await compressImageFile(file, 1280, 0.82, true);
        added.push({
          id: genId(),
          name: file.name,
          preview: content,
          content,
          mimeType: 'image/jpeg',
        });
      } catch { /* skip */ }
    }
    if (added.length) setAttachments(prev => [...prev, ...added].slice(0, 5));
  }, [attachments.length]);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const f = item.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length) {
        e.preventDefault();
        addImageFiles(files);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addImageFiles]);

  const onDragEnter = (e: DragEvent) => {
    e.preventDefault();
    dragCounter.current += 1;
    setIsDragging(true);
  };
  const onDragLeave = (e: DragEvent) => {
    e.preventDefault();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDragging(false);
    }
  };
  const onDragOver = (e: DragEvent) => e.preventDefault();
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragging(false);
    if (e.dataTransfer.files.length) addImageFiles(e.dataTransfer.files);
  };

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if ((!trimmed && attachments.length === 0) || loading || !storeId) return;

    const previews = attachments.map(a => a.preview);
    const userMsg: ChatMessage = {
      role: 'user',
      content: trimmed || `(사진 ${attachments.length}장)`,
      imagePreviews: previews.length ? previews : undefined,
    };
    setMessages(prev => [...prev, userMsg]);

    const sentAttachments = [...attachments];
    setInput('');
    setAttachments([]);
    setLoading(true);

    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/public-orders/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          storeId,
          sessionId: sessionId || undefined,
          message: trimmed,
          history: messages.slice(-10).map(m => ({ role: m.role, content: m.content })),
          images: sentAttachments.map(a => ({
            fileName: a.name,
            fileContent: a.content,
            mimeType: a.mimeType,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '요청 실패');

      if (data.sessionId) onSessionChange(data.sessionId);
      onRefresh();

      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: data.reply || '처리했습니다.',
          publicUrl: data.publicUrl,
          ai: data.ai,
        },
      ]);
    } catch (e: unknown) {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: `⚠️ ${e instanceof Error ? e.message : '오류가 발생했습니다'}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [loading, storeId, sessionId, messages, attachments, onSessionChange, onRefresh]);

  const copyLink = (url: string) => {
    navigator.clipboard.writeText(url);
  };

  return (
    <div
      className={`flex flex-col h-full bg-slate-900 border-l border-slate-800 relative ${
        isDragging ? 'ring-2 ring-teal-500/50 ring-inset' : ''
      }`}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {isDragging && (
        <div className="absolute inset-0 z-10 bg-teal-950/80 flex items-center justify-center pointer-events-none">
          <p className="text-teal-300 text-sm font-medium flex items-center gap-2">
            <ImageIcon className="w-5 h-5" />
            사진을 놓으면 품목으로 등록
          </p>
        </div>
      )}

      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-800 shrink-0">
        <Bot className="w-4 h-4 text-teal-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-teal-300">AI 공개주문</p>
          <p className="text-[10px] text-slate-500 truncate">말·사진으로 회차·품목 설정</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[92%] rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-teal-600/30 text-teal-100'
                  : 'bg-slate-800 text-slate-200'
              }`}
            >
              {msg.imagePreviews && msg.imagePreviews.length > 0 && (
                <div className="flex gap-1 flex-wrap mb-2">
                  {msg.imagePreviews.map((src, j) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={j}
                      src={src}
                      alt=""
                      className="w-14 h-14 rounded-lg object-cover border border-slate-600/50"
                    />
                  ))}
                </div>
              )}
              {msg.content}
              {msg.publicUrl && (
                <div className="mt-2 pt-2 border-t border-slate-700/60 flex flex-wrap gap-2 items-center">
                  <code className="text-[10px] text-slate-400 truncate max-w-[180px]">{msg.publicUrl}</code>
                  <button
                    type="button"
                    onClick={() => copyLink(msg.publicUrl!)}
                    className="p-1 text-slate-400 hover:text-white"
                    title="링크 복사"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                  <a
                    href={msg.publicUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 text-slate-400 hover:text-white"
                    title="미리보기"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
              {msg.ai && <AiUsedBadge ai={msg.ai} className="mt-2" />}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-slate-800 rounded-xl px-3 py-2 flex items-center gap-2 text-xs text-slate-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-400" />
              {attachments.length ? '사진 분석 중…' : '처리 중…'}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="px-3 py-2 border-t border-slate-800 shrink-0">
        {attachments.length > 0 && (
          <div className="flex gap-1.5 flex-wrap mb-2">
            {attachments.map(a => (
              <div key={a.id} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.preview} alt="" className="w-12 h-12 rounded-lg object-cover border border-slate-700" />
                <button
                  type="button"
                  onClick={() => setAttachments(prev => prev.filter(x => x.id !== a.id))}
                  className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 rounded-full flex items-center justify-center"
                >
                  <X className="w-2.5 h-2.5 text-white" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-1.5 flex-wrap mb-2">
          {QUICK_PROMPTS.map(q => (
            <button
              key={q}
              type="button"
              disabled={loading}
              onClick={() => send(q)}
              className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 px-2 py-1 rounded-lg border border-slate-700/50 disabled:opacity-40"
            >
              {q}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={e => {
              if (e.target.files?.length) addImageFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading || attachments.length >= 5}
            className="shrink-0 p-2 rounded-lg bg-slate-800 border border-slate-700/60 text-slate-400 hover:text-teal-300 disabled:opacity-40"
            title="사진 첨부"
          >
            <Paperclip className="w-3.5 h-3.5" />
          </button>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder="말로 입력하거나 📎로 사진 첨부"
            disabled={loading}
            className="flex-1 bg-slate-800 border border-slate-700/60 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-teal-500/50 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => send(input)}
            disabled={loading || (!input.trim() && attachments.length === 0)}
            className="bg-teal-600 hover:bg-teal-500 disabled:bg-slate-700 text-white px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
