'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  collection, query, where, onSnapshot, doc, updateDoc, setDoc, addDoc, deleteDoc,
  orderBy, getDocs, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useStore } from '@/context/StoreContext';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import {
  Plus, Play, Eye, Check, X, Tv, Trash2, ExternalLink, Wand2, Upload,
} from 'lucide-react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import SignageContentPlayer, { type SignageContent } from '@/components/signage/SignageContentPlayer';

type TabId = 'pending' | 'approved' | 'screens' | 'create';

interface ContentDoc extends SignageContent {
  id: string;
  storeId: string;
  status: string;
  duration: number;
  order: number;
  aiPrompt?: string;
  thumbnailUrl?: string;
  bgColor?: string;
  textColor?: string;
  createdAt?: unknown;
}

interface ScreenDoc {
  id: string;
  storeId: string;
  name: string;
  slug: string;
  contentIds: string[];
  isActive: boolean;
}

export default function SignagePage() {
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || process.env.NEXT_PUBLIC_DEFAULT_STORE_ID || '';

  const [tab, setTab] = useState<TabId>('create');
  const [contents, setContents] = useState<ContentDoc[]>([]);
  const [screens, setScreens] = useState<ScreenDoc[]>([]);
  const [previewContent, setPreviewContent] = useState<ContentDoc | null>(null);
  const [generating, setGenerating] = useState(false);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [createForm, setCreateForm] = useState({
    type: 'text' as 'image' | 'video' | 'text' | 'slide',
    title: '',
    prompt: '',
    duration: 10,
    bgColor: '#1a1a2e',
    textColor: '#ffffff',
  });

  useEffect(() => {
    if (!storeId) return;

    const qContents = query(
      collection(db, 'signage_content'),
      where('storeId', '==', storeId),
      orderBy('createdAt', 'desc'),
    );
    const unsubContents = onSnapshot(qContents, snap => {
      setContents(snap.docs.map(d => ({ id: d.id, ...d.data() } as ContentDoc)));
    });

    const qScreens = query(
      collection(db, 'signage_screens'),
      where('storeId', '==', storeId),
    );
    const unsubScreens = onSnapshot(qScreens, snap => {
      setScreens(snap.docs.map(d => ({ id: d.id, ...d.data() } as ScreenDoc)));
    });

    return () => {
      unsubContents();
      unsubScreens();
    };
  }, [storeId]);

  const pendingContents = contents.filter(c => c.status === 'pending');
  const approvedContents = contents
    .filter(c => c.status === 'approved')
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const syncPlaylist = useCallback(async (approvedIds?: string[]) => {
    if (!storeId) return;
    const ids = approvedIds ?? contents.filter(c => c.status === 'approved').map(c => c.id);
    await setDoc(doc(db, 'signage_playlist', storeId), {
      storeId,
      approvedIds: ids,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }, [storeId, contents]);

  const generateContent = async () => {
    if (!createForm.title || !storeId) return;
    if (createForm.type !== 'video' && !createForm.prompt) return;

    setGenerating(true);
    try {
      const headers = await getAuthJsonHeaders();
      let url = '';
      let thumbnailUrl = '';

      if (createForm.type === 'image') {
        const res = await fetch('/api/signage/generate-image', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            prompt: createForm.prompt,
            title: createForm.title,
            storeId,
          }),
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

      await addDoc(collection(db, 'signage_content'), {
        storeId,
        type: createForm.type,
        title: createForm.title,
        url,
        thumbnailUrl,
        duration: createForm.duration,
        order: contents.length,
        status: 'pending',
        aiPrompt: createForm.prompt || '',
        bgColor: createForm.bgColor,
        textColor: createForm.textColor,
        createdAt: serverTimestamp(),
        createdBy: 'ai',
      });

      setCreateForm(f => ({ ...f, title: '', prompt: '' }));
      setVideoFile(null);
      setTab('pending');
    } catch (e: unknown) {
      alert(`생성 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setGenerating(false);
    }
  };

  const approveContent = async (contentId: string) => {
    await updateDoc(doc(db, 'signage_content', contentId), {
      status: 'approved',
      approvedAt: serverTimestamp(),
    });
    const ids = [...approvedContents.map(c => c.id), contentId];
    await syncPlaylist(ids);
  };

  const rejectContent = async (contentId: string) => {
    await updateDoc(doc(db, 'signage_content', contentId), { status: 'rejected' });
    await syncPlaylist(approvedContents.map(c => c.id).filter(id => id !== contentId));
  };

  const unapproveContent = async (contentId: string) => {
    await updateDoc(doc(db, 'signage_content', contentId), { status: 'pending' });
    await syncPlaylist(approvedContents.map(c => c.id).filter(id => id !== contentId));
  };

  const onDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    const items = Array.from(approvedContents);
    const [removed] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, removed);

    await Promise.all(
      items.map((item, idx) =>
        updateDoc(doc(db, 'signage_content', item.id), { order: idx }),
      ),
    );
    await syncPlaylist(items.map(i => i.id));
  };

  const addScreen = async () => {
    const name = prompt('사이니지 이름 (예: 1번 매장 입구)');
    if (!name || !storeId) return;
    const slug = `signage-${Date.now().toString(36)}`;
    await addDoc(collection(db, 'signage_screens'), {
      storeId,
      name,
      slug,
      contentIds: approvedContents.map(c => c.id),
      isActive: true,
      createdAt: serverTimestamp(),
    });
  };

  if (!storeId) {
    return <div className="p-6 text-slate-500 text-sm">매장을 선택해 주세요</div>;
  }

  return (
    <div className="p-4 min-h-full bg-gray-950 text-white">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Tv size={20} className="text-blue-400" />
            사이니지 관리
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {screens.length}개 화면 · 승인됨 {approvedContents.length}개
          </p>
        </div>
        <button
          type="button"
          onClick={addScreen}
          className="px-3 py-2 bg-blue-600 rounded-lg text-sm flex items-center gap-1.5"
        >
          <Plus size={14} /> 화면 추가
        </button>
      </div>

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
            className={`px-4 py-2 rounded-lg text-sm flex-shrink-0 ${
              tab === t.id ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'create' && (
        <div className="space-y-4 max-w-2xl">
          <div className="bg-gray-900 rounded-2xl p-5 space-y-4">
            <h2 className="font-semibold text-blue-300 flex items-center gap-2">
              <Wand2 size={16} /> AI 콘텐츠 생성
            </h2>

            <div>
              <label className="text-xs text-gray-400 mb-2 block">콘텐츠 타입</label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { id: 'image', label: '🖼️ 이미지', desc: 'DALL-E' },
                  { id: 'text', label: '📝 텍스트', desc: 'Groq' },
                  { id: 'slide', label: '🎨 슬라이드', desc: 'Groq' },
                  { id: 'video', label: '📹 영상', desc: '업로드' },
                ].map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setCreateForm(f => ({ ...f, type: t.id as typeof f.type }))}
                    className={`p-3 rounded-xl text-center text-sm border ${
                      createForm.type === t.id
                        ? 'border-blue-500 bg-blue-900/30 text-blue-300'
                        : 'border-gray-700 bg-gray-800 text-gray-400'
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
                className="w-full bg-gray-800 rounded-xl px-4 py-3 text-sm outline-none"
              />
            </div>

            {createForm.type === 'video' ? (
              <div>
                <label className="text-xs text-gray-400 mb-1 block">영상 파일</label>
                <label className="flex items-center gap-2 px-4 py-3 bg-gray-800 rounded-xl cursor-pointer text-sm">
                  <Upload size={16} />
                  {videoFile ? videoFile.name : 'MP4 등 영상 선택'}
                  <input
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={e => setVideoFile(e.target.files?.[0] || null)}
                  />
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
                  placeholder={
                    createForm.type === 'image'
                      ? '예: 신선한 한우 갈비살, 고급스러운 정육점, 따뜻한 조명'
                      : '예: 오늘 한우 1++ 등심 100g 35,000원 특가 행사'
                  }
                  rows={3}
                  className="w-full bg-gray-800 rounded-xl px-4 py-3 text-sm outline-none resize-none"
                />
              </div>
            )}

            {(createForm.type === 'text' || createForm.type === 'slide') && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">배경색</label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={createForm.bgColor}
                      onChange={e => setCreateForm(f => ({ ...f, bgColor: e.target.value }))}
                      className="w-10 h-10 rounded cursor-pointer border-0"
                    />
                    <input
                      value={createForm.bgColor}
                      onChange={e => setCreateForm(f => ({ ...f, bgColor: e.target.value }))}
                      className="flex-1 bg-gray-800 rounded-lg px-3 text-sm outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">텍스트색</label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={createForm.textColor}
                      onChange={e => setCreateForm(f => ({ ...f, textColor: e.target.value }))}
                      className="w-10 h-10 rounded cursor-pointer border-0"
                    />
                    <input
                      value={createForm.textColor}
                      onChange={e => setCreateForm(f => ({ ...f, textColor: e.target.value }))}
                      className="flex-1 bg-gray-800 rounded-lg px-3 text-sm outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="text-xs text-gray-400 mb-1 block">
                재생 시간: {createForm.duration}초
              </label>
              <input
                type="range"
                min={5}
                max={60}
                value={createForm.duration}
                onChange={e => setCreateForm(f => ({ ...f, duration: Number(e.target.value) }))}
                className="w-full accent-blue-500"
              />
            </div>

            <button
              type="button"
              onClick={generateContent}
              disabled={
                generating || !createForm.title
                || (createForm.type !== 'video' && !createForm.prompt)
                || (createForm.type === 'video' && !videoFile)
              }
              className={`w-full py-3 rounded-xl font-semibold flex items-center justify-center gap-2 ${
                generating
                  ? 'bg-gray-700 text-gray-500'
                  : 'bg-blue-600 hover:bg-blue-500 text-white'
              }`}
            >
              {generating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  생성 중...
                </>
              ) : (
                <>
                  <Wand2 size={16} />
                  {createForm.type === 'video' ? '영상 등록하기' : 'AI로 생성하기'}
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {tab === 'pending' && (
        <div className="space-y-3">
          {pendingContents.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Tv size={40} className="mx-auto mb-3 opacity-30" />
              <p>펜딩 콘텐츠 없음</p>
            </div>
          ) : (
            pendingContents.map(content => (
              <div key={content.id} className="bg-gray-900 rounded-2xl p-4">
                <div className="flex items-start gap-4">
                  <button
                    type="button"
                    className="w-32 h-20 rounded-xl overflow-hidden flex-shrink-0 border border-gray-700 hover:border-blue-500"
                    onClick={() => setPreviewContent(content)}
                  >
                    {content.type === 'image' && content.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={content.url} alt={content.title} className="w-full h-full object-cover" />
                    ) : (
                      <div
                        className="w-full h-full flex items-center justify-center text-xs p-2 text-center"
                        style={{
                          background: content.bgColor || '#1a1a2e',
                          color: content.textColor || '#fff',
                        }}
                      >
                        {content.title}
                      </div>
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm mb-1">{content.title}</p>
                    <p className="text-xs text-gray-500">{content.duration}초 · {content.type}</p>
                    {content.aiPrompt && (
                      <p className="text-xs text-gray-600 truncate mt-1">{content.aiPrompt}</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <button type="button" onClick={() => setPreviewContent(content)} className="p-2 bg-gray-700 rounded-lg">
                      <Eye size={14} />
                    </button>
                    <button type="button" onClick={() => approveContent(content.id)} className="p-2 bg-green-700 rounded-lg">
                      <Check size={14} />
                    </button>
                    <button type="button" onClick={() => rejectContent(content.id)} className="p-2 bg-red-800 rounded-lg">
                      <X size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'approved' && (
        <div className="space-y-3">
          <div className="bg-green-900/20 border border-green-800/50 rounded-xl p-3 text-sm text-green-300 flex items-center gap-2">
            <Play size={14} />
            확정된 콘텐츠가 사이니지에서 순서대로 재생됩니다 (드래그로 순서 변경)
          </div>
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="approved">
              {provided => (
                <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                  {approvedContents.map((content, idx) => (
                    <Draggable key={content.id} draggableId={content.id} index={idx}>
                      {dragProvided => (
                        <div
                          ref={dragProvided.innerRef}
                          {...dragProvided.draggableProps}
                          {...dragProvided.dragHandleProps}
                          className="bg-gray-900 rounded-2xl p-4 flex items-center gap-4"
                        >
                          <span className="text-2xl font-bold text-gray-600 w-8">{idx + 1}</span>
                          <div className="w-20 h-12 rounded-lg overflow-hidden flex-shrink-0">
                            {content.type === 'image' && content.url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={content.url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div
                                className="w-full h-full flex items-center justify-center text-xs"
                                style={{
                                  background: content.bgColor || '#1a1a2e',
                                  color: content.textColor || '#fff',
                                }}
                              >
                                {content.title?.slice(0, 8)}
                              </div>
                            )}
                          </div>
                          <div className="flex-1">
                            <p className="font-medium text-sm">{content.title}</p>
                            <p className="text-xs text-gray-400">{content.duration}초</p>
                          </div>
                          <button type="button" onClick={() => setPreviewContent(content)} className="p-2 bg-gray-700 rounded-lg">
                            <Eye size={14} />
                          </button>
                          <button type="button" onClick={() => unapproveContent(content.id)} className="p-2 bg-gray-700 rounded-lg text-red-400">
                            <X size={14} />
                          </button>
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
              <Tv size={40} className="mx-auto mb-3 opacity-30" />
              <p>등록된 사이니지 화면이 없습니다</p>
              <button type="button" onClick={addScreen} className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">
                + 화면 추가
              </button>
            </div>
          ) : (
            screens.map(screen => (
              <div key={screen.id} className="bg-gray-900 rounded-2xl p-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Tv size={16} className="text-blue-400" />
                      <span className="font-medium">{screen.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        screen.isActive ? 'bg-green-900/50 text-green-300' : 'bg-gray-700 text-gray-400'
                      }`}>
                        {screen.isActive ? '활성' : '비활성'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">/signage/{screen.slug}</p>
                  </div>
                  <div className="flex gap-2">
                    <a
                      href={`/signage/${screen.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 bg-blue-700 rounded-lg hover:bg-blue-600"
                      title="사이니지 열기"
                    >
                      <ExternalLink size={14} />
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/signage/${screen.slug}`);
                        alert('URL 복사됨!');
                      }}
                      className="px-3 py-2 bg-gray-700 rounded-lg text-xs"
                    >
                      URL 복사
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteDoc(doc(db, 'signage_screens', screen.id))}
                      className="p-2 bg-red-900/50 rounded-lg text-red-400"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {previewContent && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setPreviewContent(null)}
          role="presentation"
        >
          <div
            className="relative w-full max-w-3xl aspect-video bg-black rounded-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
            role="dialog"
          >
            <SignageContentPlayer content={previewContent} preview />
            <button
              type="button"
              onClick={() => setPreviewContent(null)}
              className="absolute top-4 right-4 p-2 bg-black/50 rounded-full text-white"
            >
              <X size={20} />
            </button>
            {previewContent.status === 'pending' && (
              <div className="absolute bottom-4 left-4 right-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => { approveContent(previewContent.id); setPreviewContent(null); }}
                  className="flex-1 py-2 bg-green-600 rounded-lg text-sm font-semibold"
                >
                  ✅ 확정
                </button>
                <button
                  type="button"
                  onClick={() => { rejectContent(previewContent.id); setPreviewContent(null); }}
                  className="flex-1 py-2 bg-red-700 rounded-lg text-sm font-semibold"
                >
                  ❌ 거절
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
