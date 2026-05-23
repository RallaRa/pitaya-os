'use client';

import { useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useStore } from '@/context/StoreContext';
import {
  ShoppingCart, Upload, X, FileSpreadsheet, Send,
  CheckCircle, Loader2, Save, AlertCircle,
} from 'lucide-react';

interface PurchaseItem {
  name: string;
  qty: number;
  unit: string;
  unitPrice: number;
  supplyAmount: number;
  taxAmount: number;
}

interface PurchaseData {
  purchaseDate: string;
  supplierName: string;
  invoiceNumber: string;
  items: PurchaseItem[];
  supplyAmount: number;
  taxAmount: number;
  totalAmount: number;
  memo: string;
}

const fmt = (n: number) => n?.toLocaleString('ko-KR') ?? '0';

export default function PurchaseInputPage() {
  const { user } = useAuth();
  const { currentStore } = useStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; preview?: string; content: string; type: string } | null>(null);
  const [text, setText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [aiReply, setAiReply] = useState('');
  const [parsedData, setParsedData] = useState<PurchaseData | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setError('');

    const isImage = f.type.startsWith('image/');
    const isCsv = f.name.endsWith('.csv') || f.type === 'text/csv';

    const reader = new FileReader();
    reader.onloadend = () => {
      const content = reader.result as string;
      setFile({
        name: f.name,
        preview: isImage ? content : undefined,
        content,
        type: isImage ? 'image' : isCsv ? 'csv' : 'excel',
      });
    };
    if (isCsv) {
      reader.readAsText(f);
    } else {
      reader.readAsDataURL(f);
    }
  };

  const handleAnalyze = async () => {
    if (!file && !text.trim()) return;
    setIsLoading(true);
    setAiReply('');
    setParsedData(null);
    setSaved(false);
    setError('');

    try {
      const res = await fetch('/api/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileContent: file?.content,
          fileName: file?.name,
          fileType: file?.type,
          text: text.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.text) setAiReply(data.text);
      if (data.parsedData) setParsedData(data.parsedData);
      if (!data.parsedData && data.text?.startsWith('⚠️')) setError(data.text);
    } catch {
      setError('⚠️ 네트워크 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!parsedData || !user?.uid || !currentStore?.storeId) return;
    setIsSaving(true);
    try {
      const res = await fetch('/api/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          extractedData: parsedData,
          uid: user.uid,
          storeId: currentStore.storeId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSaved(true);
        setFile(null);
        setText('');
        setParsedData(null);
        setAiReply('');
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    } catch {
      setError('⚠️ 저장 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const canAnalyze = (!!file || !!text.trim()) && !isLoading;

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 overflow-y-auto">
      <div className="max-w-3xl mx-auto w-full p-6 md:p-8 space-y-6">

        {/* 헤더 */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-teal-900/30 border border-teal-500/30 rounded-2xl mb-4">
            <ShoppingCart className="w-7 h-7 text-teal-400" />
          </div>
          <h1 className="text-2xl font-bold text-slate-100">AI 매입관리</h1>
          <p className="text-slate-400 text-sm mt-2">
            거래명세서, 세금계산서, 매입전표를 업로드하면 AI가 자동 분석합니다
          </p>
        </div>

        {/* 저장 완료 메시지 */}
        {saved && (
          <div className="flex items-center gap-3 bg-teal-900/30 border border-teal-500/30 rounded-xl px-4 py-3">
            <CheckCircle className="w-5 h-5 text-teal-400 flex-shrink-0" />
            <p className="text-teal-300 text-sm">매입 내역이 저장되었습니다.</p>
            <button onClick={() => setSaved(false)} className="ml-auto text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* 에러 */}
        {error && (
          <div className="flex items-center gap-3 bg-red-900/20 border border-red-500/30 rounded-xl px-4 py-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}

        {/* 파일 업로드 */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full border-2 border-dashed border-slate-700 hover:border-teal-500/60
              bg-slate-900/50 hover:bg-slate-900 rounded-2xl p-8
              flex flex-col items-center gap-3 transition-colors group"
          >
            <Upload className="w-9 h-9 text-slate-500 group-hover:text-teal-400 transition-colors" />
            <span className="text-slate-400 group-hover:text-slate-300 font-medium transition-colors">
              사진 또는 파일 업로드
            </span>
            <span className="text-slate-600 text-xs">JPG, PNG, PDF, CSV, XLSX 지원</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*,.pdf,.xlsx,.xls,.csv"
            onChange={handleFileChange}
          />

          {file && (
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 flex items-center gap-4">
              {file.preview ? (
                <img src={file.preview} alt="미리보기"
                  className="w-16 h-16 object-cover rounded-lg border border-slate-700 flex-shrink-0" />
              ) : (
                <div className="w-16 h-16 bg-slate-800 rounded-lg border border-slate-700 flex items-center justify-center flex-shrink-0">
                  <FileSpreadsheet className="w-7 h-7 text-teal-400" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-slate-200 font-medium text-sm truncate">{file.name}</p>
                <p className="text-slate-500 text-xs mt-0.5">업로드 완료</p>
              </div>
              <button
                type="button"
                onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                className="text-slate-500 hover:text-slate-300 p-1 transition-colors flex-shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>

        {/* 텍스트 입력 */}
        <div>
          <p className="text-slate-400 text-xs mb-2">또는 매입 내용을 직접 입력</p>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="예) 2026-05-23 한우 도매 / 한우 등심 5kg 단가 45,000원 / 한우 갈비 3kg 단가 38,000원 / 합계 351,000원"
            rows={4}
            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-200
              placeholder:text-slate-600 text-sm resize-none focus:outline-none focus:border-teal-500/50 transition-colors"
          />
        </div>

        {/* 분석 버튼 */}
        <button
          type="button"
          onClick={handleAnalyze}
          disabled={!canAnalyze}
          className="w-full flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-500
            disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold py-3.5 rounded-xl
            transition-colors text-sm"
        >
          {isLoading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> AI 분석 중...</>
          ) : (
            <><Send className="w-4 h-4" /> AI 분석 시작</>
          )}
        </button>

        {/* AI 응답 */}
        {aiReply && !error && (
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 space-y-1">
            <p className="text-teal-400 text-xs font-semibold mb-2">AI 분석 결과</p>
            <div className="text-slate-300 text-sm whitespace-pre-wrap leading-relaxed">{aiReply}</div>
          </div>
        )}

        {/* 추출 데이터 미리보기 */}
        {parsedData && (
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 space-y-4">
            <p className="text-teal-400 text-xs font-semibold">추출된 매입 정보</p>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-slate-500 text-xs">매입일자</p>
                <p className="text-slate-200 font-medium">{parsedData.purchaseDate || '-'}</p>
              </div>
              <div>
                <p className="text-slate-500 text-xs">공급업체</p>
                <p className="text-slate-200 font-medium">{parsedData.supplierName || '-'}</p>
              </div>
              {parsedData.invoiceNumber && (
                <div className="col-span-2">
                  <p className="text-slate-500 text-xs">전표번호</p>
                  <p className="text-slate-200 font-medium">{parsedData.invoiceNumber}</p>
                </div>
              )}
            </div>

            {parsedData.items && parsedData.items.length > 0 && (
              <div>
                <p className="text-slate-500 text-xs mb-2">품목 내역</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-700">
                        <th className="text-left text-slate-400 pb-2 pr-3 font-medium">품명</th>
                        <th className="text-right text-slate-400 pb-2 pr-3 font-medium">수량</th>
                        <th className="text-right text-slate-400 pb-2 pr-3 font-medium">단가</th>
                        <th className="text-right text-slate-400 pb-2 font-medium">공급가액</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedData.items.map((item, i) => (
                        <tr key={i} className="border-b border-slate-800">
                          <td className="py-1.5 pr-3 text-slate-200">{item.name}</td>
                          <td className="py-1.5 pr-3 text-right text-slate-300">{item.qty}{item.unit}</td>
                          <td className="py-1.5 pr-3 text-right text-slate-300">{fmt(item.unitPrice)}원</td>
                          <td className="py-1.5 text-right text-slate-200">{fmt(item.supplyAmount)}원</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="border-t border-slate-700 pt-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">공급가액</span>
                <span className="text-slate-200">{fmt(parsedData.supplyAmount)}원</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">세액</span>
                <span className="text-slate-200">{fmt(parsedData.taxAmount)}원</span>
              </div>
              <div className="flex justify-between font-bold">
                <span className="text-slate-200">합계금액</span>
                <span className="text-teal-400 text-base">{fmt(parsedData.totalAmount)}원</span>
              </div>
            </div>

            {parsedData.memo && (
              <p className="text-slate-400 text-xs border-t border-slate-700 pt-3">{parsedData.memo}</p>
            )}

            <button
              onClick={handleSave}
              disabled={isSaving}
              className="w-full flex items-center justify-center gap-2 bg-teal-700 hover:bg-teal-600
                disabled:bg-slate-700 text-white font-bold py-3 rounded-xl transition-colors text-sm"
            >
              {isSaving ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> 저장 중...</>
              ) : (
                <><Save className="w-4 h-4" /> 매입 내역 저장</>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
