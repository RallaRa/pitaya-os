'use client';

import { overlay } from '@/components/overlay';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  collection, onSnapshot, query, where,
} from 'firebase/firestore';
import {
  FileText, Plus, Search, Save, Trash2, History, Loader2, X,
  RotateCcw, Bookmark, Printer, Users, ChevronLeft,
} from 'lucide-react';
import { useMasterDetailView } from '@/hooks/useMasterDetailView';
import { db } from '@/lib/firebase/firebase';
import { useAuth } from '@/context/AuthContext';
import { useStore } from '@/context/StoreContext';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import CollaborativeEditor from '@/components/messenger/CollaborativeEditor';
import {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_TYPE_TEMPLATES,
  type DocumentVersion,
  type MessengerDocument,
} from '@/lib/messenger/documentTypes';

function tsToIso(v: unknown): string | undefined {
  if (!v) return undefined;
  if (typeof v === 'object' && v !== null && 'toDate' in v) {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  return String(v);
}

function docFromFirestore(id: string, data: Record<string, unknown>): MessengerDocument {
  return {
    id,
    storeId: String(data.storeId || ''),
    title: String(data.title || ''),
    type: String(data.type || '자유양식'),
    content: String(data.content || ''),
    collaborators: Array.isArray(data.collaborators) ? data.collaborators.map(String) : [],
    roomId: data.roomId ? String(data.roomId) : undefined,
    isTemplate: !!data.isTemplate,
    createdBy: String(data.createdBy || ''),
    createdByName: data.createdByName ? String(data.createdByName) : undefined,
    updatedBy: data.updatedBy ? String(data.updatedBy) : undefined,
    updatedByName: data.updatedByName ? String(data.updatedByName) : undefined,
    version: Number(data.version || 1),
    updatedAt: tsToIso(data.updatedAt),
    createdAt: tsToIso(data.createdAt),
  };
}

export default async function MessengerDocsPageWrapper() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-teal-400" />
      </div>
    }>
      <MessengerDocsPage />
    </Suspense>
  );
}

