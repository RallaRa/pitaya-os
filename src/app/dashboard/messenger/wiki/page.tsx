'use client';

import { overlay } from '@/components/overlay';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  collection, query, where, onSnapshot,
} from 'firebase/firestore';
import {
  BookOpen, Plus, Search, Save, Trash2, History, Eye, Edit3,
  Loader2, X, RotateCcw, Link2, ChevronLeft,
} from 'lucide-react';
import { useMasterDetailView } from '@/hooks/useMasterDetailView';
import { db } from '@/lib/firebase/firebase';
import { useAuth } from '@/context/AuthContext';
import { useStore } from '@/context/StoreContext';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import WikiMarkdown from '@/components/wiki/WikiMarkdown';
import {
  WIKI_PAGE_CATEGORIES,
  type WikiPage,
  type WikiPageVersion,
} from '@/lib/messenger/wikiTypes';

interface RoomOption {
  id: string;
  name: string;
}

const EMPTY_FORM = {
  title: '',
  content: '',
  category: WIKI_PAGE_CATEGORIES[0] as string,
  roomId: '',
};

export default function MessengerWikiPageWrapper() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-teal-400" />
      </div>
    }>
      <MessengerWikiPage />
    </Suspense>
  );
}

function MessengerWikiPage() {
  const { user } = useAuth();
  const { currentStore } = useStore();
  const searchParams = useSearchParams();
  const storeId = currentStore?.storeId || '';

  const [pages, setPages] = useState<WikiPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<'view' | 'edit' | 'create'>('view');
  const [form, setForm] = useState(EMPTY_FORM);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [roomFilter, setRoomFilter] = useState(searchParams.get('roomId') || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showVersions, setShowVersions] = useState(false);
  const [versions, setVersions] = useState<WikiPageVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [saveOk, setSaveOk] = useState('');

  const upsertPage = useCallback((page: WikiPage) => {
    setPages(prev => {
      const idx = prev.findIndex(p => p.id === page.id);
      if (idx < 0) return [page, ...prev];
      const next = [...prev];
      next[idx] = page;
      return next.sort((a, b) =>
        (b.updatedAt || '').localeCompare(a.updatedAt || '') || a.title.localeCompare(b.title, 'ko'),
      );
    });
  }, []);

  const loadPages = useCallback(async () => {
    if (!storeId) {
      setPages([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch(
        `/api/messenger/wiki?storeId=${encodeURIComponent(storeId)}`,
        { headers, cache: 'no-store' },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '목록 조회 실패');
      setPages(data.pages || []);
    } catch (e: unknown) {
      console.error('[wiki_pages]', e);
      setError(e instanceof Error ? e.message : '위키 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    void loadPages();
  }, [loadPages]);

  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, 'chat_rooms'),
      where('members', 'array-contains', user.uid),
      where('status', '==', 'active'),
    );
    const unsub = onSnapshot(q, snap => {
      setRooms(snap.docs.map(d => {
        const data = d.data();
        const members = (data.members as string[]) || [];
        return {
          id: d.id,
          name: data.name
            ? String(data.name)
            : `대화 (${members.length}명)`,
        };
      }));
    });
    return () => unsub();
  }, [user?.uid]);

  const filteredPages = useMemo(() => {
    let list = pages;
    if (categoryFilter) list = list.filter(p => p.category === categoryFilter);
    if (roomFilter) list = list.filter(p => !p.roomId || p.roomId === roomFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(p =>
        p.title.toLowerCase().includes(q) || p.content.toLowerCase().includes(q),
      );
    }
    return list;
  }, [pages, categoryFilter, roomFilter, search]);

  const selectedPage = useMemo(
    () => pages.find(p => p.id === selectedId) || null,
    [pages, selectedId],
  );

  const displayPage = useMemo(() => {
    if (selectedPage) return selectedPage;
    if (selectedId && mode === 'view' && form.title) {
      return {
        id: selectedId,
        storeId,
        title: form.title,
        content: form.content,
        category: form.category,
        createdBy: '',
        roomId: form.roomId || undefined,
        version: 1,
      } satisfies WikiPage;
    }
    return null;
  }, [selectedPage, selectedId, mode, form, storeId]);

  useEffect(() => {
    if (!saveOk) return;
    const t = setTimeout(() => setSaveOk(''), 4000);
    return () => clearTimeout(t);
  }, [saveOk]);

  useEffect(() => {
    if (selectedPage && mode === 'view') {
      setForm({
        title: selectedPage.title,
        content: selectedPage.content,
        category: selectedPage.category,
        roomId: selectedPage.roomId || '',
      });
    }
  }, [selectedPage, mode]);

  const loadVersions = useCallback(async (pageId: string) => {
    if (!storeId) return;
    setVersionsLoading(true);
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch(
        `/api/messenger/wiki/${encodeURIComponent(pageId)}/versions?storeId=${encodeURIComponent(storeId)}`,
        { headers },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '버전 조회 실패');
      setVersions(data.versions || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '버전 조회 실패');
    } finally {
      setVersionsLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    if (showVersions && selectedId) loadVersions(selectedId);
  }, [showVersions, selectedId, loadVersions]);

  const openCreate = async () => {
    setSelectedId(null);
    setMode('create');
    setForm({ ...EMPTY_FORM, roomId: roomFilter });
    setShowVersions(false);
    setError('');
  };

  const openPage = (page: WikiPage) => {
    setSelectedId(page.id);
    setMode('view');
    setShowVersions(false);
    setError('');
  };

  const startEdit = () => {
    const page = displayPage || selectedPage;
    if (!page) return;
    setMode('edit');
    setForm({
      title: page.title,
      content: page.content,
      category: page.category,
      roomId: page.roomId || '',
    });
  };

  const handleSave = async () => {
    if (!storeId || !form.title.trim()) {
      setError('제목을 입력하세요.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const headers = await getAuthJsonHeaders();
      const payload = {
        storeId,
        title: form.title.trim(),
        content: form.content,
        category: form.category,
        roomId: form.roomId || undefined,
      };

      if (mode === 'create') {
        const res = await fetch('/api/messenger/wiki', {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '생성 실패');
        upsertPage(data.page);
        setSelectedId(data.page.id);
        setMode('view');
        setSaveOk('문서가 저장되었습니다.');
      } else if (selectedId) {
        const res = await fetch(`/api/messenger/wiki/${encodeURIComponent(selectedId)}`, {
          method: 'PUT',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '저장 실패');
        upsertPage(data.page);
        setMode('view');
        setSaveOk('변경 내용이 저장되었습니다.');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!storeId || !selectedId) return;
    if (!(await overlay.confirm('이 문서를 삭제할까요? 수정 이력도 함께 삭제됩니다.'))) return;
    setSaving(true);
    setError('');
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch(
        `/api/messenger/wiki/${encodeURIComponent(selectedId)}?storeId=${encodeURIComponent(storeId)}`,
        { method: 'DELETE', headers },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '삭제 실패');
      setSelectedId(null);
      setMode('view');
      setShowVersions(false);
      setPages(prev => prev.filter(p => p.id !== selectedId));
      setSaveOk('문서가 삭제되었습니다.');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '삭제 실패');
    } finally {
      setSaving(false);
    }
  };

  const handleRestoreVersion = async (version: number) => {
    if (!storeId || !selectedId) return;
    if (!(await overlay.confirm(`v${version}으로 복원할까요? (새 버전으로 저장됩니다)`))) return;
    setSaving(true);
    setError('');
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch(
        `/api/messenger/wiki/${encodeURIComponent(selectedId)}/versions`,
        {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ storeId, version }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '복원 실패');
      setMode('view');
      await loadVersions(selectedId);
      if (data.page) upsertPage(data.page);
      setSaveOk(`v${version}으로 복원되었습니다.`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '복원 실패');
    } finally {
      setSaving(false);
    }
  };

  const roomName = (roomId?: string) =>
    rooms.find(r => r.id === roomId)?.name || (roomId ? '연결된 채팅방' : '전체 공유');

  const hasDetail = !!selectedId || mode === 'create' || mode === 'edit';
  const { showList, showDetail, backToList } = useMasterDetailView(hasDetail);

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100dvh-4rem-2.5rem)] min-h-0 bg-slate-950">
      {/* 목록 */}
      <aside className={`lg:w-72 shrink-0 border-b lg:border-b-0 lg:border-r border-slate-800 flex flex-col min-h-0 ${
        showList ? 'flex flex-1 lg:flex-none min-h-0' : 'hidden lg:flex'
      }`}>
        <div className="p-3 border-b border-slate-800 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-sm font-semibold text-slate-100 flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-teal-400" />
              지식베이스
            </h1>
            <button
              type="button"
              onClick={() => void loadPages()}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-700 text-[11px] text-slate-400 hover:bg-slate-800"
            >
              <RotateCcw className="w-3 h-3" /> 새로고침
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-[11px]"
            >
              <Plus className="w-3.5 h-3.5" /> 새 문서
            </button>
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="제목·내용 검색"
              className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="w-full rounded-lg bg-slate-900 border border-slate-700 text-xs text-white px-2 py-1.5"
          >
            <option value="">전체 카테고리</option>
            {WIKI_PAGE_CATEGORIES.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select
            value={roomFilter}
            onChange={e => setRoomFilter(e.target.value)}
            className="w-full rounded-lg bg-slate-900 border border-slate-700 text-xs text-white px-2 py-1.5"
          >
            <option value="">전체 채팅방</option>
            {rooms.map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-teal-400" />
            </div>
          ) : filteredPages.length === 0 ? (
            <div className="text-center py-8 px-3 space-y-2">
              <p className="text-xs text-slate-500">
                {pages.length > 0 && (categoryFilter || roomFilter || search.trim())
                  ? '필터 조건에 맞는 문서가 없습니다'
                  : '문서가 없습니다'}
              </p>
              {roomFilter && pages.length > 0 && (
                <button
                  type="button"
                  onClick={() => setRoomFilter('')}
                  className="text-[11px] text-teal-400 hover:underline"
                >
                  채팅방 필터 해제
                </button>
              )}
            </div>
          ) : (
            filteredPages.map(page => (
              <button
                key={page.id}
                type="button"
                onClick={() => openPage(page)}
                className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                  selectedId === page.id
                    ? 'bg-teal-900/30 border border-teal-500/30'
                    : 'hover:bg-slate-900 border border-transparent'
                }`}
              >
                <p className="text-xs font-medium text-slate-100 truncate">{page.title}</p>
                <p className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1">
                  <span>{page.category}</span>
                  {page.roomId && (
                    <>
                      <span>·</span>
                      <Link2 className="w-3 h-3 inline" />
                      <span className="truncate">{roomName(page.roomId)}</span>
                    </>
                  )}
                </p>
                <p className="text-[10px] text-slate-600 mt-0.5">v{page.version}</p>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* 본문 */}
      <main className={`flex-1 min-w-0 flex flex-col min-h-0 ${showDetail ? 'flex' : 'hidden lg:flex'}`}>
        {(mode === 'edit' || mode === 'create') ? (
          <>
            <header className="shrink-0 px-4 py-3 border-b border-slate-800 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => { backToList(); setMode('view'); if (mode === 'create') setSelectedId(null); }}
                className="lg:hidden touch-target flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 shrink-0"
                aria-label="목록으로"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="문서 제목"
                className="flex-1 min-w-[160px] rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white"
              />
              <select
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="rounded-lg bg-slate-900 border border-slate-700 text-xs text-white px-2 py-2"
              >
                {WIKI_PAGE_CATEGORIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <select
                value={form.roomId}
                onChange={e => setForm(f => ({ ...f, roomId: e.target.value }))}
                className="rounded-lg bg-slate-900 border border-slate-700 text-xs text-white px-2 py-2 max-w-[140px]"
              >
                <option value="">채팅방 미연결</option>
                {rooms.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => { setMode(selectedId ? 'view' : 'view'); setSelectedId(selectedId); }}
                className="px-2 py-2 rounded-lg border border-slate-700 text-slate-400 hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-xs disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                저장
              </button>
            </header>
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 min-h-0">
              <textarea
                value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                placeholder="마크다운 내용을 입력하세요…"
                className="min-h-[200px] md:min-h-0 p-4 bg-slate-950 border-b md:border-b-0 md:border-r border-slate-800 text-sm text-slate-200 font-mono resize-none focus:outline-none"
              />
              <div className="overflow-y-auto p-4 prose-invert">
                <p className="text-[10px] text-slate-500 mb-2 uppercase tracking-wider">미리보기</p>
                <WikiMarkdown content={form.content || '_내용 없음_'} />
              </div>
            </div>
          </>
        ) : displayPage ? (
          <>
            <header className="shrink-0 px-4 py-3 border-b border-slate-800">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => { backToList(); setSelectedId(null); setShowVersions(false); }}
                    className="lg:hidden touch-target flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 shrink-0"
                    aria-label="목록으로"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <div className="min-w-0">
                  <h2 className="text-lg font-bold text-white">{displayPage.title}</h2>
                  <p className="text-xs text-slate-500 mt-1">
                    {displayPage.category} · v{displayPage.version}
                    {displayPage.roomId && ` · ${roomName(displayPage.roomId)}`}
                    {displayPage.updatedAt && ` · ${displayPage.updatedAt.slice(0, 16).replace('T', ' ')}`}
                  </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowVersions(v => !v)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-300 hover:bg-slate-800"
                  >
                    <History className="w-3.5 h-3.5" /> 이력
                  </button>
                  <button
                    type="button"
                    onClick={startEdit}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-300 hover:bg-slate-800"
                  >
                    <Edit3 className="w-3.5 h-3.5" /> 수정
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={saving}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-900/50 text-xs text-red-300 hover:bg-red-950/40"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> 삭제
                  </button>
                </div>
              </div>
            </header>
            <div className="flex flex-1 min-h-0">
              <div className="flex-1 overflow-y-auto p-4 md:p-6">
                <WikiMarkdown content={displayPage.content} />
              </div>
              {showVersions && (
                <aside className="w-full md:w-64 shrink-0 border-l border-slate-800 bg-slate-900/40 overflow-y-auto p-3">
                  <p className="text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1">
                    <Eye className="w-3.5 h-3.5" /> 수정 이력
                  </p>
                  {versionsLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-teal-400 mx-auto my-4" />
                  ) : versions.length === 0 ? (
                    <p className="text-[11px] text-slate-500">저장된 이전 버전 없음</p>
                  ) : (
                    <ul className="space-y-2">
                      {versions.map(v => (
                        <li
                          key={v.id}
                          className="rounded-lg border border-slate-800 p-2 text-[11px]"
                        >
                          <p className="text-slate-200 font-medium">v{v.version}</p>
                          <p className="text-slate-500 truncate">{v.title}</p>
                          <p className="text-slate-600 mt-1">
                            {v.updatedAt?.slice(0, 16).replace('T', ' ') || '-'}
                          </p>
                          <button
                            type="button"
                            onClick={() => handleRestoreVersion(v.version)}
                            className="mt-2 inline-flex items-center gap-1 text-teal-400 hover:text-teal-300"
                          >
                            <RotateCcw className="w-3 h-3" /> 복원
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </aside>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-8">
            <BookOpen className="w-10 h-10 text-slate-700 mb-3" />
            <p className="text-sm">문서를 선택하거나 새 문서를 만드세요</p>
          </div>
        )}

        {error && (
          <div className="shrink-0 mx-4 mb-3 px-3 py-2 rounded-lg bg-red-950/40 border border-red-900/40 text-xs text-red-300">
            {error}
          </div>
        )}
        {saveOk && !error && (
          <div className="shrink-0 mx-4 mb-3 px-3 py-2 rounded-lg bg-teal-950/40 border border-teal-800/40 text-xs text-teal-200">
            {saveOk}
          </div>
        )}
      </main>
    </div>
  );
}
