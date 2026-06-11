'use client';

import { overlay } from '@/components/overlay';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  collection, query, where, orderBy, onSnapshot,
} from 'firebase/firestore';
import {
  FolderOpen, Image as ImageIcon, Loader2, Search, Trash2, Upload,
  FileText, Download, X, Link2, Calendar,
} from 'lucide-react';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase/firebase';
import { useAuth } from '@/context/AuthContext';
import { useStore } from '@/context/StoreContext';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import { MESSENGER_FILE_FOLDERS, type MessengerFileRecord } from '@/lib/messenger/fileStoreTypes';

interface RoomOption {
  id: string;
  name: string;
}

type DateFilter = 'all' | 'today' | 'week' | 'month';
type TypeFilter = 'all' | 'image' | 'pdf' | 'other';

function tsToIso(v: unknown): string | undefined {
  if (!v) return undefined;
  if (typeof v === 'object' && v !== null && 'toDate' in v) {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  return String(v);
}

function fileFromDoc(id: string, data: Record<string, unknown>): MessengerFileRecord {
  return {
    id,
    storeId: String(data.storeId || ''),
    name: String(data.name || ''),
    url: String(data.url || ''),
    type: String(data.type || 'application/octet-stream'),
    size: Number(data.size || 0),
    folderId: String(data.folderId || '기타'),
    uploadedBy: String(data.uploadedBy || ''),
    uploadedByName: data.uploadedByName ? String(data.uploadedByName) : undefined,
    roomId: data.roomId ? String(data.roomId) : undefined,
    messageId: data.messageId ? String(data.messageId) : undefined,
    storagePath: data.storagePath ? String(data.storagePath) : undefined,
    createdAt: tsToIso(data.createdAt),
  };
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function dateFilterStart(filter: DateFilter): string | null {
  if (filter === 'all') return null;
  const d = new Date();
  if (filter === 'today') d.setHours(0, 0, 0, 0);
  if (filter === 'week') d.setDate(d.getDate() - 7);
  if (filter === 'month') d.setDate(d.getDate() - 30);
  return d.toISOString();
}

function matchesTypeFilter(type: string, filter: TypeFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'image') return type.startsWith('image/');
  if (filter === 'pdf') return type === 'application/pdf' || type.includes('pdf');
  return !type.startsWith('image/') && !type.includes('pdf');
}

export default function MessengerFilesPageWrapper() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-teal-400" />
      </div>
    }>
      <MessengerFilesPage />
    </Suspense>
  );
}