function MessengerDocsPage() {
  const { user } = useAuth();
  const { currentStore } = useStore();
  const searchParams = useSearchParams();
  const storeId = currentStore?.storeId || '';
  const roomIdParam = searchParams.get('roomId') || '';
  const docIdParam = searchParams.get('docId') || '';

  const [documents, setDocuments] = useState<MessengerDocument[]>([]);
  const [templates, setTemplates] = useState<MessengerDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftType, setDraftType] = useState<string>(DOCUMENT_TYPES[0]);
  const [draftContent, setDraftContent] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formType, setFormType] = useState<string>(DOCUMENT_TYPES[0]);
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!storeId) { setLoading(false); return; }
    const q = query(collection(db, 'documents'), where('storeId', '==', storeId));
    const unsub = onSnapshot(q, snap => {
      const rows = snap.docs.map(d => docFromFirestore(d.id, d.data() as Record<string, unknown>));
      setDocuments(rows.filter(d => !d.isTemplate));
      setTemplates(rows.filter(d => d.isTemplate));
      setLoading(false);
    });
    return () => unsub();
  }, [storeId]);

  useEffect(() => {
    if (docIdParam) setSelectedId(docIdParam);
  }, [docIdParam]);

  const filteredDocs = useMemo(() => {
    let rows = documents;
    if (roomIdParam) rows = rows.filter(d => !d.roomId || d.roomId === roomIdParam);
    if (typeFilter) rows = rows.filter(d => d.type === typeFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      rows = rows.filter(d =>
        d.title.toLowerCase().includes(q) || d.content.toLowerCase().includes(q),
      );
    }
    return rows.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  }, [documents, roomIdParam, searchQuery, typeFilter]);

  const selected = useMemo(
    () => documents.find(d => d.id === selectedId) || null,
    [documents, selectedId],
  );

  useEffect(() => {
    if (!selected) {
      setDraftTitle('');
      setDraftType(DOCUMENT_TYPES[0]);
      setDraftContent('');
      return;
    }
    setDraftTitle(selected.title);
    setDraftType(selected.type);
    setDraftContent(selected.content);
  }, [selected?.id, selected?.title, selected?.type, selected?.content, selected]);

  const persistContent = useCallback(async (content: string, title?: string, type?: string) => {
    if (!storeId || !selectedId) return;
    setSaving(true);
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch(`/api/messenger/docs/${selectedId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          storeId,
          title: title ?? draftTitle,
          type: type ?? draftType,
          content,
          roomId: roomIdParam || selected?.roomId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
    } catch (e: unknown) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }, [draftTitle, draftType, roomIdParam, selected?.roomId, selectedId, storeId]);

  const scheduleSave = useCallback((content: string) => {
    setDraftContent(content);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void persistContent(content);
    }, 2500);
  }, [persistContent]);

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  }, []);

  const handleCreate = async () => {
    if (!storeId || !formTitle.trim()) return;
    setSaving(true);
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/messenger/docs', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          storeId,
          title: formTitle.trim(),
          type: formType,
          content: DOCUMENT_TYPE_TEMPLATES[formType as keyof typeof DOCUMENT_TYPE_TEMPLATES],
          roomId: roomIdParam || undefined,
          isTemplate: saveAsTemplate,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setShowForm(false);
      setFormTitle('');
      setSaveAsTemplate(false);
      if (!saveAsTemplate && data.document?.id) setSelectedId(data.document.id);
    } catch (e: unknown) {
      await overlay.alert(e instanceof Error ? e.message : '생성 실패');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (docId: string) => {
    if (!storeId || !(await overlay.confirm('문서를 삭제할까요?'))) return;
    const headers = await getAuthJsonHeaders();
    await fetch(`/api/messenger/docs/${docId}?storeId=${encodeURIComponent(storeId)}`, {
      method: 'DELETE',
      headers,
    });
    if (selectedId === docId) setSelectedId(null);
  };

  const handleSaveMeta = async () => {
    if (!selectedId) return;
    await persistContent(draftContent, draftTitle, draftType);
  };

  const handleSaveTemplate = async () => {
    if (!storeId || !draftTitle.trim()) return;
    setSaving(true);
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/messenger/docs', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          storeId,
          title: `${draftTitle} (템플릿)`,
          type: draftType,
          content: draftContent,
          isTemplate: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      overlay.toast('템플릿으로 저장했습니다.', { variant: 'success' });
    } catch (e: unknown) {
      await overlay.alert(e instanceof Error ? e.message : '템플릿 저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const loadVersions = async () => {
    if (!storeId || !selectedId) return;
    const headers = await getAuthJsonHeaders();
    const res = await fetch(
      `/api/messenger/docs/${selectedId}/versions?storeId=${encodeURIComponent(storeId)}`,
      { headers },
    );
    const data = await res.json();
    if (res.ok) {
      setVersions(data.versions || []);
      setShowVersions(true);
    }
  };

  const applyTemplate = (tpl: MessengerDocument) => {
    setDraftTitle(tpl.title.replace(/ \(템플릿\)$/, ''));
    setDraftType(tpl.type);
    setDraftContent(tpl.content);
    void persistContent(tpl.content, tpl.title.replace(/ \(템플릿\)$/, ''), tpl.type);
  };

  const exportPdf = () => {
    const node = printRef.current;
    if (!node) return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${draftTitle}</title>
      <style>
        body { font-family: sans-serif; padding: 24px; white-space: pre-wrap; line-height: 1.6; }
        h1 { font-size: 18px; margin-bottom: 16px; }
      </style></head><body>
      <h1>${draftTitle}</h1>
      <pre style="font-family: inherit; white-space: pre-wrap;">${draftContent.replace(/</g, '&lt;')}</pre>
      </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  const { showList, showDetail, backToList } = useMasterDetailView(!!selectedId);

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100dvh-4rem-2.5rem)] min-h-0 bg-slate-950 text-slate-200">
      {/* Sidebar list */}
      <aside className={`lg:w-80 border-b lg:border-b-0 lg:border-r border-slate-800 flex flex-col min-h-0 ${
        showList ? 'flex flex-1 lg:flex-none min-h-0 w-full' : 'hidden lg:flex lg:w-80'
      }`}>
        <div className="p-3 border-b border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-teal-400" />
              <h1 className="font-semibold text-sm">협업 문서</h1>
            </div>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-teal-600 rounded-lg hover:bg-teal-500"
            >
              <Plus className="w-3.5 h-3.5" /> 새 문서
            </button>
          </div>
          {roomIdParam && (
            <p className="text-[10px] text-teal-400/80">채팅방 연결 · {roomIdParam.slice(0, 8)}…</p>
          )}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-2 text-slate-500" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="문서 검색"
              className="w-full pl-7 pr-2 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg"
            />
          </div>
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="w-full px-2 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg"
          >
            <option value="">전체 유형</option>
            {DOCUMENT_TYPES.map(t => <option key={t} value={t}>{DOCUMENT_TYPE_LABELS[t]}</option>)}
          </select>
        </div>

        {showForm && (
          <div className="p-3 border-b border-slate-800 bg-slate-900/50 space-y-2">
            <input
              value={formTitle}
              onChange={e => setFormTitle(e.target.value)}
              placeholder="문서 제목"
              className="w-full px-2 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded-lg"
            />
            <select
              value={formType}
              onChange={e => setFormType(e.target.value)}
              className="w-full px-2 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded-lg"
            >
              {DOCUMENT_TYPES.map(t => <option key={t} value={t}>{DOCUMENT_TYPE_LABELS[t]}</option>)}
            </select>
            <label className="flex items-center gap-2 text-xs text-slate-400">
              <input type="checkbox" checked={saveAsTemplate} onChange={e => setSaveAsTemplate(e.target.checked)} />
              템플릿으로 저장
            </label>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowForm(false)} className="text-xs px-2 py-1 rounded hover:bg-slate-800">취소</button>
              <button type="button" onClick={handleCreate} disabled={saving} className="text-xs px-2 py-1 bg-teal-600 rounded disabled:opacity-50">생성</button>
            </div>
          </div>
        )}

        {templates.length > 0 && (
          <div className="px-3 py-2 border-b border-slate-800">
            <p className="text-[10px] text-slate-500 mb-1 flex items-center gap-1"><Bookmark className="w-3 h-3" /> 템플릿</p>
            <div className="flex flex-wrap gap-1">
              {templates.slice(0, 6).map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => selectedId && applyTemplate(t)}
                  disabled={!selectedId}
                  className="text-[10px] px-2 py-0.5 rounded border border-slate-700 hover:border-teal-500 disabled:opacity-40"
                >
                  {t.title}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-500" /></div>
          ) : filteredDocs.length === 0 ? (
            <p className="text-center text-xs text-slate-600 py-8">문서가 없습니다.</p>
          ) : filteredDocs.map(doc => (
            <button
              key={doc.id}
              type="button"
              onClick={() => setSelectedId(doc.id)}
              className={`w-full text-left px-3 py-2 border-b border-slate-800/50 hover:bg-slate-900/80 ${
                selectedId === doc.id ? 'bg-teal-500/10 border-l-2 border-l-teal-400' : ''
              }`}
            >
              <p className="text-sm font-medium truncate">{doc.title}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">
                {doc.type} · v{doc.version}
                {doc.collaborators?.length ? ` · ${doc.collaborators.length}명` : ''}
              </p>
            </button>
          ))}
        </div>
      </aside>

      {/* Editor */}
      <main className={`flex-1 flex flex-col min-h-0 min-w-0 ${showDetail ? 'flex' : 'hidden lg:flex'}`}>
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-slate-600 text-sm px-4 text-center">
            문서를 선택하거나 새로 만드세요.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 p-3 border-b border-slate-800">
              <button
                type="button"
                onClick={() => { backToList(); setSelectedId(null); }}
                className="lg:hidden touch-target flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 shrink-0"
                aria-label="목록으로"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <input
                value={draftTitle}
                onChange={e => setDraftTitle(e.target.value)}
                className="flex-1 min-w-[160px] px-3 py-1.5 text-sm bg-slate-900 border border-slate-700 rounded-lg"
              />
              <select
                value={draftType}
                onChange={e => setDraftType(e.target.value)}
                className="px-2 py-1.5 text-sm bg-slate-900 border border-slate-700 rounded-lg"
              >
                {DOCUMENT_TYPES.map(t => <option key={t} value={t}>{DOCUMENT_TYPE_LABELS[t]}</option>)}
              </select>
              <button type="button" onClick={handleSaveMeta} disabled={saving} className="inline-flex items-center gap-1 px-2 py-1.5 text-xs bg-teal-600 rounded-lg disabled:opacity-50">
                <Save className="w-3.5 h-3.5" /> {saving ? '저장 중' : '저장'}
              </button>
              <button type="button" onClick={handleSaveTemplate} className="inline-flex items-center gap-1 px-2 py-1.5 text-xs border border-slate-700 rounded-lg hover:bg-slate-800">
                <Bookmark className="w-3.5 h-3.5" /> 템플릿
              </button>
              <button type="button" onClick={loadVersions} className="inline-flex items-center gap-1 px-2 py-1.5 text-xs border border-slate-700 rounded-lg hover:bg-slate-800">
                <History className="w-3.5 h-3.5" /> 이력
              </button>
              <button type="button" onClick={exportPdf} className="inline-flex items-center gap-1 px-2 py-1.5 text-xs border border-slate-700 rounded-lg hover:bg-slate-800">
                <Printer className="w-3.5 h-3.5" /> PDF
              </button>
              <button type="button" onClick={() => handleDelete(selected.id)} className="inline-flex items-center gap-1 px-2 py-1.5 text-xs text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/10">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              {selected.collaborators?.length > 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] text-slate-500 ml-auto">
                  <Users className="w-3 h-3" /> {selected.collaborators.length}명 협업
                </span>
              )}
            </div>

            <div className="flex-1 p-3 min-h-0 flex flex-col">
              <CollaborativeEditor
                key={selected.id}
                docId={selected.id}
                storeId={storeId}
                initialContent={selected.content}
                userId={user?.uid || 'anon'}
                userName={user?.email?.split('@')[0] || '사용자'}
                onContentChange={scheduleSave}
              />
            </div>

            <div ref={printRef} className="hidden" aria-hidden />
          </>
        )}
      </main>

      {showVersions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-3 border-b border-slate-800">
              <h2 className="text-sm font-semibold flex items-center gap-2"><History className="w-4 h-4 text-teal-400" /> 변경 이력</h2>
              <button type="button" onClick={() => setShowVersions(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <div className="overflow-y-auto flex-1 p-3 space-y-2">
              {versions.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-4">이력이 없습니다.</p>
              ) : versions.map(v => (
                <div key={v.id} className="p-2 rounded-lg border border-slate-800 text-xs">
                  <div className="flex justify-between text-slate-400 mb-1">
                    <span>v{v.version} · {v.updatedByName || v.updatedBy}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setDraftContent(v.content);
                        void persistContent(v.content);
                        setShowVersions(false);
                      }}
                      className="text-teal-400 hover:underline inline-flex items-center gap-0.5"
                    >
                      <RotateCcw className="w-3 h-3" /> 복원
                    </button>
                  </div>
                  <p className="text-slate-500 line-clamp-2 whitespace-pre-wrap">{v.content.slice(0, 120)}…</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
