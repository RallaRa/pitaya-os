'use client';

import { useState, useRef, useEffect, useCallback, DragEvent } from 'react';
import {
  Bot, Send, X, Paperclip, FileSpreadsheet, FileText, Loader2,
  Image as ImageIcon, ChevronUp, ChevronDown,
} from 'lucide-react';
import { getAuthHeaders, getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import { compressImageFromDataUrl, compressImageFile } from '@/lib/compressImageClient';
import type { FileAnalysisMeta } from '@/lib/purchaseAiLabels';
import { formatEnsembleReplyBlock, formatFileResultLine } from '@/lib/purchaseAiLabels';
import { logPurchaseAnalysis } from '@/components/purchases/PurchaseAnalysisHistory';
import type { Invoice, AttachedFile as SheetAttachedFile } from './PurchaseSheet';
import CameraCapture from './CameraCapture';

interface AttachedFile {
  id: string;
  name: string;
  type: 'image' | 'pdf' | 'csv' | 'excel';
  content: string;
  preview?: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  files?: { name: string; preview?: string; type: string }[];
}

interface Props {
  onInvoicesFound: (invoices: Invoice[], files: SheetAttachedFile[]) => void;
  storeId?: string;
  onAnalysisLogged?: () => void;
}

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

const MAX_IMAGE_BYTES = 900 * 1024; // OCR용 — 해상도 우선
const BATCH_SAFE_BYTES = 2.5 * 1024 * 1024;
const MAX_FILES_PER_BATCH = 2;
const OCR_MAX_PX = 1536;
const OCR_QUALITY = 0.85;

async function compressImageFileWrapper(file: File): Promise<string> {
  return compressImageFile(file, OCR_MAX_PX, OCR_QUALITY, true);
}

/** 업로드는 한 번에, API 요청은 용량 한도 내 배치로 분할 */
function splitFilesIntoBatches(files: AttachedFile[]): AttachedFile[][] {
  const batches: AttachedFile[][] = [];
  let current: AttachedFile[] = [];
  let currentSize = 0;

  const flush = () => {
    if (current.length) {
      batches.push(current);
      current = [];
      currentSize = 0;
    }
  };

  for (const file of files) {
    const fileSize = (file.content?.length || 0) + 320;
    const isHeavy = file.type === 'pdf' || fileSize > BATCH_SAFE_BYTES * 0.55;

    if (isHeavy) {
      flush();
      batches.push([file]);
      continue;
    }

    if (
      current.length > 0
      && (currentSize + fileSize > BATCH_SAFE_BYTES || current.length >= MAX_FILES_PER_BATCH)
    ) {
      flush();
    }

    current.push(file);
    currentSize += fileSize;
  }

  flush();
  return batches.length ? batches : [files];
}

async function shrinkImageDataUrl(dataUrl: string): Promise<string> {
  let result = await compressImageFromDataUrl(dataUrl, OCR_MAX_PX, OCR_QUALITY, true);
  let px = OCR_MAX_PX;
  let q = OCR_QUALITY;
  while (result.length > MAX_IMAGE_BYTES && (q > 0.5 || px > 1024)) {
    if (q > 0.5) q = Math.round((q - 0.08) * 100) / 100;
    else px = Math.round(px * 0.9);
    result = await compressImageFromDataUrl(result, px, q, true);
  }
  return result;
}

function detectFileType(f: File): 'image' | 'pdf' | 'csv' | 'excel' {
  if (f.type.startsWith('image/')) return 'image';
  if (f.type === 'application/pdf') return 'pdf';
  if (f.name.endsWith('.csv') || f.type === 'text/csv') return 'csv';
  return 'excel';
}

function readFile(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    if (f.name.endsWith('.csv') || f.type === 'text/csv') {
      reader.readAsText(f, 'utf-8');
    } else {
      reader.readAsDataURL(f);
    }
  });
}

const QUICK_PROMPTS = ['단가 검토해줘', '누락 항목 확인', '총액 계산해줘'];

