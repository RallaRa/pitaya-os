'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  X, Plus, Loader2, Paperclip, Trash2, Pencil, Save, FileText, Download,
} from 'lucide-react';
import { getAuthHeaders } from '@/lib/getAuthHeaders';
import {
  type CustomerRequestLog,
  type RequestAttachment,
  dayOfWeekFromYMD,
  defaultRequestForm,
} from '@/lib/customerRequestLog';

interface Props {
  storeId: string;
  cusCode: string;
  customerLabel: string;
  onClose: () => void;
}

type FormState = {
  requestDate: string;
  requestTime: string;
  dayOfWeek: string;
  content: string;
  attachments: RequestAttachment[];
};

function formatDt(iso: string) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('ko-KR');
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function CustomerRequestPanel({ storeId, cusCode, customerLabel, onClose }: Props) {
  const [requests, setRequests] = useState<CustomerRequestLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showForm, setShowForm] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(defaultRequestForm());
  const fileRef = useRef<HTMLInputElement>(null);

  const loadRequests = useCallback(async () => {
    if (!storeId || !cusCode) return;
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `/api/customers/requests?storeId=${encodeURIComponent(storeId)}&cusCode=${encodeURIComponent(cusCode)}`,
        { headers },
      );
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setRequests(d.requests || []);
    } catch (e) {
      console.error('[request panel] load error:', e);
    } finally {
      setLoading(false);
    }
  }, [storeId, cusCode]);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  const resetForm = () => {
    setForm(defaultRequestForm());
    setEditId(null);
    setShowForm(true);
  };

  const onDateChange = (requestDate: string) => {
    setForm(f => ({
      ...f,
      requestDate,
      dayOfWeek: dayOfWeekFromYMD(requestDate),
    }));
  };

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const headers = await getAuthHeaders();
      const added: RequestAttachment[] = [];
      for (const file of Array.from(files)) {
        const fileContent = await readFileAsBase64(file);
        const res = await fetch('/api/customers/requests/upload', {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storeId,
            cusCode,
            fileName: file.name,
            fileContent,
            mimeType: file.type,
          }),
        });
        const d = await res.json();
        if (d.error) throw new Error(d.error);
        if (d.attachment) added.push(d.attachment);
      }
      setForm(f => ({ ...f, attachments: [...f.attachments, ...added] }));
    } catch (e) {
      alert(e instanceof Error ? e.message : '파일 업로드 실패');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removeAttachment = (id: string) => {
    setForm(f => ({ ...f, attachments: f.attachments.filter(a => a.id !== id) }));
  };

  const startEdit = (r: CustomerRequestLog) => {
    setEditId(r.id);
    setShowForm(true);
    setForm({
      requestDate: r.requestDate,
      requestTime: r.requestTime,
      dayOfWeek: r.dayOfWeek,
      content: r.content,
      attachments: r.attachments || [],
    });
  };

  const handleSave = async () => {
    if (!form.content.trim() && form.attachments.length === 0) {
      alert('내용 또는 첨부파일을 입력하세요.');
      return;
    }
    setSaving(true);
    try {
      const headers = await getAuthHeaders();
      const isEdit = !!editId;
      const res = await fetch('/api/customers/requests', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(isEdit ? { id: editId } : {}),
          storeId,
          cusCode,
          ...form,
        }),
      });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      await loadRequests();
      resetForm();
    } catch (e) {
      alert(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 요청 이력을 삭제할까요?')) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/customers/requests?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers,
      });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      if (editId === id) resetForm();
      await loadRequests();
    } catch (e) {
      alert(e instanceof Error ? e.message : '삭제 실패');
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} aria-hidden />
      <aside className="fixed top-0 right-0 h-full w-full max-w-md bg-slate-950 border-l border-slate-800 z-50 flex flex-col shadow-2xl">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 shrink-0">
          <div>
            <p className="text-sm font-semibold text-slate-100">고객 요청 이력</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {cusCode} · {customerLabel}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* 입력 폼 */}
          {showForm && (
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-teal-400">
                  {editId ? '요청 수정' : '새 요청 기록'}
                </p>
                {editId && (
                  <button onClick={resetForm} className="text-[10px] text-slate-500 hover:text-slate-300">
                    취소
                  </button>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="text-[10px] text-slate-500 block mb-1">날짜</label>
                  <input
                    type="date"
                    value={form.requestDate}
                    onChange={e => onDateChange(e.target.value)}
                    className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1">요일</label>
                  <input
                    type="text"
                    value={form.dayOfWeek}
                    onChange={e => setForm(f => ({ ...f, dayOfWeek: e.target.value }))}
                    className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 text-center"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] text-slate-500 block mb-1">시간</label>
                <input
                  type="time"
                  value={form.requestTime}
                  onChange={e => setForm(f => ({ ...f, requestTime: e.target.value }))}
                  className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-500 block mb-1">내용</label>
                <textarea
                  value={form.content}
                  onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                  rows={4}
                  placeholder="고객 요청·상담 내용을 입력하세요"
                  className="w-full px-2 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 resize-y min-h-[80px]"
                />
              </div>

              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <label className="text-[10px] text-slate-500">첨부파일</label>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="inline-flex items-center gap-1 text-[10px] text-slate-400 hover:text-teal-400 disabled:opacity-50"
                  >
                    {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Paperclip className="w-3 h-3" />}
                    파일 추가
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={e => uploadFiles(e.target.files)}
                  />
                </div>
                {form.attachments.length > 0 && (
                  <ul className="space-y-1">
                    {form.attachments.map(a => (
                      <li key={a.id} className="flex items-center gap-2 text-[10px] bg-slate-800/60 rounded px-2 py-1">
                        <FileText className="w-3 h-3 text-slate-500 shrink-0" />
                        <span className="flex-1 truncate text-slate-300">{a.fileName}</span>
                        <button onClick={() => removeAttachment(a.id)} className="text-red-400 hover:text-red-300">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full flex items-center justify-center gap-1.5 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-xs font-medium disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                {editId ? '수정 저장' : '저장'}
              </button>
            </div>
          )}

          {!showForm && (
            <button
              onClick={() => { resetForm(); setShowForm(true); }}
              className="w-full flex items-center justify-center gap-1.5 py-2 border border-dashed border-slate-700 text-slate-400 hover:text-teal-400 hover:border-teal-600/50 rounded-xl text-xs"
            >
              <Plus className="w-3.5 h-3.5" /> 새 요청 기록
            </button>
          )}

          {/* 이력 목록 */}
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-teal-400" />
            </div>
          ) : requests.length === 0 ? (
            <p className="text-center text-xs text-slate-600 py-8">등록된 요청 이력이 없습니다.</p>
          ) : (
            <div className="space-y-3">
              {requests.map(r => (
                <div key={r.id} className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-medium text-slate-200">
                        {r.requestDate} ({r.dayOfWeek}) {r.requestTime}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => startEdit(r)}
                        className="p-1 rounded hover:bg-slate-800 text-slate-500 hover:text-teal-400"
                        title="수정"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(r.id)}
                        className="p-1 rounded hover:bg-slate-800 text-slate-500 hover:text-red-400"
                        title="삭제"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {r.content && (
                    <p className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">{r.content}</p>
                  )}

                  {r.attachments?.length > 0 && (
                    <ul className="space-y-1 pt-1 border-t border-slate-800/80">
                      {r.attachments.map(a => (
                        <li key={a.id}>
                          <a
                            href={a.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-[10px] text-teal-400 hover:text-teal-300"
                          >
                            <Download className="w-3 h-3" />
                            {a.fileName}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}

                  <p className="text-[10px] text-slate-600 pt-1 border-t border-slate-800/60">
                    최종 수정: {formatDt(r.updatedAt)}
                    {r.updatedByEmail ? ` · ${r.updatedByEmail}` : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
