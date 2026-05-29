'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  FileText, Shield, Globe, CreditCard, Building2, Plus,
  Upload, Trash2, Sparkles, AlertTriangle, CheckCircle,
  Clock, X, Loader2, ExternalLink, ChevronDown, ChevronUp,
  RefreshCw, Download,
} from 'lucide-react';
import { getAuthHeaders, getAuthJsonHeaders } from '@/lib/getAuthHeaders';

// ─────────────────────────────────────────
// 문서 유형 정의
// ─────────────────────────────────────────
const DOC_TYPES = [
  {
    id: 'business_registration',
    label: '사업자등록증',
    icon: Building2,
    color: 'blue',
    hasExpiry: false,
    desc: '사업자 기본 정보 자동 추출 지원',
  },
  {
    id: 'sanitation_permit',
    label: '위생허가증',
    icon: Shield,
    color: 'green',
    hasExpiry: true,
    renewalMonths: 12,
    desc: '식품위생법 기준 연 갱신',
  },
  {
    id: 'online_sales_permit',
    label: '통신판매신고증',
    icon: Globe,
    color: 'purple',
    hasExpiry: true,
    renewalMonths: 36,
    desc: '통신판매업 신고 서류',
  },
  {
    id: 'business_account',
    label: '사업용계좌 사본',
    icon: CreditCard,
    color: 'teal',
    hasExpiry: false,
    desc: '거래 통장 사본',
  },
  {
    id: 'other',
    label: '기타 서류',
    icon: FileText,
    color: 'slate',
    hasExpiry: true,
    desc: '기타 허가증, 증명서 등',
  },
] as const;

type DocTypeId = (typeof DOC_TYPES)[number]['id'];

interface StoreDocument {
  docId: string;
  storeId: string;
  docType: string;
  docName: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  issueDate: string | null;
  expiryDate: string | null;
  notes: string;
  extractedData: Record<string, any> | null;
  uploadedAt: string | null;
}

interface ApplyData {
  businessNumber?: string;
  ownerName?: string;
  storeName?: string;
  address?: string;
}

interface Props {
  storeId: string;
  onApplyStoreInfo?: (data: ApplyData) => void;
}

// ─────────────────────────────────────────
// 날짜 유틸
// ─────────────────────────────────────────
function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function expiryStatus(days: number | null) {
  if (days === null) return null;
  if (days < 0) return 'expired';
  if (days <= 7) return 'critical';
  if (days <= 30) return 'warning';
  return 'ok';
}

const COLOR_MAP: Record<DocTypeId, string> = {
  business_registration: 'blue',
  sanitation_permit: 'green',
  online_sales_permit: 'purple',
  business_account: 'teal',
  other: 'slate',
};

const ICON_BG: Record<string, string> = {
  blue: 'bg-blue-900/30 text-blue-400',
  green: 'bg-green-900/30 text-green-400',
  purple: 'bg-purple-900/30 text-purple-400',
  teal: 'bg-teal-900/30 text-teal-400',
  slate: 'bg-slate-700 text-slate-400',
};

const BORDER_COLOR: Record<string, string> = {
  blue: 'border-blue-500/40',
  green: 'border-green-500/40',
  purple: 'border-purple-500/40',
  teal: 'border-teal-500/40',
  slate: 'border-slate-600',
};

// ─────────────────────────────────────────
// 파일 읽기 헬퍼
// ─────────────────────────────────────────
function readFileAsDataURL(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(f);
  });
}

