'use client';

import { useState } from 'react';
import {
  Upload, Download, Sparkles, Loader2, CheckCircle, Trash2,
  ExternalLink, FileText, AlertCircle,
} from 'lucide-react';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import {
  HR_DOC_TYPES,
  HrDocTypeId,
  HrEmployeeDocument,
  applyHrDocExtracted,
  readFileAsDataURL,
} from '@/lib/hrEmployeeDocs';

interface Props {
  storeId: string;
  empNo: string;
  linkedUid: string;
  documents: HrEmployeeDocument[];
  onChange: (docs: HrEmployeeDocument[]) => void;
  onApplyExtracted: (patch: Record<string, unknown>) => void;
  disabled?: boolean;
}

export default function EmployeeDocumentsPanel({
  storeId,
  empNo,
  linkedUid,
  documents,
  onChange,
  onApplyExtracted,
  disabled = false,
}: Props) {
  const [uploading, setUploading] = useState<HrDocTypeId | null>(null);
  const [analyzing, setAnalyzing] = useState<HrDocTypeId | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  const showToast = (ok: boolean, msg: string) => {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 2500);
  };

  const docForType = (type: HrDocTypeId) => documents.find(d => d.docType === type) || null;

  const handleUpload = async (docType: HrDocTypeId, file: File) => {
    if (disabled) return;
    setUploading(docType);
    try {
      const fileContent = await readFileAsDataURL(file);
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/hr/employees/upload', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          storeId,
          empNo: empNo || undefined,
          linkedUid: linkedUid || undefined,
          docType,
          fileName: file.name,
          fileContent,
          mimeType: file.type || 'application/octet-stream',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '업로드 실패');

      const newDoc: HrEmployeeDocument = {
        docType,
        fileName: data.fileName,
        fileUrl: data.fileUrl,
        filePath: data.filePath,
        mimeType: data.mimeType,
        uploadedAt: data.uploadedAt,
        extractedData: null,
      };

      onChange([
        ...documents.filter(d => d.docType !== docType),
        newDoc,
      ]);
      showToast(true, '파일이 업로드되었습니다.');
    } catch (e: unknown) {
      showToast(false, e instanceof Error ? e.message : '업로드 실패');
    } finally {
      setUploading(null);
    }
  };

  const handleAnalyze = async (docType: HrDocTypeId) => {
    const doc = docForType(docType);
    if (!doc || disabled) return;
    setAnalyzing(docType);
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/hr/employees/analyze', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          docType,
          filePath: doc.filePath,
          mimeType: doc.mimeType,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI 분석 실패');

      const extracted = data.extracted as Record<string, unknown>;
      onChange(documents.map(d =>
        d.docType === docType ? { ...d, extractedData: extracted } : d
      ));

      const patch = applyHrDocExtracted(docType, extracted);
      if (Object.keys(patch).length > 0) {
        onApplyExtracted(patch);
        showToast(true, 'AI 분석 완료 — 항목에 반영되었습니다.');
      } else {
        showToast(true, 'AI 분석 완료');
      }
    } catch (e: unknown) {
      showToast(false, e instanceof Error ? e.message : 'AI 분석 실패');
    } finally {
      setAnalyzing(null);
    }
  };

  const handleDelete = (docType: HrDocTypeId) => {
    if (disabled) return;
    if (!confirm('첨부파일을 삭제하시겠습니까?')) return;
    onChange(documents.filter(d => d.docType !== docType));
    showToast(true, '삭제되었습니다.');
  };

  const handleDownload = async (doc: HrEmployeeDocument) => {
    try {
      const res = await fetch(doc.fileUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      window.open(doc.fileUrl, '_blank');
    }
  };

  const handleReApply = (docType: HrDocTypeId) => {
    const doc = docForType(docType);
    if (!doc?.extractedData) return;
    const patch = applyHrDocExtracted(docType, doc.extractedData as Record<string, unknown>);
    onApplyExtracted(patch);
    showToast(true, '항목에 다시 반영했습니다.');
  };

  return (
    <div className="space-y-4">
      <div className="bg-teal-900/10 border border-teal-500/20 rounded-xl px-4 py-3 text-xs text-teal-300">
        계약서·보건증·통장사본을 업로드하면 AI가 내용을 읽어 해당 항목에 자동 반영합니다.
        저장 후에도 파일을 다운로드할 수 있습니다.
      </div>

      {HR_DOC_TYPES.map(type => {
        const doc = docForType(type.id);
        const isUploading = uploading === type.id;
        const isAnalyzing = analyzing === type.id;

        return (
          <div
            key={type.id}
            className={`bg-slate-900 border rounded-xl overflow-hidden ${doc ? 'border-teal-500/30' : 'border-slate-700'}`}
          >
            <div className="flex items-center justify-between p-4 gap-3 flex-wrap">
              <div className="flex items-center gap-3 min-w-0">
                <div className="text-2xl">{type.icon}</div>
                <div>
                  <p className="text-white font-semibold text-sm">{type.label}</p>
                  <p className="text-slate-500 text-xs">{type.desc}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {doc ? (
                  <span className="text-xs text-green-400 bg-green-900/30 border border-green-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> 등록됨
                  </span>
                ) : (
                  <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">미등록</span>
                )}
                {!disabled && (
                  <label className={`cursor-pointer flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-300 text-xs rounded-lg transition-colors ${isUploading ? 'opacity-60 pointer-events-none' : ''}`}>
                    {isUploading ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> 업로드 중...</>
                    ) : (
                      <><Upload className="w-3.5 h-3.5" />{doc ? '교체' : '업로드'}</>
                    )}
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      className="hidden"
                      disabled={isUploading}
                      onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) handleUpload(type.id, f);
                        e.target.value = '';
                      }}
                    />
                  </label>
                )}
              </div>
            </div>

            {doc && (
              <div className="border-t border-slate-800 p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 text-slate-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm text-slate-200 truncate">{doc.fileName}</p>
                      <p className="text-[10px] text-slate-600">
                        {doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleString('ko-KR') : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => window.open(doc.fileUrl, '_blank')}
                      className="p-1.5 text-slate-400 hover:text-teal-400 rounded-lg"
                      title="새 탭에서 보기"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownload(doc)}
                      className="p-1.5 text-slate-400 hover:text-blue-400 rounded-lg"
                      title="다운로드"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    {!disabled && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleAnalyze(type.id)}
                          disabled={isAnalyzing}
                          className="p-1.5 text-slate-400 hover:text-teal-400 rounded-lg disabled:opacity-50"
                          title="AI 분석 및 항목 반영"
                        >
                          {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(type.id)}
                          className="p-1.5 text-slate-400 hover:text-red-400 rounded-lg"
                          title="삭제"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {doc.extractedData && Object.keys(doc.extractedData).length > 0 && (
                  <div className="bg-slate-800/60 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] font-semibold text-teal-400 uppercase">AI 추출 내용</p>
                      {!disabled && (
                        <button
                          type="button"
                          onClick={() => handleReApply(type.id)}
                          className="text-[10px] text-teal-400 hover:text-teal-300"
                        >
                          항목에 다시 반영
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                      {Object.entries(doc.extractedData).filter(([, v]) => v != null && v !== '').map(([k, v]) => (
                        <div key={k} className="text-xs">
                          <span className="text-slate-500">{k}: </span>
                          <span className="text-slate-300">{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm ${
          toast.ok ? 'bg-teal-600 text-white' : 'bg-red-700 text-white'
        }`}>
          {toast.ok ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}
