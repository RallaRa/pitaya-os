'use client';

import { useRef, useState } from 'react';
import { ShoppingCart, Upload, X, FileImage, FileSpreadsheet } from 'lucide-react';

export default function PurchaseInputPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachedFile, setAttachedFile] = useState<{ name: string; preview?: string } | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAttachedFile({ name: file.name, preview: reader.result as string });
      };
      reader.readAsDataURL(file);
    } else {
      setAttachedFile({ name: file.name });
    }
  };

  const handleCancel = () => {
    setAttachedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 p-6 md:p-8">
      {/* 헤더 */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-teal-900/30 border border-teal-500/30 rounded-2xl mb-4">
          <ShoppingCart className="w-7 h-7 text-teal-400" />
        </div>
        <h1 className="text-2xl font-bold text-slate-100">AI 매입관리</h1>
        <p className="text-slate-400 text-sm mt-2">
          거래명세서, 매입전표, 계산서 사진을 업로드하세요
        </p>
      </div>

      {/* 업로드 영역 */}
      <div className="max-w-xl mx-auto w-full space-y-4">
        {/* 드래그 앤 드롭 존 */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full border-2 border-dashed border-slate-700 hover:border-teal-500/60
            bg-slate-900/50 hover:bg-slate-900 rounded-2xl p-10
            flex flex-col items-center gap-3 transition-colors group"
        >
          <Upload className="w-10 h-10 text-slate-500 group-hover:text-teal-400 transition-colors" />
          <span className="text-slate-400 group-hover:text-slate-300 font-medium transition-colors">
            사진 또는 파일 업로드
          </span>
          <span className="text-slate-600 text-xs">JPG, PNG, PDF, XLSX 지원</span>
        </button>

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/*,.pdf,.xlsx,.xls,.csv"
          onChange={handleFileChange}
        />

        {/* 첨부된 파일 미리보기 */}
        {attachedFile && (
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 flex items-center gap-4">
            {attachedFile.preview ? (
              <img
                src={attachedFile.preview}
                alt="미리보기"
                className="w-16 h-16 object-cover rounded-lg border border-slate-700 flex-shrink-0"
              />
            ) : (
              <div className="w-16 h-16 bg-slate-800 rounded-lg border border-slate-700 flex items-center justify-center flex-shrink-0">
                <FileSpreadsheet className="w-7 h-7 text-teal-400" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-slate-200 font-medium text-sm truncate">{attachedFile.name}</p>
              <p className="text-slate-500 text-xs mt-0.5">업로드 준비 완료</p>
            </div>
            <button
              type="button"
              onClick={handleCancel}
              className="text-slate-500 hover:text-slate-300 p-1 transition-colors flex-shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* 분석 버튼 (기능 미구현) */}
        <button
          type="button"
          disabled
          className="w-full bg-teal-600/40 text-teal-300/60 font-bold py-3.5 rounded-xl
            cursor-not-allowed text-sm"
        >
          AI 분석 시작 (준비 중)
        </button>

        <p className="text-center text-slate-600 text-xs">
          AI가 문서를 읽고 매입 항목, 금액, 공급업체를 자동으로 추출합니다
        </p>
      </div>
    </div>
  );
}
