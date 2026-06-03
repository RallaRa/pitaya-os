'use client';

import { useState, useRef, useEffect, useCallback, DragEvent, ClipboardEvent as ReactClipboardEvent } from 'react';
import { Bot, Send, Loader2, Copy, ExternalLink, Paperclip, Image as ImageIcon, X } from 'lucide-react';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import { compressImageFile } from '@/lib/compressImageClient';
import { extractImageFilesFromClipboard } from '@/lib/clipboardImages';
import { AiUsedBadge, type AiMetaDisplay } from '@/components/AiUsedBadge';

interface AttachedImage {
  id: string;
  name: string;
  preview: string;
  content: string;
  mimeType: string;
}

type JobStatus = 'queued' | 'processing' | 'done' | 'error';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  status?: JobStatus;
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

const MAX_CONCURRENT = 3;
const MAX_QUEUE = 20;

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
      id: 'welcome',
      role: 'assistant',
      content:
        '공개 주문을 **말로** 또는 **사진으로** 만들 수 있습니다.\n\n• 여러 건을 **연속으로 보내도** 백그라운드에서 병렬 처리됩니다 (최대 3건 동시)\n• 처리 중에도 다른 사진·명령을 계속 올리세요\n\n• 텍스트: 「5월 특판 만들고 등심 50kg 89000원 추가」\n• 사진: 품목 사진 첨부 + 「이 품목 추가해줘」',
    },
  ]);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<AttachedImage[]>([]);
  const [queueStats, setQueueStats] = useState({ queued: 0, processing: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragCounter = useRef(0);
  const [pasteHint, setPasteHint] = useState<string | null>(null);

  const sessionIdRef = useRef(sessionId);
  const messagesRef = useRef(messages);
  const activeCountRef = useRef(0);
  const jobQueueRef = useRef<Array<() => Promise<void>>>([]);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      onRefresh();
      refreshTimerRef.current = null;
    }, 600);
  }, [onRefresh]);

  const updateMessage = useCallback((id: string, patch: Partial<ChatMessage>) => {
    setMessages(prev => prev.map(m => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  const pumpQueue = useCallback(() => {
    while (activeCountRef.current < MAX_CONCURRENT && jobQueueRef.current.length > 0) {
      const run = jobQueueRef.current.shift()!;
      activeCountRef.current += 1;
      setQueueStats({
        queued: jobQueueRef.current.length,
        processing: activeCountRef.current,
      });
      run()
        .catch(() => {})
        .finally(() => {
          activeCountRef.current -= 1;
          setQueueStats({
            queued: jobQueueRef.current.length,
            processing: activeCountRef.current,
          });
          pumpQueue();
        });
    }
    setQueueStats({
      queued: jobQueueRef.current.length,
      processing: activeCountRef.current,
    });
  }, []);

  const enqueueJob = useCallback((run: () => Promise<void>) => {
    if (jobQueueRef.current.length >= MAX_QUEUE) {
      setMessages(prev => [
        ...prev,
        {
          id: genId(),
          role: 'assistant',
          content: '⚠️ 대기열이 가득 찼습니다. 잠시 후 다시 시도해 주세요.',
          status: 'error',
        },
      ]);
      return;
    }
    jobQueueRef.current.push(run);
    setQueueStats({
      queued: jobQueueRef.current.length,
      processing: activeCountRef.current,
    });
    pumpQueue();
  }, [pumpQueue]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, queueStats]);

  const addImageFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files).filter(
      f => f.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|heic|heif)$/i.test(f.name),
    );
    if (!list.length) return;

    const room = Math.max(0, 5 - attachments.length);
    const added: AttachedImage[] = [];
    let failed = 0;
    for (const file of list.slice(0, room)) {
      try {
        const content = await compressImageFile(file, 1280, 0.82, true);
        added.push({
          id: genId(),
          name: file.name || 'pasted-image.jpg',
          preview: content,
          content,
          mimeType: 'image/jpeg',
        });
      } catch {
        failed += 1;
      }
    }
    if (added.length) {
      setAttachments(prev => [...prev, ...added].slice(0, 5));
      setPasteHint(null);
    } else if (failed > 0) {
      setPasteHint('이미지를 불러오지 못했습니다. 다시 붙여넣거나 📎로 선택해 주세요.');
    }
  }, [attachments.length]);

  const applyClipboardPaste = useCallback((dt: DataTransfer | null) => {
    const files = extractImageFilesFromClipboard(dt);
    if (!files.length) return false;
    void addImageFiles(files);
    return true;
  }, [addImageFiles]);

  const handlePaste = useCallback((e: ReactClipboardEvent<HTMLElement>) => {
    if (applyClipboardPaste(e.clipboardData)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, [applyClipboardPaste]);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (!panelRef.current) return;
      if (applyClipboardPaste(e.clipboardData)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener('paste', onPaste, true);
    return () => document.removeEventListener('paste', onPaste, true);
  }, [applyClipboardPaste]);

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

  const runChatJob = useCallback(async (
    assistantId: string,
    trimmed: string,
    sentAttachments: AttachedImage[],
  ) => {
    updateMessage(assistantId, { status: 'processing', content: '⏳ 처리 중…' });

    const history = messagesRef.current
      .filter(m => m.status === 'done' || m.role === 'user')
      .slice(-10)
      .map(m => ({ role: m.role, content: m.content }));

    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/public-orders/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          storeId,
          sessionId: sessionIdRef.current || undefined,
          message: trimmed,
          history,
          images: sentAttachments.map(a => ({
            fileName: a.name,
            fileContent: a.content,
            mimeType: a.mimeType,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '요청 실패');

      if (data.sessionId) {
        sessionIdRef.current = data.sessionId;
        onSessionChange(data.sessionId);
      }
      scheduleRefresh();

      updateMessage(assistantId, {
        status: 'done',
        content: data.reply || '처리했습니다.',
        publicUrl: data.publicUrl,
        ai: data.ai,
      });
    } catch (e: unknown) {
      updateMessage(assistantId, {
        status: 'error',
        content: `⚠️ ${e instanceof Error ? e.message : '오류가 발생했습니다'}`,
      });
    }
  }, [storeId, onSessionChange, scheduleRefresh, updateMessage]);

  const send = useCallback((text: string) => {
    const trimmed = text.trim();
    if ((!trimmed && attachments.length === 0) || !storeId) return;

    const previews = attachments.map(a => a.preview);
    const userId = genId();
    const assistantId = genId();

    setMessages(prev => [
      ...prev,
      {
        id: userId,
        role: 'user',
        content: trimmed || `(사진 ${attachments.length}장)`,
        imagePreviews: previews.length ? previews : undefined,
        status: 'done',
      },
      {
        id: assistantId,
        role: 'assistant',
        content: '📋 대기열에 추가됨',
        status: 'queued',
      },
    ]);

    const sentAttachments = [...attachments];
    setInput('');
    setAttachments([]);

    enqueueJob(() => runChatJob(assistantId, trimmed, sentAttachments));
  }, [attachments, storeId, enqueueJob, runChatJob]);

  const copyLink = (url: string) => {
    navigator.clipboard.writeText(url);
  };

  const busy = queueStats.queued + queueStats.processing > 0;

  return (
    <div
      ref={panelRef}
      className={`flex flex-col h-full bg-slate-900 border-l border-slate-800 relative ${
        isDragging ? 'ring-2 ring-teal-500/50 ring-inset' : ''
      }`}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onPaste={handlePaste}
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
          <p className="text-[10px] text-slate-500 truncate">
            {busy
              ? `처리 중 ${queueStats.processing} · 대기 ${queueStats.queued}`
              : '말·사진으로 회차·품목 설정 · 병렬 처리'}
          </p>
        </div>
        {busy && (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-400 shrink-0" />
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[92%] rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-teal-600/30 text-teal-100'
                  : msg.status === 'error'
                    ? 'bg-red-950/40 text-red-200 border border-red-800/40'
                    : msg.status === 'queued'
                      ? 'bg-slate-800/60 text-slate-400 border border-dashed border-slate-600'
                      : msg.status === 'processing'
                        ? 'bg-slate-800 text-slate-300 border border-teal-700/40'
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
              <div className="flex items-start gap-2">
                {(msg.status === 'queued' || msg.status === 'processing') && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-400 shrink-0 mt-0.5" />
                )}
                <span className="flex-1">{msg.content}</span>
              </div>
              {msg.publicUrl && msg.status === 'done' && (
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
              {msg.ai && msg.status === 'done' && <AiUsedBadge ai={msg.ai} className="mt-2" />}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="px-3 py-2 border-t border-slate-800 shrink-0">
        {pasteHint && (
          <p className="text-[10px] text-amber-400/90 mb-2">{pasteHint}</p>
        )}
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
              onClick={() => send(q)}
              className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 px-2 py-1 rounded-lg border border-slate-700/50"
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
            disabled={attachments.length >= 5}
            className="shrink-0 p-2 rounded-lg bg-slate-800 border border-slate-700/60 text-slate-400 hover:text-teal-300 disabled:opacity-40"
            title="사진 첨부"
          >
            <Paperclip className="w-3.5 h-3.5" />
          </button>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onPaste={handlePaste}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder={busy ? '계속 입력·사진 추가 가능' : '말로 입력 · 📎첨부 · 사진 붙여넣기(Ctrl+V)'}
            className="flex-1 bg-slate-800 border border-slate-700/60 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-teal-500/50"
          />
          <button
            type="button"
            onClick={() => send(input)}
            disabled={!input.trim() && attachments.length === 0}
            className="bg-teal-600 hover:bg-teal-500 disabled:bg-slate-700 text-white px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