// ─────────────────────────────────────────
// 다운로드 헬퍼
// ─────────────────────────────────────────
async function downloadFile(fileUrl: string, fileName: string) {
  try {
    const res = await fetch(fileUrl);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName || 'document';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch {
    window.open(fileUrl, '_blank');
  }
}

// ─────────────────────────────────────────
// 다중 파일 업로드 모달
// ─────────────────────────────────────────
type FileStatus = 'pending' | 'uploading' | 'analyzing' | 'done' | 'error';

interface FileEntry {
  file: File;
  docName: string;
  preview: string | null;
  status: FileStatus;
  result?: StoreDocument;
  extracted?: Record<string, any> | null;
  errorMsg?: string;
}

function UploadModal({
  docTypeId,
  docTypeLabel,
  storeId,
  onClose,
  onUploaded,
}: {
  docTypeId: string;
  docTypeLabel: string;
  storeId: string;
  onClose: () => void;
  onUploaded: (doc: StoreDocument, extracted: Record<string, any> | null) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [issueDate, setIssueDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [processing, setProcessing] = useState(false);
  const [doneCount, setDoneCount] = useState(0);

  const addFiles = useCallback((fileList: FileList | File[]) => {
    const arr = Array.from(fileList);
    const newEntries: FileEntry[] = arr.map(f => ({
      file: f,
      docName: f.name.replace(/\.[^/.]+$/, ''),
      preview: null,
      status: 'pending',
    }));

    setEntries(prev => {
      const combined = [...prev, ...newEntries];
      // 이미지 미리보기 로드 (인덱스는 합산 후 기준)
      newEntries.forEach((entry, relIdx) => {
        const absIdx = prev.length + relIdx;
        if (entry.file.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = e => {
            setEntries(cur =>
              cur.map((en, i) => i === absIdx ? { ...en, preview: e.target?.result as string } : en)
            );
          };
          reader.readAsDataURL(entry.file);
        }
      });
      return combined;
    });
  }, []);

  const removeEntry = (idx: number) => {
    setEntries(prev => prev.filter((_, i) => i !== idx));
  };

  const updateDocName = (idx: number, name: string) => {
    setEntries(prev => prev.map((e, i) => i === idx ? { ...e, docName: name } : e));
  };

  const uploadAll = async (withAnalysis: boolean) => {
    const pending = entries.filter(e => e.status === 'pending' || e.status === 'error');
    if (pending.length === 0) return;

    setProcessing(true);
    setDoneCount(0);

    let completed = 0;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (entry.status !== 'pending' && entry.status !== 'error') continue;

      setEntries(prev => prev.map((e, j) => j === i ? { ...e, status: 'uploading', errorMsg: undefined } : e));

      try {
        const fileContent = await readFileAsDataURL(entry.file);
        const headers = await getAuthJsonHeaders();

        const uploadRes = await fetch('/api/store/documents', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            storeId,
            docType: docTypeId,
            docName: entry.docName,
            fileName: entry.file.name,
            fileContent,
            mimeType: entry.file.type,
            issueDate: issueDate || null,
            expiryDate: expiryDate || null,
            notes,
          }),
        });

        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) throw new Error(uploadData.error || '업로드 실패');

        const newDoc: StoreDocument = {
          docId: uploadData.docId,
          storeId,
          docType: docTypeId,
          docName: entry.docName,
          fileName: entry.file.name,
          fileUrl: uploadData.fileUrl,
          mimeType: entry.file.type,
          issueDate: issueDate || null,
          expiryDate: expiryDate || null,
          notes,
          extractedData: null,
          uploadedAt: new Date().toISOString(),
        };

        let extracted: Record<string, any> | null = null;

        if (withAnalysis) {
          setEntries(prev => prev.map((e, j) => j === i ? { ...e, status: 'analyzing' } : e));

          const analyzeRes = await fetch('/api/store/documents/analyze', {
            method: 'POST',
            headers,
            body: JSON.stringify({ docId: uploadData.docId }),
          });
          const analyzeData = await analyzeRes.json();

          if (analyzeRes.ok && analyzeData.extracted) {
            extracted = analyzeData.extracted;
            newDoc.extractedData = extracted;

            const autoExpiry = extracted?.expiryDate || extracted?.renewDate || null;
            const autoIssue = extracted?.issueDate || extracted?.openDate || extracted?.reportDate || null;

            if (autoExpiry && !newDoc.expiryDate) {
              await fetch('/api/store/documents', {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ docId: newDoc.docId, expiryDate: autoExpiry, issueDate: autoIssue || newDoc.issueDate }),
              });
              newDoc.expiryDate = autoExpiry;
              if (autoIssue) newDoc.issueDate = autoIssue;
            } else if (autoIssue && !newDoc.issueDate) {
              await fetch('/api/store/documents', {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ docId: newDoc.docId, issueDate: autoIssue }),
              });
              newDoc.issueDate = autoIssue;
            }
          }
        }

        setEntries(prev => prev.map((e, j) => j === i ? { ...e, status: 'done', result: newDoc, extracted } : e));
        onUploaded(newDoc, extracted);

      } catch (err: any) {
        setEntries(prev => prev.map((e, j) => j === i ? { ...e, status: 'error', errorMsg: err.message } : e));
      }

      completed++;
      setDoneCount(completed);
    }

    setProcessing(false);
  };

  const hasPending = entries.some(e => e.status === 'pending' || e.status === 'error');
  const allDone = entries.length > 0 && entries.every(e => e.status === 'done');
  const pendingCount = entries.filter(e => e.status === 'pending' || e.status === 'error').length;
  const totalProcessed = entries.filter(e => e.status === 'done').length;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && !processing && onClose()}
    >
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-700">
          <h3 className="text-white font-bold">{docTypeLabel} 업로드</h3>
          <button
            onClick={() => !processing && onClose()}
            disabled={processing}
            className="text-slate-400 hover:text-white disabled:opacity-30"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* 드롭존 */}
          <div
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); if (!processing) addFiles(e.dataTransfer.files); }}
            onClick={() => !processing && fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-5 text-center transition-colors ${
              processing ? 'border-slate-700 cursor-not-allowed' : 'border-slate-600 hover:border-teal-500 cursor-pointer'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              multiple
              className="hidden"
              onChange={e => e.target.files && addFiles(e.target.files)}
            />
            <Upload className="w-7 h-7 text-slate-500 mx-auto mb-2" />
            <p className="text-slate-400 text-sm">JPG, PNG, PDF — 여러 파일 한 번에 선택 가능</p>
            <p className="text-slate-600 text-xs mt-1">파일당 최대 15MB · 드래그 또는 클릭</p>
          </div>

          {/* 파일 목록 */}
          {entries.length > 0 && (
            <div className="space-y-2">
              <p className="text-slate-500 text-xs">{entries.length}개 파일 선택됨</p>
              {entries.map((entry, i) => (
                <div key={i} className="flex items-center gap-2 bg-slate-800 rounded-xl p-3">
                  {/* 미리보기 섬네일 or 아이콘 */}
                  {entry.preview ? (
                    <img src={entry.preview} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="w-9 h-9 bg-slate-700 rounded-lg flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-slate-400" />
                    </div>
                  )}

                  {/* 이름 + 상태 */}
                  <div className="flex-1 min-w-0">
                    <input
                      type="text"
                      value={entry.docName}
                      onChange={e => updateDocName(i, e.target.value)}
                      disabled={entry.status !== 'pending' && entry.status !== 'error'}
                      className="w-full bg-transparent text-slate-200 text-sm focus:outline-none focus:text-white disabled:text-slate-400 truncate"
                    />
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {entry.status === 'pending' && (
                        <span className="text-slate-600 text-xs">{(entry.file.size / 1024).toFixed(0)} KB</span>
                      )}
                      {entry.status === 'uploading' && (
                        <span className="flex items-center gap-1 text-teal-400 text-xs">
                          <Loader2 className="w-3 h-3 animate-spin" /> 업로드 중
                        </span>
                      )}
                      {entry.status === 'analyzing' && (
                        <span className="flex items-center gap-1 text-teal-400 text-xs">
                          <Sparkles className="w-3 h-3 animate-pulse" /> AI 분석 중
                        </span>
                      )}
                      {entry.status === 'done' && (
                        <span className="flex items-center gap-1 text-green-400 text-xs">
                          <CheckCircle className="w-3 h-3" /> 완료
                        </span>
                      )}
                      {entry.status === 'error' && (
                        <span className="flex items-center gap-1 text-red-400 text-xs">
                          <AlertTriangle className="w-3 h-3" /> {entry.errorMsg || '오류'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 삭제 버튼 (업로드 전/오류만) */}
                  {!processing && (entry.status === 'pending' || entry.status === 'error') && (
                    <button
                      onClick={() => removeEntry(i)}
                      className="shrink-0 text-slate-500 hover:text-red-400 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 공통 날짜/메모 필드 */}
          {entries.length > 0 && hasPending && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 text-xs mb-1 block">발급일 (공통 적용)</label>
                  <input
                    type="date"
                    value={issueDate}
                    onChange={e => setIssueDate(e.target.value)}
                    disabled={processing}
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-teal-500 disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="text-slate-400 text-xs mb-1 block">만료/갱신일 (공통 적용)</label>
                  <input
                    type="date"
                    value={expiryDate}
                    onChange={e => setExpiryDate(e.target.value)}
                    disabled={processing}
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-teal-500 disabled:opacity-50"
                  />
                </div>
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">메모 (공통 적용)</label>
                <input
                  type="text"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  disabled={processing}
                  placeholder="선택사항"
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 text-sm placeholder:text-slate-600 focus:outline-none focus:border-teal-500 disabled:opacity-50"
                />
              </div>
              <p className="text-slate-600 text-xs">날짜 미입력 시 AI 분석으로 자동 추출됩니다.</p>
            </>
          )}

          {/* 진행 상황 */}
          {processing && (
            <div className="bg-teal-950/30 border border-teal-500/20 rounded-xl px-4 py-3 text-center">
              <p className="text-teal-400 text-sm">
                처리 중 {totalProcessed}/{entries.length}개 완료...
              </p>
              <div className="mt-2 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-teal-500 transition-all duration-300"
                  style={{ width: `${(totalProcessed / entries.length) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* 버튼 */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => !processing && onClose()}
              disabled={processing}
              className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors disabled:opacity-40"
            >
              {allDone ? '닫기' : '취소'}
            </button>
            {!allDone && (
              <>
                <button
                  onClick={() => uploadAll(false)}
                  disabled={entries.length === 0 || processing || !hasPending}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-40"
                >
                  {processing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  저장 ({pendingCount}개)
                </button>
                <button
                  onClick={() => uploadAll(true)}
                  disabled={entries.length === 0 || processing || !hasPending}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-40"
                >
                  {processing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  AI 분석
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// 분석 결과 표시
// ─────────────────────────────────────────
function ExtractedDataCard({
  extracted,
  docType,
  onApply,
}: {
  extracted: Record<string, any>;
  docType: string;
  onApply?: (data: ApplyData) => void;
}) {
  const canApply = docType === 'business_registration' && onApply;

  const applyData: ApplyData = {
    businessNumber: extracted.businessNumber,
    ownerName: extracted.ownerName,
    storeName: extracted.storeName,
    address: extracted.address,
  };

  const entries = Object.entries(extracted).filter(([, v]) => v && v !== 'null');

  const LABELS: Record<string, string> = {
    businessNumber: '사업자번호',
    ownerName: '대표자명',
    storeName: '상호',
    address: '주소',
    businessType: '업태',
    businessItem: '종목',
    openDate: '개업일',
    expiryDate: '만료일',
    issueDate: '발급일',
    reportDate: '신고일',
    permitNumber: '허가번호',
    reportNumber: '신고번호',
    businessName: '업소명',
    bankName: '은행명',
    accountNumber: '계좌번호',
    accountHolder: '예금주',
    title: '문서명',
    issuingOrg: '발급기관',
    summary: '요약',
  };

  return (
    <div className="mt-3 bg-teal-950/40 border border-teal-500/30 rounded-xl p-3">
      <p className="text-teal-400 text-xs font-semibold mb-2 flex items-center gap-1">
        <Sparkles className="w-3 h-3" /> AI 분석 결과
      </p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        {entries.map(([k, v]) => (
          <div key={k} className="text-xs">
            <span className="text-slate-500">{LABELS[k] || k}: </span>
            <span className="text-slate-200">{String(v)}</span>
          </div>
        ))}
      </div>
      {canApply && Object.values(applyData).some(Boolean) && (
        <button
          onClick={() => onApply?.(applyData)}
          className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 bg-teal-600/40 hover:bg-teal-600/60 border border-teal-500/40 text-teal-300 text-xs font-semibold rounded-lg transition-colors"
        >
          <CheckCircle className="w-3.5 h-3.5" />
          이 정보로 매장 기본 정보 업데이트
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────
// 문서 유형 섹션
// ─────────────────────────────────────────
function DocTypeSection({
  typeConfig,
  documents,
  storeId,
  onUpload,
  onDelete,
  onAnalyze,
  onApplyStoreInfo,
}: {
  typeConfig: (typeof DOC_TYPES)[number];
  documents: StoreDocument[];
  storeId: string;
  onUpload: () => void;
  onDelete: (docId: string) => void;
  onAnalyze: (docId: string) => void;
  onApplyStoreInfo?: (data: ApplyData) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const { id, label, icon: Icon, color, hasExpiry, desc } = typeConfig;
  const iconBg = ICON_BG[color];
  const borderColor = BORDER_COLOR[color];

  const latestDoc = documents[0] ?? null;
  const days = daysUntil(latestDoc?.expiryDate ?? null);
  const status = expiryStatus(days);

  const statusBadge = () => {
    if (!latestDoc) return null;
    if (!hasExpiry || !latestDoc.expiryDate) return (
      <span className="flex items-center gap-1 text-xs text-green-400 bg-green-900/30 border border-green-500/30 px-2 py-0.5 rounded-full">
        <CheckCircle className="w-3 h-3" /> 등록됨
      </span>
    );
    if (status === 'expired') return (
      <span className="flex items-center gap-1 text-xs text-red-400 bg-red-900/30 border border-red-500/30 px-2 py-0.5 rounded-full">
        <AlertTriangle className="w-3 h-3" /> 만료됨
      </span>
    );
    if (status === 'critical') return (
      <span className="flex items-center gap-1 text-xs text-red-400 bg-red-900/30 border border-red-500/30 px-2 py-0.5 rounded-full">
        <AlertTriangle className="w-3 h-3" /> D-{days}일
      </span>
    );
    if (status === 'warning') return (
      <span className="flex items-center gap-1 text-xs text-yellow-400 bg-yellow-900/30 border border-yellow-500/30 px-2 py-0.5 rounded-full">
        <Clock className="w-3 h-3" /> D-{days}일
      </span>
    );
    return (
      <span className="flex items-center gap-1 text-xs text-green-400 bg-green-900/30 border border-green-500/30 px-2 py-0.5 rounded-full">
        <CheckCircle className="w-3 h-3" /> {latestDoc.expiryDate}
      </span>
    );
  };

  const handleAnalyze = async (docId: string) => {
    setAnalyzingId(docId);
    try { await onAnalyze(docId); } finally { setAnalyzingId(null); }
  };

  const handleDownload = async (doc: StoreDocument) => {
    setDownloadingId(doc.docId);
    try {
      await downloadFile(doc.fileUrl, doc.fileName || doc.docName);
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className={`bg-slate-900 border ${latestDoc ? borderColor : 'border-slate-700'} rounded-xl overflow-hidden`}>
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl ${iconBg}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <p className="text-white font-semibold text-sm">{label}</p>
            <p className="text-slate-500 text-xs">
              {latestDoc
                ? `${documents.length}개 등록됨`
                : desc}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {statusBadge()}
          {!latestDoc && (
            <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">미등록</span>
          )}
          <button
            onClick={onUpload}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-300 text-xs rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            {latestDoc ? '추가' : '업로드'}
          </button>
          {documents.length > 0 && (
            <button onClick={() => setExpanded(v => !v)} className="text-slate-500 hover:text-white transition-colors">
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      {expanded && documents.length > 0 && (
        <div className="border-t border-slate-800 p-4 space-y-3">
          {documents.map(doc => (
            <div key={doc.docId} className="bg-slate-800 rounded-xl p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-white text-sm font-medium truncate">{doc.docName || doc.fileName}</p>
                  <p className="text-slate-500 text-xs mt-0.5">
                    {doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString('ko-KR') : ''}
                    {' · '}
                    <span className="text-slate-600">{doc.fileName}</span>
                  </p>
                  {doc.issueDate && (
                    <p className="text-slate-400 text-xs">발급일: {doc.issueDate}</p>
                  )}
                  {doc.expiryDate && (
                    <p className={`text-xs ${
                      expiryStatus(daysUntil(doc.expiryDate)) === 'expired' ? 'text-red-400' :
                      expiryStatus(daysUntil(doc.expiryDate)) === 'critical' ? 'text-red-400' :
                      expiryStatus(daysUntil(doc.expiryDate)) === 'warning' ? 'text-yellow-400' :
                      'text-slate-400'
                    }`}>
                      만료: {doc.expiryDate}
                      {daysUntil(doc.expiryDate) !== null && daysUntil(doc.expiryDate)! < 60 && (
                        <span className="ml-1">
                          ({daysUntil(doc.expiryDate)! < 0 ? '만료됨' : `D-${daysUntil(doc.expiryDate)}`})
                        </span>
                      )}
                    </p>
                  )}
                  {doc.notes && (
                    <p className="text-slate-500 text-xs mt-1 italic">{doc.notes}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {/* 파일 보기 */}
                  <a
                    href={doc.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 text-slate-400 hover:text-teal-400 hover:bg-slate-700 rounded-lg transition-colors"
                    title="새 탭에서 보기"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  {/* 다운로드 */}
                  <button
                    onClick={() => handleDownload(doc)}
                    disabled={downloadingId === doc.docId}
                    className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
                    title="다운로드"
                  >
                    {downloadingId === doc.docId
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Download className="w-4 h-4" />
                    }
                  </button>
                  {/* AI 재분석 */}
                  <button
                    onClick={() => handleAnalyze(doc.docId)}
                    disabled={analyzingId === doc.docId}
                    className="p-1.5 text-slate-400 hover:text-teal-400 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
                    title="AI 재분석"
                  >
                    {analyzingId === doc.docId
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Sparkles className="w-4 h-4" />
                    }
                  </button>
                  {/* 삭제 */}
                  <button
                    onClick={() => onDelete(doc.docId)}
                    className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"
                    title="삭제"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {doc.extractedData && (
                <ExtractedDataCard
                  extracted={doc.extractedData}
                  docType={doc.docType}
                  onApply={doc.docType === 'business_registration' ? onApplyStoreInfo : undefined}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────
export default function StoreDocuments({ storeId, onApplyStoreInfo }: Props) {
  const [documents, setDocuments] = useState<StoreDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadModal, setUploadModal] = useState<{ typeId: string; typeLabel: string } | null>(null);
  const [alerts, setAlerts] = useState<{ docId: string; label: string; days: number }[]>([]);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/store/documents?storeId=${storeId}`, { headers });
      const data = await res.json();
      if (res.ok) setDocuments(data.documents || []);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  // 갱신 알림 계산
  useEffect(() => {
    const newAlerts: typeof alerts = [];
    for (const doc of documents) {
      if (!doc.expiryDate) continue;
      const days = daysUntil(doc.expiryDate);
      if (days !== null && days <= 30) {
        const typeLabel = DOC_TYPES.find(t => t.id === doc.docType)?.label || doc.docType;
        newAlerts.push({ docId: doc.docId, label: `${typeLabel} (${doc.docName || doc.fileName})`, days });
      }
    }
    setAlerts(newAlerts);
  }, [documents]);

  const handleUploaded = (newDoc: StoreDocument, extracted: Record<string, any> | null) => {
    setDocuments(prev => [newDoc, ...prev]);
  };

  const handleDelete = async (docId: string) => {
    if (!confirm('이 서류를 삭제하시겠습니까?')) return;
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/store/documents?docId=${docId}`, { method: 'DELETE', headers });
    if (res.ok) setDocuments(prev => prev.filter(d => d.docId !== docId));
  };

  const handleAnalyze = async (docId: string) => {
    const headers = await getAuthJsonHeaders();
    const res = await fetch('/api/store/documents/analyze', {
      method: 'POST',
      headers,
      body: JSON.stringify({ docId }),
    });
    if (res.ok) {
      const { extracted } = await res.json();
      if (extracted) {
        setDocuments(prev =>
          prev.map(d => d.docId === docId ? { ...d, extractedData: extracted } : d)
        );
      }
    }
  };

  const docsForType = (typeId: string) =>
    documents
      .filter(d => d.docType === typeId)
      .sort((a, b) => new Date(b.uploadedAt || 0).getTime() - new Date(a.uploadedAt || 0).getTime());

  const activeAlerts = alerts.filter(a => !dismissedAlerts.has(a.docId));

  return (
    <div className="space-y-4">
      {/* 갱신 알림 배너 */}
      {activeAlerts.length > 0 && (
        <div className="space-y-2">
          {activeAlerts.map(alert => (
            <div
              key={alert.docId}
              className={`flex items-start justify-between gap-3 px-4 py-3 rounded-xl border text-sm ${
                alert.days <= 0
                  ? 'bg-red-900/30 border-red-500/40 text-red-300'
                  : alert.days <= 7
                    ? 'bg-red-900/20 border-red-500/30 text-red-300'
                    : 'bg-yellow-900/20 border-yellow-500/30 text-yellow-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  <strong>{alert.label}</strong>
                  {alert.days <= 0
                    ? ' — 만료되었습니다. 갱신이 필요합니다.'
                    : ` — ${alert.days}일 후 만료됩니다.`}
                </span>
              </div>
              <button onClick={() => setDismissedAlerts(p => new Set([...p, alert.docId]))}>
                <X className="w-4 h-4 shrink-0 opacity-60 hover:opacity-100" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <p className="text-slate-400 text-sm">
          {loading ? '불러오는 중...' : `${documents.length}개 서류 등록됨`}
        </p>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1 text-xs text-slate-500 hover:text-teal-400 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          새로고침
        </button>
      </div>

      {/* 문서 유형별 카드 */}
      <div className="space-y-3">
        {DOC_TYPES.map(typeConfig => (
          <DocTypeSection
            key={typeConfig.id}
            typeConfig={typeConfig}
            documents={docsForType(typeConfig.id)}
            storeId={storeId}
            onUpload={() => setUploadModal({ typeId: typeConfig.id, typeLabel: typeConfig.label })}
            onDelete={handleDelete}
            onAnalyze={handleAnalyze}
            onApplyStoreInfo={onApplyStoreInfo}
          />
        ))}
      </div>

      {/* 업로드 모달 */}
      {uploadModal && (
        <UploadModal
          docTypeId={uploadModal.typeId}
          docTypeLabel={uploadModal.typeLabel}
          storeId={storeId}
          onClose={() => setUploadModal(null)}
          onUploaded={handleUploaded}
        />
      )}
    </div>
  );
}