function MessengerFilesPage() {
  const { user } = useAuth();
  const { currentStore } = useStore();
  const searchParams = useSearchParams();
  const storeId = currentStore?.storeId || '';

  const [files, setFiles] = useState<MessengerFileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [folderId, setFolderId] = useState('');
  const [roomFilter, setRoomFilter] = useState(searchParams.get('roomId') || '');
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [uploadFolder, setUploadFolder] = useState<string>(MESSENGER_FILE_FOLDERS[0]);
  const [uploadRoomId, setUploadRoomId] = useState('');
  const [preview, setPreview] = useState<MessengerFileRecord | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!storeId) {
      setFiles([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(
      collection(db, 'files'),
      where('storeId', '==', storeId),
      orderBy('createdAt', 'desc'),
    );
    const unsub = onSnapshot(
      q,
      snap => {
        setFiles(snap.docs.map(d => fileFromDoc(d.id, d.data() as Record<string, unknown>)));
        setLoading(false);
      },
      err => {
        console.error('[files]', err);
        setError('파일 목록을 불러오지 못했습니다.');
        setLoading(false);
      },
    );
    return () => unsub();
  }, [storeId]);

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
          name: data.name ? String(data.name) : `대화 (${members.length}명)`,
        };
      }));
    });
    return () => unsub();
  }, [user?.uid]);

  const filteredFiles = useMemo(() => {
    let list = files;
    if (folderId) list = list.filter(f => f.folderId === folderId);
    if (roomFilter) list = list.filter(f => f.roomId === roomFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(f =>
        f.name.toLowerCase().includes(q)
        || f.type.toLowerCase().includes(q)
        || f.folderId.toLowerCase().includes(q),
      );
    }
    const from = dateFilterStart(dateFilter);
    if (from) list = list.filter(f => (f.createdAt || '') >= from);
    list = list.filter(f => matchesTypeFilter(f.type, typeFilter));
    return list;
  }, [files, folderId, roomFilter, search, dateFilter, typeFilter]);

  const roomName = (roomId?: string) =>
    rooms.find(r => r.id === roomId)?.name || (roomId ? '채팅방' : '직접 업로드');

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !storeId) return;
    if (file.size > 20 * 1024 * 1024) {
      setError('20MB 이하만 업로드 가능합니다.');
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setError('');
    try {
      const path = `messenger_files/${storeId}/${uploadFolder}/${Date.now()}_${file.name}`;
      const ref = storageRef(storage, path);
      const task = uploadBytesResumable(ref, file);
      await new Promise<void>((resolve, reject) => {
        task.on(
          'state_changed',
          snap => {
            const pct = snap.totalBytes ? (snap.bytesTransferred / snap.totalBytes) * 100 : 0;
            setUploadProgress(Math.round(pct));
          },
          reject,
          resolve,
        );
      });
      const url = await getDownloadURL(task.snapshot.ref);
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/messenger/files', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          name: file.name,
          url,
          type: file.type,
          size: file.size,
          folderId: uploadFolder,
          roomId: uploadRoomId || undefined,
          storagePath: path,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '등록 실패');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '업로드 실패');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDelete = async (fileId: string) => {
    if (!storeId || !(await overlay.confirm('파일을 삭제할까요? Storage에서도 제거됩니다.'))) return;
    setError('');
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch(
        `/api/messenger/files/${encodeURIComponent(fileId)}?storeId=${encodeURIComponent(storeId)}`,
        { method: 'DELETE', headers },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '삭제 실패');
      if (preview?.id === fileId) setPreview(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '삭제 실패');
    }
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-4rem-2.5rem)] min-h-0 bg-slate-950 text-slate-200">
      <header className="shrink-0 px-4 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FolderOpen className="w-5 h-5 text-teal-400" />
          <div>
            <h1 className="text-sm font-semibold text-slate-100">파일 저장소</h1>
            <p className="text-[10px] text-slate-500">채팅 공유 파일 자동 수집 · 폴더별 관리</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={uploadFolder}
            onChange={e => setUploadFolder(e.target.value)}
            className="px-2 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg"
          >
            {MESSENGER_FILE_FOLDERS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <select
            value={uploadRoomId}
            onChange={e => setUploadRoomId(e.target.value)}
            className="px-2 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg max-w-[120px]"
          >
            <option value="">채팅방 없음</option>
            {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-500 rounded-lg text-xs cursor-pointer disabled:opacity-50">
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {uploading ? `${uploadProgress}%` : '업로드'}
            <input type="file" className="hidden" onChange={handleUpload} disabled={uploading || !storeId} />
          </label>
        </div>
      </header>

      <div className="shrink-0 px-4 py-3 border-b border-slate-800 space-y-2">
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-500" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="파일명·종류·폴더 검색"
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg"
            />
          </div>
          <select
            value={roomFilter}
            onChange={e => setRoomFilter(e.target.value)}
            className="px-2 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg"
          >
            <option value="">전체 채팅방</option>
            {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <select
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value as DateFilter)}
            className="px-2 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg"
          >
            <option value="all">전체 기간</option>
            <option value="today">오늘</option>
            <option value="week">최근 7일</option>
            <option value="month">최근 30일</option>
          </select>
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value as TypeFilter)}
            className="px-2 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg"
          >
            <option value="all">전체 종류</option>
            <option value="image">이미지</option>
            <option value="pdf">PDF</option>
            <option value="other">기타</option>
          </select>
        </div>

        <div className="flex gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setFolderId('')}
            className={`px-2.5 py-1 text-[11px] rounded-full border ${!folderId ? 'bg-teal-600/20 border-teal-500/50 text-teal-300' : 'border-slate-700 text-slate-400'}`}
          >
            전체
          </button>
          {MESSENGER_FILE_FOLDERS.map(f => (
            <button
              key={f}
              type="button"
              onClick={() => setFolderId(f)}
              className={`px-2.5 py-1 text-[11px] rounded-full border ${folderId === f ? 'bg-teal-600/20 border-teal-500/50 text-teal-300' : 'border-slate-700 text-slate-400'}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {error && (
          <p className="mb-3 text-xs text-red-300 bg-red-950/40 border border-red-900/40 rounded-lg px-3 py-2">{error}</p>
        )}
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-teal-400" /></div>
        ) : filteredFiles.length === 0 ? (
          <p className="text-center text-slate-500 py-16 text-sm">파일이 없습니다</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredFiles.map(f => (
              <div key={f.id} className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden flex flex-col">
                <button
                  type="button"
                  onClick={() => f.type.startsWith('image/') ? setPreview(f) : window.open(f.url, '_blank')}
                  className="aspect-video bg-slate-800 flex items-center justify-center overflow-hidden hover:opacity-90 transition-opacity"
                >
                  {f.type.startsWith('image/') ? (
                    <img src={f.url} alt={f.name} className="w-full h-full object-cover" />
                  ) : f.type.includes('pdf') ? (
                    <FileText className="w-10 h-10 text-red-400/80" />
                  ) : (
                    <ImageIcon className="w-10 h-10 text-slate-500" />
                  )}
                </button>
                <div className="p-3 flex-1 flex flex-col min-w-0">
                  <p className="text-xs font-medium truncate text-slate-100">{f.name}</p>
                  <p className="text-[10px] text-slate-500 mt-1">{f.folderId} · {formatSize(f.size)}</p>
                  <p className="text-[10px] text-slate-600 flex items-center gap-1 mt-0.5">
                    <Calendar className="w-3 h-3" />
                    {f.createdAt?.slice(0, 10) || '-'}
                  </p>
                  {f.roomId && (
                    <p className="text-[10px] text-slate-600 flex items-center gap-1 mt-0.5 truncate">
                      <Link2 className="w-3 h-3 shrink-0" />
                      {roomName(f.roomId)}
                    </p>
                  )}
                  <div className="flex gap-2 mt-auto pt-2">
                    <a
                      href={f.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      download={f.name}
                      className="inline-flex items-center gap-0.5 text-[11px] text-teal-400 hover:underline"
                    >
                      <Download className="w-3 h-3" /> 다운로드
                    </a>
                    <button
                      type="button"
                      onClick={() => handleDelete(f.id)}
                      className="inline-flex items-center gap-0.5 text-[11px] text-red-400 hover:underline"
                    >
                      <Trash2 className="w-3 h-3" /> 삭제
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {preview && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setPreview(null)}
          role="presentation"
        >
          <button
            type="button"
            onClick={() => setPreview(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-slate-800 text-slate-300 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={preview.url}
            alt={preview.name}
            className="max-w-full max-h-[85vh] object-contain rounded-lg"
            onClick={e => e.stopPropagation()}
          />
          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-sm text-slate-300 truncate max-w-[90vw]">
            {preview.name}
          </p>
        </div>
      )}
    </div>
  );
}