export default function PurchaseAIChat({ onInvoicesFound, storeId = '', onAnalysisLogged }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: '거래명세서·세금계산서 이미지나 파일을 첨부해 주세요. AI가 자동 분석합니다.\n\n📷 **인식 잘 되는 촬영 팁**\n• 밝은 곳에서 그림자 없이 촬영\n• 문서 전체가 화면에 들어오게 (기울이지 않기)\n• 흐릿하면 카메라 초점 맞춘 뒤 다시 촬영\n• PDF 원본이 있으면 이미지보다 PDF가 더 정확합니다\n\n여러 장을 한 번에 올려도 파일별로 순차 분석합니다.\n드래그 앤 드랍 · Ctrl+V 붙여넣기 · 파일 선택 모두 지원합니다.',
    },
  ]);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<AttachedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [qualityNotes, setQualityNotes] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const dragCounter = useRef(0);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const addFiles = useCallback(async (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter(f =>
      f.type.startsWith('image/') ||
      f.type === 'application/pdf' ||
      f.name.endsWith('.csv') ||
      f.name.endsWith('.xlsx') ||
      f.name.endsWith('.xls') ||
      f.type === 'text/csv'
    );
    if (!files.length) return;

    const newItems: AttachedFile[] = await Promise.all(
      files.map(async f => {
        const type = detectFileType(f);
        let content = type === 'image'
          ? await compressImageFileWrapper(f).catch(() => '')
          : await readFile(f).catch(() => '');
        return {
          id: genId(),
          name: f.name,
          type,
          content,
          preview: type === 'image' ? content : undefined,
        };
      })
    );
    setAttachments(prev => [...prev, ...newItems.filter(a => a.content)]);
  }, []);

  // Drag & drop on panel
  const handleDragEnter = (e: DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    if (e.dataTransfer.items.length > 0) setIsDragging(true);
  };
  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    dragCounter.current = Math.max(0, dragCounter.current - 1);
    if (dragCounter.current === 0) setIsDragging(false);
  };
  const handleDragOver = (e: DragEvent) => { e.preventDefault(); };
  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  };

  // Clipboard paste (global while mounted)
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items || []);
      const imageFiles = items
        .filter(item => item.type.startsWith('image/'))
        .map(item => item.getAsFile())
        .filter(Boolean) as File[];
      if (imageFiles.length > 0) addFiles(imageFiles);
    };
    document.addEventListener('paste', handler);
    return () => document.removeEventListener('paste', handler);
  }, [addFiles]);

  const removeAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text && attachments.length === 0) return;
    if (loading) return;

    const sentFiles = [...attachments];
    const userMsg: ChatMessage = {
      role: 'user',
      content: text || '파일을 분석해 주세요.',
      files: sentFiles.map(a => ({ name: a.name, preview: a.preview, type: a.type })),
    };
    setMessages(prev => [...prev, userMsg, { role: 'assistant', content: '' }]);
    setInput('');
    setAttachments([]);
    setLoading(true);

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      if (sentFiles.length > 0) {
        // 전송 직전 이미지 재압축
        for (let i = 0; i < sentFiles.length; i++) {
          const f = sentFiles[i];
          if (f.type === 'image' && f.content.startsWith('data:image')) {
            sentFiles[i] = { ...f, content: await shrinkImageDataUrl(f.content) };
          }
        }

        const batches = splitFilesIntoBatches(sentFiles);
        const headers = await getAuthJsonHeaders();
        const allInvoices: Invoice[] = [];
        const allQualities: unknown[] = [];
        const allFileResults: FileAnalysisMeta[] = [];
        const batchErrors: string[] = [];

        const batchReplies: string[] = [];

        for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
          const batch = batches[batchIdx];
          const batchLabel = batch.map(f => f.name).join(', ');

          setMessages(prev => {
            const next = [...prev];
            next[next.length - 1] = {
              role: 'assistant',
              content: batches.length > 1
                ? `📄 분석 중... (${batchIdx + 1}/${batches.length})\n${batchLabel}`
                : '',
            };
            return next;
          });

          try {
            const res = await fetch('/api/purchases/analyze-multi', {
              method: 'POST',
              headers,
              body: JSON.stringify({
                files: batch.map(f => ({ content: f.content, name: f.name, type: f.type })),
                message: batchIdx === 0 ? (text || undefined) : undefined,
                storeId: storeId || undefined,
              }),
              signal: abortRef.current.signal,
            });

            if (res.status === 413) {
              throw new Error('이미지 용량이 너무 큽니다.');
            }

            const raw = await res.text();
            let data: {
              error?: string;
              reply?: string;
              invoices?: Invoice[];
              qualities?: unknown[];
              fileResults?: FileAnalysisMeta[];
              detail?: string;
              confidence?: number;
            };
            try {
              data = raw ? JSON.parse(raw) : {};
            } catch {
              throw new Error(`서버 응답 오류 (${res.status})`);
            }

            if (!res.ok) {
              const detail = data.detail ? ` (${String(data.detail).slice(0, 100)})` : '';
              throw new Error((data.error || data.detail || 'API 오류') + detail);
            }

            if (data.invoices?.length) {
              allInvoices.push(...data.invoices);
              onInvoicesFound(data.invoices, batch.map(f => ({
                name: f.name,
                type: f.type,
                content: f.content,
                preview: f.preview,
              })));
            }

            if (data.fileResults?.length) {
              allFileResults.push(...data.fileResults);
            }

            if (data.reply) {
              batchReplies.push(data.reply);
            }

            if (data.qualities?.length) {
              allQualities.push(...data.qualities);
            }
          } catch (batchErr: any) {
            if (batchErr.name === 'AbortError') throw batchErr;
            batchErrors.push(`${batchLabel}: ${batchErr.message || '분석 실패'}`);
          }

          if (batchIdx < batches.length - 1) {
            await new Promise(r => setTimeout(r, 400));
          }
        }

        let reply = batchReplies.length > 0
          ? batchReplies[batchReplies.length - 1]
          : allInvoices.length > 0
            ? `${allInvoices.length}건의 매입 내역을 추출했습니다. 시트에서 내용을 확인·수정 후 저장하세요.`
            : '문서에서 매입 내역을 추출하지 못했습니다.\n\n💡 **다시 시도 팁**\n• 더 밝고 선명한 사진 (또는 PDF 원본)\n• 문서가 잘리지 않았는지 확인\n• "품목명, 수량, 금액이 보이게 다시 분석해줘"라고 함께 입력';

        if (batches.length > 1 && allInvoices.length > 0) {
          reply = `${sentFiles.length}개 파일을 ${batches.length}회 나눠 분석했습니다.\n${allInvoices.length}건 추출 완료.`;
          const ensembleBlock = formatEnsembleReplyBlock(allFileResults);
          if (ensembleBlock) reply += ensembleBlock;
        }

        if (batchErrors.length > 0) {
          reply += `\n\n⚠️ ${batchErrors.length}개 배치 실패:\n${batchErrors.join('\n')}`;
        }

        if (!batchReplies.length && allFileResults.length > 0 && !formatEnsembleReplyBlock(allFileResults)) {
          reply += `\n\n🏷️ **AI 분석 이력**\n${allFileResults.map(formatFileResultLine).join('\n')}`;
        }

        await logPurchaseAnalysis({
          storeId,
          userMessage: text || '파일을 분석해 주세요.',
          fileNames: sentFiles.map(f => f.name),
          fileResults: allFileResults,
          invoiceCount: allInvoices.length,
          suppliers: [...new Set(allInvoices.map(i => i.supplierName).filter(Boolean))],
          success: allInvoices.length > 0,
          errors: batchErrors,
        });
        onAnalysisLogged?.();

        setMessages(prev => {
          const next = [...prev];
          next[next.length - 1] = { role: 'assistant', content: reply };
          return next;
        });

        if (allQualities.length) {
          const notes = allQualities
            .filter((q: any) => q.quality !== 'good')
            .map((q: any) => `⚠️ ${q.fileName}: ${q.feedback || q.issues?.join(', ') || '품질 낮음'} (${q.confidence ?? '?'}%)`);
          setQualityNotes(notes);
        }
      } else {
        // 텍스트 전용 — Groq SSE 스트리밍
        const headers = await getAuthHeaders();
        const res = await fetch('/api/purchases/ai-panel', {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            context: { currentPage: 'register' },
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
          for (const line of chunk.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6).trim();
            if (raw === '[DONE]') break;
            try {
              const delta = JSON.parse(raw).choices?.[0]?.delta?.content || '';
              full += delta;
              setMessages(prev => {
                const next = [...prev];
                next[next.length - 1] = { role: 'assistant', content: full };
                return next;
              });
            } catch { /* skip */ }
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        const msg = err.message || '';
        let userMsg = '⚠️ 오류가 발생했습니다. 다시 시도해 주세요.';
        if (msg.includes('503') || msg.includes('overloaded')) userMsg = '⚠️ Gemini 서버가 혼잡합니다. 잠시 후 재시도해주세요.';
        else if (msg.includes('429') || msg.includes('모든 AI API')) userMsg = '⚠️ AI API 요청 한도를 초과했습니다. Gemini → Claude → Groq 순으로 재시도했으나 실패했습니다. 잠시 후 다시 시도해주세요.';
        else if (msg.includes('413') || msg.includes('용량이 너무')) userMsg = `⚠️ ${msg}`;
        else if (msg.includes('400')) userMsg = '⚠️ 이미지 처리 오류입니다. 다른 파일을 시도해주세요.';
        else if (msg.includes('GEMINI_API_KEY') || msg.includes('API_KEY')) userMsg = '⚠️ GEMINI_API_KEY가 설정되지 않았습니다. 관리자에게 문의하세요.';
        else if (msg.includes('Unauthorized') || msg.includes('401')) userMsg = '⚠️ 인증이 만료됐습니다. 다시 로그인해주세요.';
        else if (msg && msg !== 'API 오류') userMsg = `⚠️ ${msg}`;
        setMessages(prev => {
          const next = [...prev];
          next[next.length - 1] = { role: 'assistant', content: userMsg };
          return next;
        });
      }
    } finally {
      setLoading(false);
    }
  }, [input, attachments, loading, messages, onInvoicesFound, storeId, onAnalysisLogged]);

  return (
    <div
      className="relative flex flex-col h-full bg-slate-900 border-l border-slate-800/60"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* 드래그 오버레이 */}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-teal-500/10 border-2 border-teal-400 border-dashed rounded-r-lg flex flex-col items-center justify-center pointer-events-none gap-3">
          <ImageIcon className="w-10 h-10 text-teal-400" />
          <p className="text-teal-300 font-medium text-sm">파일을 여기에 놓으세요</p>
          <p className="text-teal-500 text-xs">이미지, PDF, CSV, Excel</p>
        </div>
      )}

      {/* 헤더 */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-700/60 shrink-0">
        <Bot className="w-4 h-4 text-teal-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-teal-300">AI 매입 분석</p>
          <p className="text-[10px] text-slate-500">파일 첨부 또는 질문 입력</p>
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
          {/* 대화 영역 */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[92%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-teal-600/30 text-teal-100'
                    : 'bg-slate-800 text-slate-200'
                }`}>
                  {/* 첨부파일 썸네일 */}
                  {msg.files && msg.files.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-1.5">
                      {msg.files.map((f, fi) => (
                        <div key={fi} className="flex items-center gap-1 bg-slate-700/60 rounded-lg px-2 py-1 max-w-[120px]">
                          {f.preview ? (
                            <img src={f.preview} alt="" className="w-8 h-8 object-cover rounded" />
                          ) : f.type === 'pdf' ? (
                            <FileText className="w-4 h-4 text-red-400 shrink-0" />
                          ) : (
                            <FileSpreadsheet className="w-4 h-4 text-green-400 shrink-0" />
                          )}
                          <span className="text-[10px] text-slate-300 truncate">{f.name}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {msg.content ? (
                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  ) : loading && i === messages.length - 1 && msg.role === 'assistant' ? (
                    <span className="inline-flex gap-0.5 items-center h-4">
                      {[0, 150, 300].map(d => (
                        <span
                          key={d}
                          className="w-1 h-1 bg-teal-400 rounded-full animate-bounce"
                          style={{ animationDelay: `${d}ms` }}
                        />
                      ))}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* 퀵 프롬프트 */}
          <div className="px-3 py-1.5 border-t border-slate-700/40 shrink-0">
            <div className="flex gap-1.5 flex-wrap">
              {QUICK_PROMPTS.map(q => (
                <button
                  key={q}
                  onClick={() => setInput(q)}
                  disabled={loading}
                  className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 px-2 py-1 rounded-lg border border-slate-700/50 transition-colors disabled:opacity-40"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* 첨부파일 미리보기 */}
          {attachments.length > 0 && (
            <div className="px-3 py-2 border-t border-slate-700/40 shrink-0">
              <div className="flex flex-wrap gap-2">
                {attachments.map(a => (
                  <div key={a.id} className="relative group">
                    {a.preview ? (
                      <img
                        src={a.preview}
                        alt={a.name}
                        className="w-14 h-14 object-cover rounded-lg border border-slate-700"
                      />
                    ) : (
                      <div className="w-14 h-14 bg-slate-800 rounded-lg border border-slate-700 flex flex-col items-center justify-center gap-1">
                        {a.type === 'pdf'
                          ? <FileText className="w-5 h-5 text-red-400" />
                          : <FileSpreadsheet className="w-5 h-5 text-green-400" />}
                        <span className="text-[9px] text-slate-500 font-medium">
                          {a.name.split('.').pop()?.toUpperCase()}
                        </span>
                      </div>
                    )}
                    <button
                      onClick={() => removeAttachment(a.id)}
                      className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-slate-600 hover:bg-red-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-2.5 h-2.5 text-white" />
                    </button>
                    <p className="text-[9px] text-slate-600 truncate w-14 text-center mt-0.5">
                      {a.name.length > 10 ? a.name.slice(0, 8) + '…' : a.name}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* OCR 품질 피드백 */}
          {qualityNotes.length > 0 && (
            <div className="px-3 py-2 border-t border-slate-700/40 shrink-0 space-y-1">
              {qualityNotes.map((n, i) => (
                <p key={i} className="text-[11px] text-yellow-400/90 bg-yellow-900/20 border border-yellow-800/30 rounded-lg px-2 py-1">{n}</p>
              ))}
            </div>
          )}

          {/* 입력 영역 */}
          <div className="px-3 pb-3 pt-2 shrink-0 border-t border-slate-700/40">
            <div className="flex gap-2 items-center">
              <div className="relative shrink-0">
                <button
                  onClick={() => setShowAttachMenu(v => !v)}
                  disabled={loading}
                  className="w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-500 text-white text-xl flex items-center justify-center disabled:opacity-40"
                >
                  +
                </button>
                {showAttachMenu && (
                  <div className="absolute bottom-12 left-0 bg-slate-900 border border-slate-700 rounded-xl shadow-xl overflow-hidden w-44 z-50">
                    <label className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800 cursor-pointer border-b border-slate-800 text-sm text-slate-200">
                      📁 파일 첨부
                      <input type="file" multiple accept="image/*,.pdf,.xlsx,.xls,.csv" className="hidden"
                        onChange={e => { if (e.target.files) addFiles(e.target.files); setShowAttachMenu(false); e.target.value = ''; }} />
                    </label>
                    <button type="button" onClick={() => { setShowCamera(true); setShowAttachMenu(false); }}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-800 border-b border-slate-800 text-sm text-slate-200">
                      📷 카메라 촬영
                    </button>
                    <button type="button" onClick={async () => {
                      setShowAttachMenu(false);
                      try {
                        const items = await navigator.clipboard.read();
                        for (const item of items) {
                          for (const type of item.types) {
                            if (type.startsWith('image/')) {
                              const blob = await item.getType(type);
                              await addFiles([new File([blob], `clip_${Date.now()}.png`, { type })]);
                              return;
                            }
                          }
                        }
                      } catch { /* ignore */ }
                    }}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-800 text-sm text-slate-200">
                      📋 클립보드
                    </button>
                  </div>
                )}
              </div>
              <CameraCapture
                hideTrigger
                batchMode
                open={showCamera}
                onOpenChange={setShowCamera}
                onCapture={file => addFiles([file])}
                onCaptureBatch={files => addFiles(files)}
              />
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder={attachments.length > 0 ? '메시지 추가 (선택)...' : '질문 입력 또는 파일 첨부...'}
                disabled={loading}
                className="flex-1 bg-slate-800 border border-slate-700/60 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-teal-500/50 disabled:opacity-50 min-w-0"
              />
              <button
                onClick={send}
                disabled={loading || (!input.trim() && attachments.length === 0)}
                className="bg-teal-600 hover:bg-teal-500 disabled:bg-slate-700 text-white p-2 rounded-lg transition-colors disabled:opacity-50 shrink-0"
              >
                {loading
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Send className="w-3.5 h-3.5" />}
              </button>
            </div>
            <p className="text-[10px] text-slate-700 mt-1.5 text-center">
              드래그 앤 드랍 · Ctrl+V 붙여넣기 지원
            </p>
          </div>
        </>
      )}
    </div>
  );
}
