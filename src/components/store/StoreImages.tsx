'use client';

import { useState, useEffect, useCallback } from 'react';
import { FileText, X, Loader2, ImageIcon, CheckCircle, AlertCircle } from 'lucide-react';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import {
  STORE_IMAGE_TYPES,
  StoreImageMeta,
  formatFileSize,
  compressStoreImage,
  readFileAsDataURL,
} from '@/lib/storeImages';

interface Props {
  storeId: string;
  canManage?: boolean;
}

export default function StoreImages({ storeId, canManage = false }: Props) {
  const [storeImages, setStoreImages] = useState<Record<string, StoreImageMeta[]>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  const showToast = (ok: boolean, msg: string) => {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 2500);
  };

  const fetchImages = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch(`/api/store/images?storeId=${storeId}`, { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStoreImages(data.images || {});
    } catch (e: any) {
      showToast(false, e.message || '이미지 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { fetchImages(); }, [fetchImages]);

  const handleImageUpload = async (files: FileList | null, category: string) => {
    if (!files || files.length === 0 || !canManage) return;
    setUploading(prev => ({ ...prev, [category]: true }));

    try {
      const prepared = await Promise.all(
        Array.from(files).map(async f => {
          const uploadFile = await compressStoreImage(f);
          const fileContent = await readFileAsDataURL(uploadFile);
          return {
            fileName: uploadFile.name,
            fileContent,
            mimeType: uploadFile.type || f.type,
            fileSize: uploadFile.size,
          };
        })
      );

      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/store/images', {
        method: 'POST',
        headers,
        body: JSON.stringify({ storeId, category, files: prepared }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const uploaded: StoreImageMeta[] = data.uploaded || [];
      setStoreImages(prev => ({
        ...prev,
        [category]: [...(prev[category] || []), ...uploaded],
      }));
      showToast(true, '이미지가 업로드됐습니다.');
    } catch (e: any) {
      showToast(false, `업로드 실패: ${e.message}`);
    } finally {
      setUploading(prev => ({ ...prev, [category]: false }));
    }
  };

  const handleImageDelete = async (image: StoreImageMeta, category: string) => {
    if (!canManage) return;
    if (!confirm(`"${image.fileName}"을(를) 삭제하시겠습니까?`)) return;

    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/store/images', {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ storeId, category, storagePath: image.storagePath }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setStoreImages(prev => ({
        ...prev,
        [category]: (prev[category] || []).filter(i => i.storagePath !== image.storagePath),
      }));
      showToast(true, '삭제됐습니다.');
    } catch (e: any) {
      showToast(false, `삭제 실패: ${e.message}`);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="w-6 h-6 text-teal-400 animate-spin" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {STORE_IMAGE_TYPES.map(type => (
          <div key={type.id} className="border border-slate-700 rounded-xl p-4 bg-slate-800/30">
            <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
              <h4 className="font-medium text-slate-200 flex items-center gap-2 text-sm">
                <span>{type.icon}</span>
                {type.label}
                <span className="text-xs text-slate-500">
                  ({storeImages[type.id]?.length || 0}개)
                </span>
              </h4>

              {canManage && (
                <label className={`cursor-pointer px-3 py-1.5 bg-teal-600 text-white text-xs rounded-lg hover:bg-teal-500 flex items-center gap-1 transition-colors ${uploading[type.id] ? 'opacity-60 pointer-events-none' : ''}`}>
                  {uploading[type.id] ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> 업로드 중...</>
                  ) : (
                    '+ 추가'
                  )}
                  <input
                    type="file"
                    multiple
                    accept="image/*,.pdf"
                    className="hidden"
                    disabled={uploading[type.id]}
                    onChange={e => {
                      handleImageUpload(e.target.files, type.id);
                      e.target.value = '';
                    }}
                  />
                </label>
              )}
            </div>

            {storeImages[type.id]?.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {storeImages[type.id].map(img => (
                  <div
                    key={img.storagePath}
                    className="relative group border border-slate-700 rounded-lg overflow-hidden bg-slate-900"
                  >
                    {img.mimeType?.startsWith('image/') ? (
                      <img
                        src={img.fileUrl}
                        alt={img.fileName}
                        className="w-full h-32 object-cover cursor-pointer"
                        onClick={() => setPreview(img.fileUrl)}
                      />
                    ) : (
                      <div
                        className="w-full h-32 bg-slate-800 flex items-center justify-center cursor-pointer hover:bg-slate-750"
                        onClick={() => window.open(img.fileUrl, '_blank')}
                      >
                        <FileText className="text-slate-500" size={32} />
                      </div>
                    )}

                    <div className="p-2">
                      <p className="text-xs text-slate-400 truncate">{img.fileName}</p>
                      <p className="text-xs text-slate-600">{formatFileSize(img.fileSize)}</p>
                    </div>

                    {canManage && (
                      <button
                        type="button"
                        onClick={() => handleImageDelete(img, type.id)}
                        className="absolute top-1 right-1 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                        aria-label="삭제"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500 text-center py-6 flex flex-col items-center gap-2">
                <ImageIcon className="w-5 h-5 opacity-40" />
                등록된 이미지가 없습니다
              </p>
            )}
          </div>
        ))}
      </div>

      {preview && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setPreview(null)}
        >
          <div className="relative max-w-4xl w-full" onClick={e => e.stopPropagation()}>
            <img
              src={preview}
              className="w-full max-h-[85vh] object-contain rounded-lg"
              alt="미리보기"
            />
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="absolute top-2 right-2 bg-white/20 text-white rounded-full p-2 hover:bg-white/40"
            >
              <X size={20} />
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm ${
          toast.ok ? 'bg-teal-600 text-white' : 'bg-red-700 text-white'
        }`}>
          {toast.ok ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}
    </>
  );
}
