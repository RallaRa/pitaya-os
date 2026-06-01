'use client';

import { useState, useEffect, useCallback } from 'react';
import { useStore } from '@/context/StoreContext';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import {
  Plus, Play, Eye, Check, X, Tv, Trash2, ExternalLink, Wand2, Upload, RefreshCw, Pencil,
} from 'lucide-react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import SignageContentPlayer from '@/components/signage/SignageContentPlayer';
import {
  SIGNAGE_CONTENT_TYPES,
  SIGNAGE_SCREEN_KINDS,
  type SignageContentDoc,
  type SignageContentType,
  type SignageScreenDoc,
  type SignageScreenKind,
} from '@/lib/signage/types';

type TabId = 'pending' | 'approved' | 'screens' | 'create';

async function signageApi(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  opts: { storeId: string; body?: Record<string, unknown>; query?: Record<string, string> },
) {
  const headers = await getAuthJsonHeaders();
  const qs = new URLSearchParams({ storeId: opts.storeId, ...opts.query });
  const url = method === 'GET' || method === 'DELETE'
    ? `/api/signage?${qs}`
    : '/api/signage';
  const res = await fetch(url, {
    method,
    headers,
    ...(method !== 'GET' && method !== 'DELETE' ? { body: JSON.stringify(opts.body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '요청 실패');
  return data;
}

export default function SignagePage() {
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';

  const [tab, setTab] = useState<TabId>('create');
  const [contents, setContents] = useState<SignageContentDoc[]>([]);
  const [screens, setScreens] = useState<SignageScreenDoc[]>([]);
  const [defaultContentType, setDefaultContentType] = useState<SignageContentType>('text');
  const [typeSaving, setTypeSaving] = useState(false);
  const [typeSaved, setTypeSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [previewContent, setPreviewContent] = useState<SignageContentDoc | null>(null);
  const [generating, setGenerating] = useState(false);
  const [videoFile, setVideoFile] = useState<File | null>(null);

  const [showScreenModal, setShowScreenModal] = useState(false);
  const [editingScreen, setEditingScreen] = useState<SignageScreenDoc | null>(null);
  const [screenForm, setScreenForm] = useState({ name: '', screenKind: 'entrance' as SignageScreenKind });

  const [createForm, setCreateForm] = useState({
    type: 'text' as SignageContentType,
    title: '',
    prompt: '',
    duration: 10,
    bgColor: '#1a1a2e',
    textColor: '#ffffff',
  });

  const loadAll = useCallback(async () => {
    if (!storeId) { setLoading(false); return; }
    setError('');
    try {
      const data = await signageApi('GET', { storeId });
      setContents(data.contents || []);
      setScreens(data.screens || []);
      const savedType = data.settings?.defaultContentType as SignageContentType;
      if (savedType && SIGNAGE_CONTENT_TYPES.some(t => t.id === savedType)) {
        setDefaultContentType(savedType);
        setCreateForm(f => ({ ...f, type: savedType }));
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '데이터 로드 실패');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    setLoading(true);
    loadAll();
    const timer = setInterval(loadAll, 15000);
    return () => clearInterval(timer);
  }, [loadAll]);

  const saveContentType = async (type: SignageContentType) => {
    if (!storeId) return;
    setCreateForm(f => ({ ...f, type }));
    setDefaultContentType(type);
    setTypeSaving(true);
    setTypeSaved(false);
    try {
      await signageApi('POST', {
        storeId,
        body: { action: 'saveSettings', storeId, defaultContentType: type },
      });
      setTypeSaved(true);
      setTimeout(() => setTypeSaved(false), 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '종류 저장 실패');
    } finally {
      setTypeSaving(false);
    }
  };

  const pendingContents = contents.filter(c => c.status === 'pending');
  const approvedContents = contents
    .filter(c => c.status === 'approved')
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const generateContent = async () => {
    if (!createForm.title || !storeId) return;
    if (createForm.type !== 'video' && !createForm.prompt) return;

    setGenerating(true);
    setError('');
    try {
      const headers = await getAuthJsonHeaders();
      let url = '';
      let thumbnailUrl = '';

      if (createForm.type === 'image') {
        const res = await fetch('/api/signage/generate-image', {
          method: 'POST',
          headers,
          body: JSON.stringify({ prompt: createForm.prompt, title: createForm.title, storeId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        url = data.url;
        thumbnailUrl = data.thumbnailUrl || data.url;
      } else if (createForm.type === 'text' || createForm.type === 'slide') {
        const res = await fetch('/api/signage/generate-text', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            prompt: createForm.prompt,
            type: createForm.type,
            bgColor: createForm.bgColor,
            textColor: createForm.textColor,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        url = data.content;
      } else if (createForm.type === 'video') {
        if (!videoFile) throw new Error('영상 파일을 선택해 주세요');
        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(videoFile);
        });
        const res = await fetch('/api/signage/upload-video', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            storeId,
            fileName: videoFile.name,
            fileContent: base64,
            mimeType: videoFile.type,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        url = data.url;
        thumbnailUrl = data.thumbnailUrl || data.url;
      }

      await signageApi('POST', {
        storeId,
        body: {
          action: 'createContent',
          storeId,
          type: createForm.type,
          title: createForm.title,
          url,
          thumbnailUrl,
          duration: createForm.duration,
          aiPrompt: createForm.prompt || '',
          bgColor: createForm.bgColor,
          textColor: createForm.textColor,
        },
      });

      setCreateForm(f => ({ ...f, title: '', prompt: '' }));
      setVideoFile(null);
      await loadAll();
      setTab('pending');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      alert(`생성 실패: ${msg}`);
    } finally {
      setGenerating(false);
    }
  };

  const approveContent = async (contentId: string) => {
    try {
      await signageApi('PUT', { storeId, body: { action: 'approveContent', storeId, contentId } });
      await loadAll();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '승인 실패');
    }
  };

  const rejectContent = async (contentId: string) => {
    try {
      await signageApi('PUT', { storeId, body: { action: 'rejectContent', storeId, contentId } });
      await loadAll();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '거절 실패');
    }
  };

  const unapproveContent = async (contentId: string) => {
    try {
      await signageApi('PUT', { storeId, body: { action: 'unapproveContent', storeId, contentId } });
      await loadAll();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '취소 실패');
    }
  };

  const deleteContent = async (contentId: string) => {
    if (!confirm('이 콘텐츠를 삭제할까요?')) return;
    try {
      await signageApi('DELETE', { storeId, query: { contentId } });
      await loadAll();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '삭제 실패');
    }
  };

  const onDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    const items = Array.from(approvedContents);
    const [removed] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, removed);
    try {
      await signageApi('PUT', {
        storeId,
        body: { action: 'reorderApproved', storeId, orderedIds: items.map(i => i.id) },
      });
      await loadAll();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '순서 저장 실패');
    }
  };

  const openScreenModal = (screen?: SignageScreenDoc) => {
    if (screen) {
      setEditingScreen(screen);
      setScreenForm({ name: screen.name, screenKind: screen.screenKind || 'other' });
    } else {
      setEditingScreen(null);
      setScreenForm({ name: '', screenKind: 'entrance' });
    }
    setShowScreenModal(true);
  };

  const saveScreen = async () => {
    if (!screenForm.name.trim() || !storeId) return;
    try {
      if (editingScreen) {
        await signageApi('PUT', {
          storeId,
          body: {
            action: 'updateScreen',
            storeId,
            screenId: editingScreen.id,
            name: screenForm.name.trim(),
            screenKind: screenForm.screenKind,
          },
        });
      } else {
        await signageApi('POST', {
          storeId,
          body: {
            action: 'createScreen',
            storeId,
            name: screenForm.name.trim(),
            screenKind: screenForm.screenKind,
          },
        });
      }
      setShowScreenModal(false);
      await loadAll();
      setTab('screens');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '화면 저장 실패');
    }
  };

  const toggleScreenActive = async (screen: SignageScreenDoc) => {
    try {
      await signageApi('PUT', {
        storeId,
        body: {
          action: 'updateScreen',
          storeId,
          screenId: screen.id,
          isActive: !screen.isActive,
        },
      });
      await loadAll();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '상태 변경 실패');
    }
  };

  const refreshScreenPlaylist = async (screenId: string) => {
    try {
      await signageApi('PUT', {
        storeId,
        body: { action: 'refreshScreenPlaylist', storeId, screenId },
      });
      await loadAll();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '플레이리스트 갱신 실패');
    }
  };

  const deleteScreen = async (screenId: string) => {
    if (!confirm('이 화면을 삭제할까요?')) return;
    try {
      await signageApi('DELETE', { storeId, query: { screenId } });
      await loadAll();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '화면 삭제 실패');
    }
  };

  const screenKindLabel = (kind?: string) =>
    SIGNAGE_SCREEN_KINDS.find(k => k.id === kind)?.label || '기타';

  if (!storeId) {
    return <div className="p-6 text-slate-500 text-sm">매장을 선택해 주세요</div>;
  }

  return (
    <div className="p-4 min-h-full bg-gray-950 text-white">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Tv size={20} className="text-blue-400" />
            사이니지 관리
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {screens.length}개 화면 · 승인 {approvedContents.length}개 · 기본 종류: {SIGNAGE_CONTENT_TYPES.find(t => t.id === defaultContentType)?.label}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => loadAll()} className="px-3 py-2 bg-gray-800 rounded-lg text-sm flex items-center gap-1">
            <RefreshCw size={14} /> 새로고침
          </button>
          <button type="button" onClick={() => openScreenModal()} className="px-3 py-2 bg-blue-600 rounded-lg text-sm flex items-center gap-1.5">
            <Plus size={14} /> 화면 추가
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-xl text-red-300 text-sm flex justify-between">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')}><X size={14} /></button>
        </div>
      )}

      {loading && contents.length === 0 ? (
        <div className="text-center py-16 text-gray-500">로딩 중...</div>
      ) : (
        <>
          <div className="flex gap-2 mb-6 overflow-x-auto">
            {[
              { id: 'create' as const, label: '✨ AI 생성' },
              { id: 'pending' as const, label: `⏳ 펜딩 (${pendingContents.length})` },
              { id: 'approved' as const, label: `✅ 확정 (${approvedContents.length})` },
              { id: 'screens' as const, label: `📺 화면 (${screens.length})` },
            ].map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`px-4 py-2 rounded-lg text-sm flex-shrink-0 ${tab === t.id ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300'}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'create' && (
            <div className="space-y-4 max-w-2xl">
              <div className="bg-gray-900 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-blue-300 flex items-center gap-2">
                    <Wand2 size={16} /> AI 콘텐츠 생성
                  </h2>
                  {(typeSaving || typeSaved) && (
                    <span className={`text-xs ${typeSaved ? 'text-green-400' : 'text-gray-400'}`}>
                      {typeSaving ? '종류 저장 중...' : '✓ 종류 저장됨'}
                    </span>
                  )}
                </div>

                <div>
                  <label className="text-xs text-gray-400 mb-2 block">콘텐츠 종류 (매장 기본값으로 저장)</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {SIGNAGE_CONTENT_TYPES.map(t => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => saveContentType(t.id)}
                        className={`p-3 rounded-xl text-center text-sm border transition-colors ${
                          createForm.type === t.id
                            ? 'border-blue-500 bg-blue-900/30 text-blue-300'
                            : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
                        }`}
                      >
                        <div>{t.label}</div>
                        <div className="text-xs opacity-60">{t.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-400 mb-1 block">제목</label>
                  <input
                    value={createForm.title}
                    onChange={e => setCreateForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="예: 오늘의 한우 특가"
                    className="w-full bg-gray-800 rounded-xl px-4 py-3 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {createForm.type === 'video' ? (
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">영상 파일</label>
                    <label className="flex items-center gap-2 px-4 py-3 bg-gray-800 rounded-xl cursor-pointer text-sm">
                      <Upload size={16} />
                      {videoFile ? videoFile.name : 'MP4 등 영상 선택'}
                      <input type="file" accept="video/*" className="hidden" onChange={e => setVideoFile(e.target.files?.[0] || null)} />
                    </label>
                  </div>
                ) : (
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">
                      {createForm.type === 'image' ? 'AI 이미지 프롬프트' : '내용 설명'}
                    </label>
                    <textarea
                      value={createForm.prompt}
                      onChange={e => setCreateForm(f => ({ ...f, prompt: e.target.value }))}
                      rows={3}
                      className="w-full bg-gray-800 rounded-xl px-4 py-3 text-sm outline-none resize-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                )}

                {(createForm.type === 'text' || createForm.type === 'slide') && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-400 mb-1 block">배경색</label>
                      <input type="color" value={createForm.bgColor} onChange={e => setCreateForm(f => ({ ...f, bgColor: e.target.value }))} className="w-full h-10 rounded cursor-pointer border-0" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 mb-1 block">텍스트색</label>
                      <input type="color" value={createForm.textColor} onChange={e => setCreateForm(f => ({ ...f, textColor: e.target.value }))} className="w-full h-10 rounded cursor-pointer border-0" />
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-xs text-gray-400 mb-1 block">재생 시간: {createForm.duration}초</label>
                  <input type="range" min={5} max={60} value={createForm.duration} onChange={e => setCreateForm(f => ({ ...f, duration: Number(e.target.value) }))} className="w-full accent-blue-500" />
                </div>

                <button
                  type="button"
                  onClick={generateContent}
                  disabled={generating || !createForm.title || (createForm.type !== 'video' && !createForm.prompt) || (createForm.type === 'video' && !videoFile)}
                  className={`w-full py-3 rounded-xl font-semibold flex items-center justify-center gap-2 ${generating ? 'bg-gray-700 text-gray-500' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}
                >
                  {generating ? '생성 중...' : <><Wand2 size={16} />{createForm.type === 'video' ? '영상 등록하기' : 'AI로 생성하기'}</>}
                </button>
              </div>
            </div>
          )}

          {tab === 'pending' && (
            <div className="space-y-3">
              {pendingContents.length === 0 ? (
                <div className="text-center py-12 text-gray-500"><p>펜딩 콘텐츠 없음</p></div>
              ) : pendingContents.map(content => (
                <ContentRow key={content.id} content={content} onPreview={setPreviewContent} onApprove={() => approveContent(content.id)} onReject={() => rejectContent(content.id)} onDelete={() => deleteContent(content.id)} />
              ))}
            </div>
          )}

          {tab === 'approved' && (
            <div className="space-y-3">
              <div className="bg-green-900/20 border border-green-800/50 rounded-xl p-3 text-sm text-green-300 flex items-center gap-2">
                <Play size={14} /> 확정 콘텐츠가 TV에서 순서대로 재생됩니다
              </div>
              <DragDropContext onDragEnd={onDragEnd}>
                <Droppable droppableId="approved">
                  {provided => (
                    <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                      {approvedContents.map((content, idx) => (
                        <Draggable key={content.id} draggableId={content.id} index={idx}>
                          {dragProvided => (
                            <div ref={dragProvided.innerRef} {...dragProvided.draggableProps} {...dragProvided.dragHandleProps} className="bg-gray-900 rounded-2xl p-4 flex items-center gap-4">
                              <span className="text-2xl font-bold text-gray-600 w-8">{idx + 1}</span>
                              <Thumb content={content} />
                              <div className="flex-1">
                                <p className="font-medium text-sm">{content.title}</p>
                                <p className="text-xs text-gray-400">{content.duration}초 · {content.type}</p>
                              </div>
                              <button type="button" onClick={() => setPreviewContent(content)} className="p-2 bg-gray-700 rounded-lg"><Eye size={14} /></button>
                              <button type="button" onClick={() => unapproveContent(content.id)} className="p-2 bg-gray-700 rounded-lg text-red-400"><X size={14} /></button>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            </div>
          )}

          {tab === 'screens' && (
            <div className="space-y-3">
              {screens.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <p>등록된 화면 없음</p>
                  <button type="button" onClick={() => openScreenModal()} className="mt-3 px-4 py-2 bg-blue-600 rounded-lg text-sm">+ 화면 추가</button>
                </div>
              ) : screens.map(screen => (
                <div key={screen.id} className="bg-gray-900 rounded-2xl p-4">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Tv size={16} className="text-blue-400" />
                        <span className="font-medium">{screen.name}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-900/40 text-blue-300">{screenKindLabel(screen.screenKind)}</span>
                        <button type="button" onClick={() => toggleScreenActive(screen)} className={`text-xs px-2 py-0.5 rounded-full ${screen.isActive ? 'bg-green-900/50 text-green-300' : 'bg-gray-700 text-gray-400'}`}>
                          {screen.isActive ? '활성' : '비활성'}
                        </button>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">/signage/{screen.slug}</p>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <a href={`/signage/${screen.slug}`} target="_blank" rel="noopener noreferrer" className="p-2 bg-blue-700 rounded-lg"><ExternalLink size={14} /></a>
                      <button type="button" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/signage/${screen.slug}`); alert('URL 복사됨!'); }} className="px-3 py-2 bg-gray-700 rounded-lg text-xs">URL</button>
                      <button type="button" onClick={() => refreshScreenPlaylist(screen.id)} className="p-2 bg-gray-700 rounded-lg" title="플레이리스트 갱신"><RefreshCw size={14} /></button>
                      <button type="button" onClick={() => openScreenModal(screen)} className="p-2 bg-gray-700 rounded-lg"><Pencil size={14} /></button>
                      <button type="button" onClick={() => deleteScreen(screen.id)} className="p-2 bg-red-900/50 rounded-lg text-red-400"><Trash2 size={14} /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {showScreenModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-md space-y-4 border border-gray-700">
            <h3 className="font-bold text-lg">{editingScreen ? '화면 수정' : '화면 추가'}</h3>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">화면 이름</label>
              <input value={screenForm.name} onChange={e => setScreenForm(f => ({ ...f, name: e.target.value }))} placeholder="예: 1번 매장 입구" className="w-full bg-gray-800 rounded-xl px-4 py-3 text-sm outline-none" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-2 block">화면 종류</label>
              <div className="grid grid-cols-3 gap-2">
                {SIGNAGE_SCREEN_KINDS.map(k => (
                  <button
                    key={k.id}
                    type="button"
                    onClick={() => setScreenForm(f => ({ ...f, screenKind: k.id }))}
                    className={`py-2 rounded-lg text-sm border ${screenForm.screenKind === k.id ? 'border-blue-500 bg-blue-900/30 text-blue-300' : 'border-gray-700 bg-gray-800 text-gray-400'}`}
                  >
                    {k.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setShowScreenModal(false)} className="flex-1 py-2.5 bg-gray-800 rounded-xl text-sm">취소</button>
              <button type="button" onClick={saveScreen} disabled={!screenForm.name.trim()} className="flex-1 py-2.5 bg-blue-600 rounded-xl text-sm font-semibold disabled:opacity-50">저장</button>
            </div>
          </div>
        </div>
      )}

      {previewContent && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={() => setPreviewContent(null)} role="presentation">
          <div className="relative w-full max-w-3xl aspect-video bg-black rounded-2xl overflow-hidden" onClick={e => e.stopPropagation()} role="dialog">
            <SignageContentPlayer content={previewContent} preview />
            <button type="button" onClick={() => setPreviewContent(null)} className="absolute top-4 right-4 p-2 bg-black/50 rounded-full text-white"><X size={20} /></button>
            {previewContent.status === 'pending' && (
              <div className="absolute bottom-4 left-4 right-4 flex gap-2">
                <button type="button" onClick={() => { approveContent(previewContent.id); setPreviewContent(null); }} className="flex-1 py-2 bg-green-600 rounded-lg text-sm font-semibold">✅ 확정</button>
                <button type="button" onClick={() => { rejectContent(previewContent.id); setPreviewContent(null); }} className="flex-1 py-2 bg-red-700 rounded-lg text-sm font-semibold">❌ 거절</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Thumb({ content }: { content: SignageContentDoc }) {
  if (content.type === 'image' && content.url) {
    return <img src={content.url} alt="" className="w-20 h-12 rounded-lg object-cover flex-shrink-0" />;
  }
  return (
    <div className="w-20 h-12 rounded-lg flex items-center justify-center text-xs flex-shrink-0" style={{ background: content.bgColor || '#1a1a2e', color: content.textColor || '#fff' }}>
      {content.title?.slice(0, 6)}
    </div>
  );
}

function ContentRow({ content, onPreview, onApprove, onReject, onDelete }: {
  content: SignageContentDoc;
  onPreview: (c: SignageContentDoc) => void;
  onApprove: () => void;
  onReject: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="bg-gray-900 rounded-2xl p-4 flex items-start gap-4">
      <button type="button" className="w-32 h-20 rounded-xl overflow-hidden flex-shrink-0 border border-gray-700" onClick={() => onPreview(content)}>
        {content.type === 'image' && content.url ? (
          <img src={content.url} alt={content.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs p-2 text-center" style={{ background: content.bgColor || '#1a1a2e', color: content.textColor || '#fff' }}>{content.title}</div>
        )}
      </button>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm mb-1">{content.title}</p>
        <p className="text-xs text-gray-500">{content.duration}초 · {content.type}</p>
      </div>
      <div className="flex flex-col gap-2">
        <button type="button" onClick={() => onPreview(content)} className="p-2 bg-gray-700 rounded-lg"><Eye size={14} /></button>
        <button type="button" onClick={onApprove} className="p-2 bg-green-700 rounded-lg"><Check size={14} /></button>
        <button type="button" onClick={onReject} className="p-2 bg-red-800 rounded-lg"><X size={14} /></button>
        <button type="button" onClick={onDelete} className="p-2 bg-gray-800 rounded-lg text-red-400"><Trash2 size={14} /></button>
      </div>
    </div>
  );
}
